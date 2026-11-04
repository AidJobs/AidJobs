/**
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { ADMIN_SESSION_HEADER } from '@/lib/adminSession';

// Security plan, stage 4, pull request 1: the four public proxy routes call the backend only
// through lib/backendProxy, so neither Node's error text nor raw backend text reaches a visitor.
process.env.NEXT_PUBLIC_API_URL = 'http://backend.test/api';

const RID = 'fedcba9876543210fedcba9876543210';
const PLANTED = 'PLANTED-7q2x';
const API_ROOT = path.join(__dirname, '../../app/api');

type Route = {
  module: string;
  method: 'GET' | 'POST';
  url: string;
  backendPath: string;
  body?: string;
  errorShape: Record<string, unknown>;
};

const ROUTES: Route[] = [
  { module: 'db/status', method: 'GET', url: '/api/db/status', backendPath: '/api/db/status',
    errorShape: { status: 'error' } },
  { module: 'search/status', method: 'GET', url: '/api/search/status', backendPath: '/api/search/status',
    errorShape: { status: 'error' } },
  { module: 'search/parse', method: 'POST', url: '/api/search/parse', backendPath: '/api/search/parse',
    body: JSON.stringify({ query: `water ${PLANTED}` }), errorShape: { status: 'error', data: null } },
  { module: 'search/autocomplete', method: 'GET', url: `/api/search/autocomplete?q=wat${PLANTED}`,
    backendPath: `/api/search/autocomplete?q=wat${PLANTED}`, errorShape: { status: 'error', data: [] } },
];

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

async function call(route: Route, cookie = `aidjobs_admin_session=v1.${PLANTED}.sig; other=${PLANTED}`) {
  const handlers = (await import(`@/app/api/${route.module}/route`)) as Record<
    string, (req: NextRequest) => Promise<Response>
  >;
  const request = new NextRequest(`http://site.test${route.url}`, {
    method: route.method,
    headers: { cookie, ...(route.body ? { 'content-type': 'application/json' } : {}) },
    body: route.body,
  });
  return handlers[route.method](request);
}

describe.each(ROUTES)('$method $module', (route) => {
  it('calls its backend route without the visitor\'s cookies, and forwards the reference', async () => {
    fetchMock.mockResolvedValue(new Response('{"status":"ok","data":{"x":1}}', {
      status: 200, headers: { 'x-request-id': RID },
    }));
    const response = await call(route);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', data: { x: 1 } });
    expect(response.headers.get('x-request-id')).toBe(RID);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://backend.test${route.backendPath}`);
    const sent = new Headers(init.headers);
    expect(sent.get('cookie')).toBeNull();
    expect(sent.get(ADMIN_SESSION_HEADER)).toBeNull();
    sent.forEach((value) => expect(value).not.toContain(PLANTED));
    expect(response.headers.get('cache-control')).not.toBe('private, no-store');
  });

  it('answers 503 with fixed text when the backend cannot be reached', async () => {
    fetchMock.mockRejectedValue(Object.assign(new TypeError(`fetch failed ${PLANTED}`), {
      cause: { code: 'ECONNREFUSED', message: `connect ECONNREFUSED 10.9.8.7:8000 ${PLANTED}` },
    }));
    const response = await call(route);
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ...route.errorShape, error: 'The service did not answer. Try again shortly.' });
    expect(text).not.toContain(PLANTED);
    expect(text).not.toContain('10.9.8.7');
    expect(text).not.toContain('backend.test');
  });

  it('replaces a raw HTML error page with fixed text', async () => {
    fetchMock.mockResolvedValue(new Response(`<html><body>${PLANTED} Internal Server Error</body></html>`, {
      status: 500, headers: { 'x-request-id': RID },
    }));
    const response = await call(route);
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ...route.errorShape, error: 'The service failed (HTTP 500). Try again.' });
    expect(text).not.toContain(PLANTED);
    expect(response.headers.get('x-request-id')).toBe(RID);
  });

  it('writes nothing the visitor sent into the log', async () => {
    fetchMock.mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
    await call(route);
    fetchMock.mockResolvedValue(new Response('<html></html>', { status: 500 }));
    await call(route);
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await call(route);
    expect(logged.join('\n')).not.toContain(PLANTED);
    expect(logged.join('\n')).not.toContain('wat');
    expect(logged).toHaveLength(2);
  });
});

describe('GET db/status', () => {
  it('passes the backend\'s slim answer through unchanged (security plan, stage 7)', async () => {
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200, headers: { 'x-request-id': RID } }));
    const response = await call(ROUTES[0]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe('POST search/parse', () => {
  const parse = ROUTES[2];

  it('sends only the query, as JSON', async () => {
    fetchMock.mockResolvedValue(new Response('{"status":"ok","data":{}}', { status: 200 }));
    await call({ ...parse, body: JSON.stringify({ query: 'nurse', extra: PLANTED }) });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ query: 'nurse' }));
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  it.each([[{ a: 1 }], [['x']], [42], [null]])('sends an empty query when the query is not text (%j)', async (query) => {
    fetchMock.mockResolvedValue(new Response('{"status":"ok","data":{}}', { status: 200 }));
    await call({ ...parse, body: JSON.stringify({ query }) });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ query: '' }));
  });

  it('answers 400 with fixed text for a body that is not JSON, without calling the backend', async () => {
    const response = await call({ ...parse, body: `{not json ${PLANTED}` });
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: 'error', data: null, error: 'The request body is not valid JSON.' });
    expect(text).not.toContain(PLANTED);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET search/autocomplete', () => {
  it('encodes the query, so it cannot add or cut backend parameters', async () => {
    fetchMock.mockResolvedValue(new Response('{"status":"ok","data":[]}', { status: 200 }));
    const q = 'a&size=999#/../admin?%';
    await call({ ...ROUTES[3], url: `/api/search/autocomplete?q=${encodeURIComponent(q)}` });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`http://backend.test/api/search/autocomplete?q=${encodeURIComponent(q)}`);
    expect(new URL(url).searchParams.get('q')).toBe(q);
    expect([...new URL(url).searchParams.keys()]).toEqual(['q']);
  });
});

describe('the four public route files', () => {
  const files = ROUTES.map((r) => path.join(API_ROOT, r.module, 'route.ts'));

  it.each(files.map((f) => [path.relative(API_ROOT, f), f]))(
    '%s calls the backend only through lib/backendProxy, and logs nothing itself',
    (_name, file) => {
      const text = fs.readFileSync(file as string, 'utf8');
      expect(text).toContain("from '@/lib/backendProxy'");
      expect(text).not.toMatch(/\bconsole\./);
      expect(text).not.toMatch(/\.message\b/);
      expect(text).not.toMatch(/\bfetch\s*\(/);
      expect(text).not.toMatch(/\bcookie\b/i);
    }
  );
});
