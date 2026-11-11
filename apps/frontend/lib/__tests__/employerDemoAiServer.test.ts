/** @jest-environment node */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { signRequest } from '../employerDemoAi/sigv4';
import { callModel, ENDPOINT, messagesFor, MODEL, readModelReply, SYSTEM } from '../employerDemoAi/model';
import { GET, POST } from '../../app/employer-demo/chat/route';
import { OPENROUTER_ENDPOINT } from '../employerDemoAi/openrouter';

const creds = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };
const body = '{"model":"moonshotai.kimi-k2.5","messages":[{"role":"user","content":"Say OK."}],"max_tokens":10}';

describe('signing (AWS Signature Version 4, with Node crypto)', () => {
  // The expected values were computed by botocore's SigV4Auth (the AI tests' signer) for the same request, offline, on 9 November 2026.
  const base = { method: 'POST', url: 'https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions', body, region: 'us-east-1', service: 'bedrock', headers: { 'Content-Type': 'application/json' }, now: new Date(Date.UTC(2026, 10, 9, 12, 34, 56)) };

  it('matches botocore for the mantle route', () => {
    const h = signRequest({ ...base, credentials: creds });
    expect(h['x-amz-date']).toBe('20261109T123456Z');
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261109/us-east-1/bedrock/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=701af6c8b6692f64dff5534d15aa922d9e27c2a112055f8d81825f6a168c05c8',
    );
  });

  it('matches botocore with a session token', () => {
    const h = signRequest({ ...base, credentials: { ...creds, sessionToken: 'SESSIONTOKENEXAMPLE' } });
    expect(h['x-amz-security-token']).toBe('SESSIONTOKENEXAMPLE');
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261109/us-east-1/bedrock/aws4_request, SignedHeaders=content-type;host;x-amz-date;x-amz-security-token, Signature=b8028c3386fbafb19e333fa4a8127e65a5e3b7f81023aa6b78c3288b15ae3116',
    );
  });

  it('a different body gives a different signature', () => {
    expect(signRequest({ ...base, body: `${body} `, credentials: creds }).authorization).not.toBe(signRequest({ ...base, credentials: creds }).authorization);
  });
});

describe("the model's answer", () => {
  it('reads the JSON asked for, with or without a code fence, and keeps only actions that are objects with a type', () => {
    expect(readModelReply('{"reply":" Hi ","actions":[{"type":"undo"},"x",{"no":1},[1]]}')).toEqual({ reply: 'Hi', actions: [{ type: 'undo' }] });
    expect(readModelReply('```json\n{"reply":"Hi"}\n```')).toEqual({ reply: 'Hi', actions: [] });
    expect(readModelReply('Sure! {"reply":"Hi","actions":[]} Hope that helps.')).toEqual({ reply: 'Hi', actions: [] });
    expect(readModelReply('\n<invoke name="x">\n{"reply":"Hi {there}","actions":[{"type":"undo"}]}\n</invoke> and a stray } brace')).toEqual({ reply: 'Hi {there}', actions: [{ type: 'undo' }] });
    expect(readModelReply('Thinking about {options} first... {"reply":"Done","actions":[]}')).toEqual({ reply: 'Done', actions: [] });
  });

  it('refuses anything else', () => {
    for (const bad of ['Hello there', '{"reply":""}', '{"actions":[]}', '{"reply":3}', '{broken', '[]']) expect(readModelReply(bad)).toBeNull();
  });

  it("adds the writing guide of the job's template; an organisation's own template is written to the depth of its organisation type", () => {
    const un = messagesFor({ job: { template: { key: 'un-agency' } }, org: { orgType: 'ingo' } }, 'x', false)[0].content;
    expect(un.startsWith(SYSTEM)).toBe(true);
    expect(un).toContain('UN agency format');
    expect(un).toContain('about 900 to 1400 words');
    const own = messagesFor({ job: { template: { key: 'house' } }, org: { orgType: 'ingo' } }, 'x', false)[0].content;
    expect(own).toContain("The organisation's own format: keep its headings");
    expect(own).toContain('INGO role profile');
    const local = messagesFor({ job: { template: { key: 'custom-1' } }, org: { orgType: 'ngo' } }, 'x', false)[0].content;
    expect(local).toContain('Local NGO concise');
    expect(un).toContain('A worked example in this template, for another role');
    expect(un).toContain('Education Specialist in Maiduguri');
    expect(local).not.toContain('A worked example');
  });

  it('keeps the instructions, the guide and the example before the job, so the long start of each request can be cached', () => {
    const a = messagesFor({ job: { template: { key: 'donor' } }, org: { orgType: 'ingo' }, stage: 'style' }, 'one', false);
    const b = messagesFor({ job: { template: { key: 'donor' }, facts: { title: 'Other' } }, org: { orgType: 'ingo' }, stage: 'writing' }, 'two', false);
    expect(a[0].content).toBe(b[0].content);
  });

  it('asks with the instructions, then the job as data and the message', () => {
    const m = messagesFor({ stage: 'template' }, 'Hiring a nurse', true);
    expect(m[0].content.startsWith(SYSTEM)).toBe(true);
    expect(m[0].role).toBe('system');
    expect(m[1].content).toContain('{"stage":"template"}');
    expect(m[1].content).toMatch(/first message[\s\S]*\nHiring a nurse$/);
    expect(SYSTEM).toContain('You must never invent facts: pay, allowances, benefits');
    expect(SYSTEM).toContain('Never write the organisation\'s fixed text');
  });
});

describe('the call to Bedrock', () => {
  it('posts a signed request for Kimi K2.5 to the mantle route and returns its text', async () => {
    const f = jest.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content: '{"reply":"Hi"}' } }] }), { status: 200 }));
    const out = await callModel(messagesFor({}, 'Hi', false), creds, f as unknown as typeof fetch);
    expect(out).toEqual({ ok: true, content: '{"reply":"Hi"}' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(ENDPOINT).toBe('https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/bedrock\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect(JSON.parse(String(init.body))).toMatchObject({ model: MODEL, temperature: 0.3 });
    expect(MODEL).toBe('moonshotai.kimi-k2.5');
  });

  it('returns the status when Bedrock refuses, and 0 when the network fails', async () => {
    expect(await callModel([], creds, (async () => new Response('no', { status: 403 })) as unknown as typeof fetch)).toEqual({ ok: false, status: 403 });
    const refused = new Response(JSON.stringify({ error: { message: 'Error 002: Access to Bedrock models is not allowed for this account' } }), { status: 400 });
    expect(await callModel([], creds, (async () => refused) as unknown as typeof fetch)).toEqual({ ok: false, status: 400, code: 'Error 002' });
    expect(await callModel([], creds, (async () => Promise.reject(new Error('down'))) as unknown as typeof fetch)).toEqual({ ok: false, status: 0 });
  });
});

describe('the route', () => {
  const saved = { ...process.env };
  const post = (data: unknown, type = 'application/json') => POST(new NextRequest('http://localhost/employer-demo/chat', { method: 'POST', headers: { 'content-type': type }, body: typeof data === 'string' ? data : JSON.stringify(data) }));
  const turn = { message: 'Hiring a nurse in Juba', first: true, context: { stage: 'template' } };
  let warn: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    for (const k of ['AIDJOBS_OPENROUTER_API_KEY', 'AIDJOBS_BEDROCK_ACCESS_KEY_ID', 'AIDJOBS_BEDROCK_SECRET_ACCESS_KEY', 'VERCEL', 'VERCEL_ENV', 'VERCEL_GIT_COMMIT_REF']) delete process.env[k];
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...saved };
    warn.mockRestore();
    jest.restoreAllMocks();
  });
  const withKeys = () => {
    process.env.AIDJOBS_BEDROCK_ACCESS_KEY_ID = 'AKIDTEST';
    process.env.AIDJOBS_BEDROCK_SECRET_ACCESS_KEY = 'secret-for-the-test';
  };

  it('says the AI is off without keys, and on with them; never sends a key back', async () => {
    expect(await (await GET()).json()).toEqual({ ai: false });
    expect((await post(turn)).status).toBe(503);
    withKeys();
    const res = await GET();
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ai: true, models: [{ key: 'kimi', label: 'Kimi K2.5' }], default: 'kimi' });
    expect(text).not.toContain('AKIDTEST');
  });

  it('prefers OpenRouter when its key is set, and offers both models', async () => {
    withKeys();
    process.env.AIDJOBS_OPENROUTER_API_KEY = 'sk-or-test-key';
    const text = await (await GET()).text();
    expect(JSON.parse(text)).toEqual({ ai: true, models: [{ key: 'terra', label: 'GPT-6.1 Terra' }, { key: 'sonnet', label: 'Claude Sonnet 5.5' }], default: 'terra' });
    expect(text).not.toContain('sk-or-test-key');
  });

  it('sends the chosen model with zero data retention and no data collection, and says which model answered', async () => {
    process.env.AIDJOBS_OPENROUTER_API_KEY = 'sk-or-test-key';
    const reply = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"reply":"Hello","actions":[]}' } }] }), { status: 200 });
    const f = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => reply());
    expect(await (await post({ ...turn, model: 'sonnet' })).json()).toEqual({ reply: 'Hello', actions: [], model: 'sonnet' });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(OPENROUTER_ENDPOINT);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-or-test-key');
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'anthropic/claude-sonnet-5.5', response_format: { type: 'json_object' }, provider: { zdr: true, data_collection: 'deny' }, reasoning: { effort: 'low' } });
    expect(await (await post({ ...turn, model: 'gpt-99' })).json()).toMatchObject({ model: 'terra' });
    expect(JSON.parse(String((f.mock.calls[1][1] as RequestInit).body))).toMatchObject({ model: 'openai/gpt-6.1-terra', reasoning: { effort: 'none' } });
    f.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 429, message: 'Rate limited for the request about a nurse' } }), { status: 429 }));
    expect((await post(turn)).status).toBe(502);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('the terra call failed (status 429, openrouter code 429');
    expect(logged).not.toContain('nurse');
    expect(logged).not.toContain('sk-or-test-key');
  });

  it('is not there in production, or on Vercel for any branch but demo/employer', async () => {
    withKeys();
    process.env.VERCEL_ENV = 'production';
    expect((await GET()).status).toBe(404);
    expect((await post(turn)).status).toBe(404);
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL = '1';
    process.env.VERCEL_GIT_COMMIT_REF = 'main';
    expect((await GET()).status).toBe(404);
    process.env.VERCEL_GIT_COMMIT_REF = 'demo/employer';
    expect((await GET()).status).toBe(200);
  });

  it('takes JSON only, with a message and a context, within size limits', async () => {
    withKeys();
    expect((await post(turn, 'text/plain')).status).toBe(415);
    expect((await post('{nope')).status).toBe(400);
    expect((await post({ ...turn, message: '' })).status).toBe(400);
    expect((await post({ ...turn, message: 'x'.repeat(4001) })).status).toBe(400);
    expect((await post({ ...turn, context: [1] })).status).toBe(400);
    expect((await post({ ...turn, context: { pad: 'x'.repeat(200_001) } })).status).toBe(413);
  });

  it("returns the model's reply and actions; on a failure, logs the status only, never the message", async () => {
    withKeys();
    const f = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"reply":"Hello","actions":[{"type":"ask","quick":["Yes"]}]}' } }] }), { status: 200 }));
    const ok = await post(turn);
    expect(await ok.json()).toEqual({ reply: 'Hello', actions: [{ type: 'ask', quick: ['Yes'] }], model: 'kimi' });
    expect(f.mock.calls[0][0]).toBe(ENDPOINT);
    expect(String((f.mock.calls[0][1] as RequestInit).body)).toContain('Hiring a nurse in Juba');
    f.mockResolvedValueOnce(new Response('denied', { status: 403 }));
    expect((await post(turn)).status).toBe(502);
    f.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'validation_error', message: 'Error 002: Access refused for the request about a nurse' } }), { status: 400 }));
    expect((await post(turn)).status).toBe(502);
    f.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'Not JSON at all' } }] }), { status: 200 }));
    expect((await post(turn)).status).toBe(502);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('status 403');
    expect(logged).toContain('status 400, bedrock Error 002');
    expect(logged).not.toContain('Access refused');
    expect(logged).not.toContain('nurse');
    expect(logged).not.toContain('Not JSON');
    expect(logged).not.toContain('secret-for-the-test');
  });
});
