import { NextRequest, NextResponse } from 'next/server';
import { fetchAt, lookup } from '@/lib/employerDemoPage/net';
import { readPage, UNREADABLE } from '@/lib/employerDemoPage/read';

/**
 * The employer demo's page-reading route (employer-side plan, section 19, phase 5, A), beside its chat route and behind the same gate:
 * previews of `demo/employer` and local development only, never production. It reads one https page given in the website field or a
 * job's project field, never one from a chat message, and returns its visible text for the AI to draft About us or About the project
 * from. It logs a status only, never the address or the text.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BODY = 2_500;
const FIELDS = ['website', 'project'] as const;
const noStore = { 'Cache-Control': 'no-store' };

function allowed(): boolean {
  if (process.env.VERCEL_ENV === 'production') return false;
  if (process.env.VERCEL && process.env.VERCEL_GIT_COMMIT_REF !== 'demo/employer') return false;
  return true;
}

const answer = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: noStore });

export async function POST(req: NextRequest) {
  if (!allowed()) return answer({ error: 'not found' }, 404);
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return answer({ error: 'json only' }, 415);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return answer({ error: 'too large' }, 413);
  let body: { url?: unknown; field?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return answer({ error: 'bad json' }, 400);
  }
  if (typeof body?.url !== 'string' || !body.url.trim() || body.url.length > 2000) return answer({ error: 'bad address' }, 400);
  if (!FIELDS.includes(body.field as (typeof FIELDS)[number])) return answer({ error: 'only from the website or the project field' }, 400);
  const result = await readPage(body.url, { lookup, fetchAt });
  if (!result.ok) {
    console.warn(`employer demo page: not read (${result.why})`);
    return answer({ ok: false, reason: UNREADABLE });
  }
  console.warn(`employer demo page: read (${result.text.length} characters)`);
  return answer({ ok: true, text: result.text, social: result.social });
}
