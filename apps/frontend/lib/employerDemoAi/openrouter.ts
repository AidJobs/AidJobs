import type { ChatMessage, ModelResult } from './model';

/**
 * The employer demo's AI chat through OpenRouter (employer-side plan, section 19, amended 11 November 2026, after AWS refused the
 * Bedrock account): the demo-only key, two models to compare in the preview, zero data retention and no data collection on every
 * request. A plain request with the key as a bearer token, so no package is added.
 */
export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export const AI_MODELS = {
  terra: { id: 'openai/gpt-6.1-terra', label: 'GPT-6.1 Terra', reasoning: { effort: 'none' } },
  sonnet: { id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5', reasoning: { effort: 'low' } },
} as const;

export type AiModelKey = keyof typeof AI_MODELS;
export const DEFAULT_MODEL: AiModelKey = 'terra';

export function modelKeyOf(value: unknown): AiModelKey {
  return typeof value === 'string' && value in AI_MODELS ? (value as AiModelKey) : DEFAULT_MODEL;
}

const MAX_TOKENS = 6000;
const TIMEOUT_MS = 50_000;

/** OpenRouter's numeric error code only; its message could quote the request. */
async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const data = (await res.json()) as { error?: { code?: unknown } };
    return typeof data.error?.code === 'number' || typeof data.error?.code === 'string' ? `code ${String(data.error.code).slice(0, 12)}` : undefined;
  } catch {
    return undefined;
  }
}

/** One call to the chosen model. Returns its text, or the HTTP status (0 for a network error or a timeout). */
export async function callOpenRouter(messages: ChatMessage[], apiKey: string, model: AiModelKey, fetchImpl: typeof fetch = fetch): Promise<ModelResult> {
  const m = AI_MODELS[model];
  const body = JSON.stringify({
    model: m.id,
    messages,
    max_tokens: MAX_TOKENS,
    temperature: 0.3,
    reasoning: m.reasoning,
    response_format: { type: 'json_object' },
    provider: { zdr: true, data_collection: 'deny' },
  });
  try {
    const res = await fetchImpl(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'x-title': 'AidJobs employer demo' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, status: res.status, code: await errorCode(res) };
    const data = (await res.json()) as { error?: { code?: unknown }; choices?: Array<{ finish_reason?: unknown; error?: { code?: unknown }; message?: { content?: unknown } }> };
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content === 'string' && content.trim()) return { ok: true, content };
    // Why there is no text, without any of the text: the reason the model stopped and an error's number.
    const reason = typeof choice?.finish_reason === 'string' ? choice.finish_reason.slice(0, 20) : 'none';
    const err = choice?.error?.code ?? data.error?.code;
    return { ok: false, status: 502, code: `no text, finish ${reason}${typeof err === 'number' || typeof err === 'string' ? `, code ${String(err).slice(0, 12)}` : ''}` };
  } catch {
    return { ok: false, status: 0 };
  }
}
