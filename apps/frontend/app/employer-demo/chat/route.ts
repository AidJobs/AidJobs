import { NextRequest, NextResponse } from 'next/server';
import { callModel, messagesFor, readModelReply } from '@/lib/employerDemoAi/model';

/**
 * The employer demo's one AI route (employer-side plan, section 19, "The AI chat in the demo"), beside the demo's page rather than
 * under app/api, whose routes are all proxies to the backend (security plan, stage 4). Previews of `demo/employer` and local
 * development only, never production. The keys stay on the server and are never sent back or logged; no message text is logged.
 * GET says whether the AI is on; POST answers one message. Without keys the demo's chat uses its rules.
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

function credentials() {
  const accessKeyId = process.env.AIDJOBS_BEDROCK_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AIDJOBS_BEDROCK_SECRET_ACCESS_KEY;
  return accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : null;
}

const answer = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: noStore });

export async function GET() {
  if (!allowed()) return answer({ error: 'not found' }, 404);
  return answer({ ai: Boolean(credentials()) });
}

export async function POST(req: NextRequest) {
  if (!allowed()) return answer({ error: 'not found' }, 404);
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return answer({ error: 'json only' }, 415);
  const keys = credentials();
  if (!keys) return answer({ error: 'off' }, 503);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return answer({ error: 'too large' }, 413);
  let body: { message?: unknown; context?: unknown; first?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return answer({ error: 'bad json' }, 400);
  }
  const { message, context } = body ?? {};
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE) return answer({ error: 'bad message' }, 400);
  if (!context || typeof context !== 'object' || Array.isArray(context)) return answer({ error: 'bad context' }, 400);
  const started = Date.now();
  const result = await callModel(messagesFor(context as Record<string, unknown>, message.trim(), body.first === true), keys);
  if (!result.ok) {
    console.warn(`employer demo chat: the model call failed (status ${result.status}${result.code ? `, Bedrock ${result.code}` : ''}, ${Date.now() - started} ms)`);
    return answer({ error: 'failed' }, 502);
  }
  const turn = readModelReply(result.content);
  if (!turn) {
    console.warn(`employer demo chat: the model's answer was not the JSON asked for (${Date.now() - started} ms)`);
    return answer({ error: 'unreadable' }, 502);
  }
  return answer(turn);
}
