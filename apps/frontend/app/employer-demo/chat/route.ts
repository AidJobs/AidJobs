import { NextRequest, NextResponse } from 'next/server';
import { callModel, messagesFor, type ChatMessage, type ModelResult } from '@/lib/employerDemoAi/model';
import { AI_MODELS, callOpenRouter, DEFAULT_MODEL, modelKeyOf, type AiModelKey } from '@/lib/employerDemoAi/openrouter';
import { answerWithChecks } from '@/lib/employerDemoAi/quality';

/**
 * The employer demo's one AI route (employer-side plan, section 19, "The AI chat in the demo"), beside the demo's page rather than
 * under app/api, whose routes are all proxies to the backend (security plan, stage 4). Previews of `demo/employer` and local
 * development only, never production. The keys stay on the server and are never sent back or logged; no message text is logged.
 * GET says whether the AI is on and which models can be chosen; POST answers one message with the chosen model. OpenRouter is used
 * when its key is set; Bedrock only when its keys alone are (AWS refuses the account for now). Without keys the chat uses its rules.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BODY = 200_000;
const MAX_MESSAGE = 4000;
const noStore = { 'Cache-Control': 'no-store' };

function allowed(): boolean {
  if (process.env.VERCEL_ENV === 'production') return false;
  if (process.env.VERCEL && process.env.VERCEL_GIT_COMMIT_REF !== 'demo/employer') return false;
  return true;
}

type Provider = { name: 'openrouter'; key: string } | { name: 'bedrock'; keys: { accessKeyId: string; secretAccessKey: string } };

function provider(): Provider | null {
  const key = process.env.AIDJOBS_OPENROUTER_API_KEY;
  if (key) return { name: 'openrouter', key };
  const accessKeyId = process.env.AIDJOBS_BEDROCK_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AIDJOBS_BEDROCK_SECRET_ACCESS_KEY;
  return accessKeyId && secretAccessKey ? { name: 'bedrock', keys: { accessKeyId, secretAccessKey } } : null;
}

const answer = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: noStore });

export async function GET() {
  if (!allowed()) return answer({ error: 'not found' }, 404);
  const p = provider();
  if (!p) return answer({ ai: false });
  if (p.name === 'bedrock') return answer({ ai: true, models: [{ key: 'kimi', label: 'Kimi K2.5' }], default: 'kimi' });
  return answer({ ai: true, models: Object.entries(AI_MODELS).map(([key, m]) => ({ key, label: m.label })), default: DEFAULT_MODEL });
}

export async function POST(req: NextRequest) {
  if (!allowed()) return answer({ error: 'not found' }, 404);
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return answer({ error: 'json only' }, 415);
  const p = provider();
  if (!p) return answer({ error: 'off' }, 503);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return answer({ error: 'too large' }, 413);
  let body: { message?: unknown; context?: unknown; first?: unknown; model?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return answer({ error: 'bad json' }, 400);
  }
  const { message, context } = body ?? {};
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE) return answer({ error: 'bad message' }, 400);
  if (!context || typeof context !== 'object' || Array.isArray(context)) return answer({ error: 'bad context' }, 400);
  const started = Date.now();
  const ctx = context as Record<string, unknown>;
  const model: AiModelKey | 'kimi' = p.name === 'openrouter' ? modelKeyOf(body.model) : 'kimi';
  const call = (m: ChatMessage[]): Promise<ModelResult> => (p.name === 'openrouter' ? callOpenRouter(m, p.key, model as AiModelKey) : callModel(m, p.keys));
  const result = await answerWithChecks(call, messagesFor(ctx, message.trim(), body.first === true), ctx, message.trim());
  if (!result.ok) {
    if (result.code === 'unreadable') console.warn(`employer demo chat: the ${model} answer was not the JSON asked for (${Date.now() - started} ms)`);
    else console.warn(`employer demo chat: the ${model} call failed (status ${result.status}${result.code ? `, ${p.name} ${result.code}` : ''}, ${Date.now() - started} ms)`);
    return answer({ error: result.code === 'unreadable' ? 'unreadable' : 'failed' }, 502);
  }
  if (result.problems.length) console.warn(`employer demo chat: ${model}, ${result.problems.length} check problems, ${result.repaired ? `repaired, ${result.left.length} left` : 'not repaired'} (${Date.now() - started} ms)`);
  return answer({ ...result.turn, model });
}
