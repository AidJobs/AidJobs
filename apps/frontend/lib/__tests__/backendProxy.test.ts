/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

// The address is read when the helper calls the backend; set before anything runs.
process.env.NEXT_PUBLIC_API_URL = 'http://backend.test/api';

import {
  MESSAGES,
  adminErrorBody,
  proxyToBackend,
  readJsonBody,
  statusErrorBody,
} from '@/lib/backendProxy';
import { ADMIN_SESSION_HEADER } from '@/lib/adminSession';

const RID = '0123456789abcdef0123456789abcdef';
const PLANTED = 'PLANTED-9f3k';

const fetchMock = jest.fn();
const realFetch = global.fetch;
let logged: string[] = [];

beforeAll(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = realFetch;
});
beforeEach(() => {
  fetchMock.mockReset();
  logged = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    jest.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
  }
});
afterEach(() => jest.restoreAllMocks());

function backend(body: string | null, status: number, headers: Record<string, string> = {}) {
  fetchMock.mockResolvedValue(new Response(body, { status, headers }));
}

const PUBLIC = { route: 'GET /api/test', path: '/api/test', errorBody: statusErrorBody };

async function json(response: Response) {
  return JSON.parse(await response.text());
}

describe('answers that pass through', () => {
  it('passes a JSON answer, its status, and its reference through unchanged', async () => {
    backend(JSON.stringify({ ok: true, row_counts: { jobs: 3 } }), 200, { 'x-request-id': RID });
    const response = await proxyToBackend(PUBLIC);
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ ok: true, row_counts: { jobs: 3 } });
    expect(response.headers.get('x-request-id')).toBe(RID);
    expect(logged).toEqual([]);
  });

  it('passes a JSON list through', async () => {
    backend(JSON.stringify([{ id: 1 }]), 200);
    expect(await json(await proxyToBackend(PUBLIC))).toEqual([{ id: 1 }]);
  });

  it('passes an empty answer through with its status', async () => {
    backend(null, 204);
    const response = await proxyToBackend(PUBLIC);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('forwards only a reference in the backend\'s own format', async () => {
    backend('{}', 200, { 'x-request-id': `${RID}\r\nSet-Cookie: x=1`.replace(/[\r\n]/g, ' ') });
    expect((await proxyToBackend(PUBLIC)).headers.get('x-request-id')).toBeNull();
  });
});

describe('failed answers get the backend\'s fixed message or fixed text', () => {
  it('keeps the status and the backend\'s message, in the route\'s shape', async () => {
    backend(JSON.stringify({ detail: 'Failed to delete jobs (ref 01234567)', request_id: RID }), 500,
      { 'x-request-id': RID });
    const response = await proxyToBackend(PUBLIC);
    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({ status: 'error', error: 'Failed to delete jobs (ref 01234567)' });
    expect(response.headers.get('x-request-id')).toBe(RID);
  });

  it('reads `error` when there is no `detail`', async () => {
    backend(JSON.stringify({ error: 'Database unavailable' }), 503);
    expect(await json(await proxyToBackend(PUBLIC))).toEqual({ status: 'error', error: 'Database unavailable' });
  });

  it('names a validation list instead of passing it through', async () => {
    backend(JSON.stringify({ detail: [{ loc: ['body', PLANTED], msg: PLANTED }] }), 422);
    const response = await proxyToBackend(PUBLIC);
    expect(response.status).toBe(422);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: 'error', error: MESSAGES.invalidRequest });
    expect(text).not.toContain(PLANTED);
  });

  it.each([
    [401, MESSAGES.notSignedIn],
    [404, MESSAGES.notFound],
    [422, MESSAGES.invalidRequest],
    [429, MESSAGES.tooMany],
    [500, 'The service failed (HTTP 500). Try again.'],
    [502, 'The service failed (HTTP 502). Try again.'],
  ])('replaces a non-JSON %i answer with fixed text', async (status, message) => {
    backend(`<!DOCTYPE html><html><body>${PLANTED} at 10.0.0.5</body></html>`, status);
    const response = await proxyToBackend(PUBLIC);
    expect(response.status).toBe(status);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: 'error', error: message });
    expect(text).not.toContain(PLANTED);
    expect(logged.join('\n')).not.toContain(PLANTED);
  });

  it('caps a very long backend message', async () => {
    backend(JSON.stringify({ detail: 'x'.repeat(5000) }), 500);
    const body = await json(await proxyToBackend(PUBLIC));
    expect(body.error).toHaveLength(300);
  });

  it('answers 502 when a success is not JSON', async () => {
    backend(`not json ${PLANTED}`, 200, { 'x-request-id': RID });
    const response = await proxyToBackend(PUBLIC);
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: 'error', error: MESSAGES.unreadable });
    expect(text).not.toContain(PLANTED);
    expect(response.headers.get('x-request-id')).toBe(RID);
  });

  it.each(['"just a string"', '42', 'null'])('answers 502 when a success is JSON but not an object (%s)', async (body) => {
    backend(body, 200);
    expect((await proxyToBackend(PUBLIC)).status).toBe(502);
  });
});

describe('an unreachable backend', () => {
  const unreachable = [
    () => Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNREFUSED', message: `connect ECONNREFUSED 10.1.2.3:8000 ${PLANTED}` },
    }),
    () => new TypeError(`Failed to parse URL from http://${PLANTED}.internal/api/db/status`),
    () => Object.assign(new Error(`timeout ${PLANTED}`), { name: 'AbortError' }),
    () => `a thrown string ${PLANTED}`,
  ];

  it.each(unreachable.map((make, i) => [i, make]))('gets 503 and fixed text (case %i)', async (_i, make) => {
    fetchMock.mockRejectedValue((make as () => unknown)());
    const response = await proxyToBackend(PUBLIC);
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: 'error', error: MESSAGES.unavailable });
    expect(text).not.toContain(PLANTED);
    expect(text).not.toContain('10.1.2.3');
    expect(logged.join('\n')).not.toContain(PLANTED);
    expect(logged.join('\n')).not.toContain('10.1.2.3');
    expect(logged).toHaveLength(1);
  });

  it('logs the route and the error code only', async () => {
    fetchMock.mockRejectedValue(Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 10.1.2.3:8000' },
    }));
    await proxyToBackend(PUBLIC);
    expect(logged).toEqual(['[proxy] GET /api/test: backend unreachable, ECONNREFUSED']);
  });
});

describe('what goes to the backend', () => {
  it('sends a body as JSON, labelled JSON', async () => {
    backend('{}', 200);
    await proxyToBackend({ ...PUBLIC, method: 'POST', body: { query: 'water engineer' } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://backend.test/api/test');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ query: 'water engineer' }));
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  it('sends no cookie or session on a public call, and does not follow redirects', async () => {
    backend('{}', 200);
    await proxyToBackend(PUBLIC);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get(ADMIN_SESSION_HEADER)).toBeNull();
    expect(init.credentials).toBeUndefined();
    expect(init.redirect).toBe('manual');
    expect(init.cache).toBe('no-store');
  });

  it('never logs the query string or the body, on success or failure', async () => {
    backend('{}', 200);
    await proxyToBackend({ ...PUBLIC, path: `/api/test?q=${PLANTED}`, method: 'POST', body: { q: PLANTED } });
    backend('<html></html>', 500);
    await proxyToBackend({ ...PUBLIC, path: `/api/test?q=${PLANTED}`, method: 'POST', body: { q: PLANTED } });
    expect(logged).toEqual(['[proxy] GET /api/test: backend 500']);
  });
});

describe('admin calls', () => {
  function adminRequest(token: string | undefined) {
    const headers: Record<string, string> = { cookie: `other=${PLANTED}` };
    if (token) headers.cookie += `; aidjobs_admin_session=${token}`;
    return new NextRequest('http://site.test/api/admin/x', { headers });
  }
  const ADMIN = (token?: string) => ({
    route: 'GET /api/admin/x', path: '/api/admin/x', session: adminRequest(token), errorBody: adminErrorBody,
  });

  it('carries the session header, never the browser\'s cookies, and is not cached', async () => {
    backend('{"status":"ok"}', 200);
    const response = await proxyToBackend(ADMIN('v1.abc.def'));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get(ADMIN_SESSION_HEADER)).toBe('v1.abc.def');
    expect(headers.get('cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('puts the message under both keys and the reference in the body', async () => {
    backend(JSON.stringify({ detail: 'Failed to search jobs (ref 01234567)' }), 500, { 'x-request-id': RID });
    expect(await json(await proxyToBackend(ADMIN('v1.abc.def')))).toEqual({
      status: 'error',
      error: 'Failed to search jobs (ref 01234567)',
      detail: 'Failed to search jobs (ref 01234567)',
      request_id: RID,
    });
  });

  it('says the admin service may be starting up when it cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const response = await proxyToBackend(ADMIN('v1.abc.def'));
    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({
      status: 'error', error: MESSAGES.adminUnavailable, detail: MESSAGES.adminUnavailable, reason: 'unavailable',
    });
  });
});

describe('reading the browser\'s body', () => {
  it('returns the parsed JSON', async () => {
    const req = new NextRequest('http://site.test/x', { method: 'POST', body: '{"query":"a"}' });
    expect(await readJsonBody(req, statusErrorBody)).toEqual({ ok: true, value: { query: 'a' } });
  });

  it('answers 400 with fixed text, without quoting the input', async () => {
    const req = new NextRequest('http://site.test/x', { method: 'POST', body: `{not json ${PLANTED}` });
    const result = await readJsonBody(req, statusErrorBody);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    const text = await result.response.text();
    expect(JSON.parse(text)).toEqual({ status: 'error', error: MESSAGES.invalidJson });
    expect(text).not.toContain(PLANTED);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
