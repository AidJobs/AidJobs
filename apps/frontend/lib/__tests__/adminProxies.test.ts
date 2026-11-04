/**
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { MESSAGES } from '@/lib/backendProxy';
import { ADMIN_SESSION_HEADER } from '@/lib/adminSession';

// Security plan, stage 4, pull request 2: every admin proxy route calls the backend only through
// lib/backendProxy, with the browser's session and without its cookies, and logs nothing itself.
process.env.NEXT_PUBLIC_API_URL = 'http://backend.test/api';
const BACKEND = 'http://backend.test';

const RID = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';
const PLANTED = 'PLANTED-4m8z';
const IP = '10.9.8.7';
const TOKEN = 'v1.x.y';
const ADMIN_ROOT = path.join(__dirname, '../../app/api/admin');
const SIGN_IN = ['login', 'logout', 'session'];

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Handler = (req: NextRequest, props: { params: Promise<Record<string, string>> }) => Promise<Response>;

type Case = {
  module: string;
  method: Method;
  params?: Record<string, string>;
  query?: string;
  body?: Record<string, unknown>;
  backendPath: string;
  okShape?: boolean;
};

const NOTE = `note=${PLANTED}`;

const CASES: Case[] = [
  { module: 'sources', method: 'GET', query: `?page=1&size=20&${NOTE}`, backendPath: `/api/admin/sources?page=1&size=20&${NOTE}` },
  { module: 'sources', method: 'POST', body: { name: 'Org', careers_url: `https://${PLANTED}.org` }, backendPath: '/api/admin/sources' },
  { module: 'sources/[id]', method: 'GET', params: { id: 'src-1' }, query: `?${NOTE}`, backendPath: '/api/admin/sources/src-1' },
  { module: 'sources/[id]', method: 'PATCH', params: { id: 'src-1' }, body: { status: 'paused', notes: PLANTED }, backendPath: '/api/admin/sources/src-1' },
  { module: 'sources/[id]', method: 'DELETE', params: { id: 'src-1' }, query: `?${NOTE}`, backendPath: '/api/admin/sources/src-1' },
  { module: 'sources/[id]/export', method: 'GET', params: { id: 'src-2' }, backendPath: '/api/admin/sources/src-2/export' },
  { module: 'sources/[id]/permanent', method: 'DELETE', params: { id: 'src-3' }, backendPath: '/api/admin/sources/src-3/permanent' },
  { module: 'sources/[id]/test', method: 'POST', params: { id: 'src-4' }, backendPath: '/api/admin/sources/src-4/test', okShape: true },
  { module: 'sources/[id]/simulate_extract', method: 'POST', params: { id: 'src-5' }, backendPath: '/api/admin/sources/src-5/simulate_extract', okShape: true },
  { module: 'presets/sources', method: 'GET', backendPath: '/api/admin/presets/sources' },
  { module: 'organisations', method: 'GET', backendPath: '/api/admin/organisations' },
  { module: 'setup/status', method: 'GET', backendPath: '/api/admin/setup/status' },
  { module: 'db/status', method: 'GET', backendPath: '/api/admin/db/status' },
  { module: 'search/init', method: 'POST', backendPath: '/api/admin/search/init' },
  { module: 'search/reindex', method: 'POST', backendPath: '/api/admin/search/reindex' },
  { module: 'crawl/run', method: 'POST', body: { source_id: 'src-6', note: PLANTED }, backendPath: '/api/admin/crawl/run' },
  { module: 'crawl/run_due', method: 'POST', backendPath: '/api/admin/crawl/run_due' },
  { module: 'crawl/status', method: 'GET', backendPath: '/api/admin/crawl/status' },
  { module: 'crawl/logs', method: 'GET', query: `?source_id=src-7&limit=10&${NOTE}`, backendPath: `/api/admin/crawl/logs?source_id=src-7&limit=10&${NOTE}` },
  { module: 'crawl/cleanup_expired', method: 'POST', backendPath: '/api/admin/crawl/cleanup_expired' },
  { module: 'crawl/delete-jobs-by-org', method: 'POST', query: `?org_name=Org%20${PLANTED}`, backendPath: `/api/admin/crawl/delete-jobs-by-org?org_name=Org%20${PLANTED}` },
  { module: 'crawl/run-migration', method: 'POST', backendPath: '/api/admin/crawl/run-migration' },
  { module: 'crawl/analytics/overview', method: 'GET', backendPath: '/api/admin/crawl/analytics/overview' },
  { module: 'crawl/analytics/source/[sourceId]', method: 'GET', params: { sourceId: 'src-8' }, backendPath: '/api/admin/crawl/analytics/source/src-8' },
  { module: 'data-quality/global', method: 'GET', backendPath: '/api/admin/data-quality/global' },
  { module: 'data-quality/source/[sourceId]', method: 'GET', params: { sourceId: 'src-9' }, backendPath: '/api/admin/data-quality/source/src-9' },
  { module: 'domain_policies/[host]', method: 'GET', params: { host: 'jobs.example.org' }, backendPath: '/api/admin/domain_policies/jobs.example.org' },
  { module: 'domain_policies/[host]', method: 'POST', params: { host: 'jobs.example.org' }, body: { max_concurrency: 1, note: PLANTED }, backendPath: '/api/admin/domain_policies/jobs.example.org' },
  { module: 'jobs/search', method: 'GET', query: `?query=${PLANTED}&page=1&_t=1730000000000`, backendPath: `/api/admin/jobs/search?query=${PLANTED}&page=1` },
  { module: 'jobs/impact-analysis', method: 'POST', body: { job_ids: ['job-1'], note: PLANTED }, backendPath: '/api/admin/jobs/impact-analysis' },
  { module: 'jobs/export', method: 'POST', body: { format: 'json', org_name: PLANTED }, backendPath: '/api/admin/jobs/export' },
  { module: 'jobs/restore', method: 'POST', body: { job_ids: [`job-${PLANTED}`] }, backendPath: '/api/admin/jobs/restore' },
  { module: 'jobs/delete-bulk', method: 'POST', body: { job_ids: ['job-1'], deletion_type: 'soft', deletion_reason: PLANTED, export_data: true }, backendPath: '/api/admin/jobs/delete-bulk' },
  { module: 'jobs/enrich/batch', method: 'POST', body: { job_ids: [`job-${PLANTED}`] }, backendPath: '/admin/jobs/enrich/batch' },
  { module: 'jobs/diagnose/search-vs-db', method: 'GET', backendPath: '/api/admin/jobs/diagnose/search-vs-db' },
  { module: 'jobs/diagnose/[job_id]', method: 'GET', params: { job_id: 'job-2' }, backendPath: '/api/admin/jobs/diagnose/job-2' },
  { module: 'link-validation/stats', method: 'GET', query: `?job_ids=job-1,job-2&${NOTE}`, backendPath: '/api/admin/link-validation/stats?job_ids=job-1%2Cjob-2' },
  { module: 'link-validation/validate', method: 'POST', body: { job_ids: ['job-1'], note: PLANTED }, backendPath: '/api/admin/link-validation/validate' },
  { module: 'link-validation/validate-job/[job_id]', method: 'POST', params: { job_id: 'job-3' }, backendPath: '/api/admin/link-validation/validate-job/job-3' },
  { module: 'meilisearch/sync', method: 'POST', query: `?execute=true&${NOTE}`, backendPath: '/api/admin/meilisearch/sync?execute=true' },
  { module: 'observability/test', method: 'GET', backendPath: '/api/admin/observability/test' },
  { module: 'observability/validation-errors', method: 'GET', query: `?source_id=src-10&limit=50&${NOTE}`, backendPath: `/api/admin/observability/validation-errors?source_id=src-10&limit=50&${NOTE}` },
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

async function call(c: Case, overrides: { params?: Record<string, string>; query?: string; rawBody?: string } = {}) {
  const handlers = (await import(`@/app/api/admin/${c.module}/route`)) as Record<string, Handler>;
  const rawBody = overrides.rawBody ?? (c.body === undefined ? undefined : JSON.stringify(c.body));
  const request = new NextRequest(`http://site.test/api/admin/${c.module}${overrides.query ?? c.query ?? ''}`, {
    method: c.method,
    headers: {
      cookie: `aidjobs_admin_session=${TOKEN}; other=${PLANTED}`,
      ...(rawBody === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: rawBody,
  });
  return handlers[c.method](request, { params: Promise.resolve(overrides.params ?? c.params ?? {}) });
}

/** Admin routes answer `{status, error, detail, ...}`; test and simulate add `ok: false` and no `reason`. */
function errorShape(c: Case, message: string, extra: Record<string, unknown>) {
  const shape: Record<string, unknown> = { status: 'error', error: message, detail: message, ...extra };
  if (!c.okShape) return shape;
  delete shape.reason;
  return { ok: false, ...shape };
}

function expectNothingPlanted(text: string) {
  expect(text).not.toContain(PLANTED);
  expect(text).not.toContain(IP);
  expect(text).not.toContain(TOKEN);
  expect(text).not.toContain('backend.test');
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (entry.name === 'route.ts') found.push(full);
  }
  return found;
}

describe('the table', () => {
  it('covers every handler of every admin route file except the sign-in routes', async () => {
    const found: string[] = [];
    for (const file of walk(ADMIN_ROOT)) {
      const name = path.relative(ADMIN_ROOT, path.dirname(file)).split(path.sep).join('/');
      if (SIGN_IN.includes(name)) continue;
      const handlers = (await import(`@/app/api/admin/${name}/route`)) as Record<string, unknown>;
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        if (typeof handlers[method] === 'function') found.push(`${method} ${name}`);
      }
    }
    expect(found.sort()).toEqual(CASES.map((c) => `${c.method} ${c.module}`).sort());
    expect(new Set(found.map((f) => f.split(' ')[1])).size).toBe(38);
    expect(found).toHaveLength(42);
  });
});

describe.each(CASES)('$method $module', (c) => {
  it('passes the backend\'s answer, status and reference through, with the session and no cookies', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'ok', data: { note: PLANTED } }), {
      status: 201, headers: { 'x-request-id': RID },
    }));
    const response = await call(c);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: 'ok', data: { note: PLANTED } });
    expect(response.headers.get('x-request-id')).toBe(RID);
    expect(response.headers.get('cache-control')).toBe('private, no-store');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BACKEND}${c.backendPath}`);
    expect(init.method ?? 'GET').toBe(c.method);
    const sent = new Headers(init.headers);
    expect(sent.get(ADMIN_SESSION_HEADER)).toBe(TOKEN);
    expect(sent.get('cookie')).toBeNull();
    sent.forEach((value) => expect(value).not.toContain(PLANTED));
    expect(init.redirect).toBe('manual');
    expect(init.cache).toBe('no-store');
    if (c.body === undefined) {
      expect(init.body).toBeUndefined();
    } else {
      expect(JSON.parse(String(init.body))).toEqual(c.body);
      expect(sent.get('content-type')).toBe('application/json');
    }
    expect(logged).toEqual([]);
  });

  it('answers 503 with fixed text when the backend cannot be reached', async () => {
    fetchMock.mockRejectedValue(Object.assign(new TypeError(`fetch failed ${PLANTED} ${IP}`), {
      cause: { code: 'ECONNREFUSED', message: `connect ECONNREFUSED ${IP}:8000 ${PLANTED}` },
    }));
    const response = await call(c);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const text = await response.text();
    expect(JSON.parse(text)).toEqual(errorShape(c, MESSAGES.adminUnavailable, { reason: 'unavailable' }));
    expectNothingPlanted(text);
    expectNothingPlanted(logged.join('\n'));
    expect(logged).toEqual([`[proxy] ${c.method} /api/admin/${c.module}: backend unreachable, ECONNREFUSED`]);
  });

  it('replaces a raw HTML error page with fixed text', async () => {
    fetchMock.mockResolvedValue(new Response(`<html><body>${PLANTED} at ${IP} Internal Server Error</body></html>`, {
      status: 500, headers: { 'x-request-id': RID },
    }));
    const response = await call(c);
    expect(response.status).toBe(500);
    expect(response.headers.get('x-request-id')).toBe(RID);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const text = await response.text();
    expect(JSON.parse(text)).toEqual(
      errorShape(c, 'The service failed (HTTP 500). Try again.', { request_id: RID })
    );
    expectNothingPlanted(text);
    expectNothingPlanted(logged.join('\n'));
    expect(logged).toEqual([`[proxy] ${c.method} /api/admin/${c.module}: backend 500 (ref ${RID.slice(0, 8)})`]);
  });

  it('keeps a 401 as a 401 with the backend\'s message', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'Authentication required' }), { status: 401 }));
    const response = await call(c);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(errorShape(c, 'Authentication required', {}));
    expect(logged).toEqual([`[proxy] ${c.method} /api/admin/${c.module}: backend 401`]);
  });

  it('writes nothing the admin sent or the backend answered into the log', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'ok', data: { rows: [PLANTED] } }), { status: 200 }));
    await call(c);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: `Failed ${PLANTED}` }), { status: 500 }));
    await call(c);
    fetchMock.mockRejectedValue(new TypeError(`fetch failed ${PLANTED}`));
    await call(c);
    expectNothingPlanted(logged.join('\n'));
    expect(logged).toHaveLength(2);
  });
});

describe.each(CASES.filter((c) => c.body !== undefined))('$method $module with a body that is not JSON', (c) => {
  it('answers 400 with fixed text, without calling the backend or quoting the input', async () => {
    const response = await call(c, { rawBody: `{not json ${PLANTED}` });
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: 'error', error: MESSAGES.invalidJson, detail: MESSAGES.invalidJson });
    expectNothingPlanted(text);
    expectNothingPlanted(logged.join('\n'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe.each(CASES.filter((c) => c.params))('$method $module with an id that is not a plain name', (c) => {
  it('encodes the id, so it cannot change the backend path or add a query', async () => {
    fetchMock.mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
    const [key, original] = Object.entries(c.params as Record<string, string>)[0];
    const odd = '../x?admin=1#y';
    await call(c, { params: { [key]: odd } });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${BACKEND}${c.backendPath.replace(original, encodeURIComponent(odd))}`);
    expect(new URL(url).search).toBe('');
  });

  it.each(['..', '.'])('refuses the id %j with 400, without calling the backend', async (odd) => {
    const [key] = Object.entries(c.params as Record<string, string>)[0];
    const response = await call(c, { params: { [key]: odd } });
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('query handling kept from the old routes', () => {
  const find = (name: string, method: Method = 'GET') =>
    CASES.find((c) => c.module === name && c.method === method) as Case;

  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
  });

  it('jobs/search drops only the cache-busting `_t`', async () => {
    await call(find('jobs/search'), { query: '?_t=1&status=active&query=a%26b' });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${BACKEND}/api/admin/jobs/search?status=active&query=a%26b`);
    expect(new URL(url).searchParams.get('query')).toBe('a&b');
  });

  it('jobs/search sends no query when only `_t` was given', async () => {
    await call(find('jobs/search'), { query: '?_t=1' });
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`${BACKEND}/api/admin/jobs/search`);
  });

  it('crawl/delete-jobs-by-org encodes the organisation name', async () => {
    const name = 'A&size=1#/../x';
    await call(find('crawl/delete-jobs-by-org', 'POST'), { query: `?org_name=${encodeURIComponent(name)}` });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect([...new URL(url).searchParams.entries()]).toEqual([['org_name', name]]);
  });

  it.each(['', '?org_name=', '?org_name=%20%20', '?org_name=%09'])(
    'crawl/delete-jobs-by-org answers 400 without an organisation name (%j), without calling the backend',
    async (query) => {
    const response = await call(find('crawl/delete-jobs-by-org', 'POST'), { query });
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      status: 'error', error: 'org_name parameter is required', detail: 'org_name parameter is required',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('link-validation/stats sends only `job_ids`, encoded', async () => {
    await call(find('link-validation/stats'), { query: '?job_ids=a%26b%2Cc&x=1' });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect([...new URL(url).searchParams.entries()]).toEqual([['job_ids', 'a&b,c']]);
  });

  it('link-validation/stats sends no query without `job_ids`', async () => {
    await call(find('link-validation/stats'), { query: '' });
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`${BACKEND}/api/admin/link-validation/stats`);
  });

  it.each([['?execute=true', 'true'], ['?execute=yes', 'false'], ['', 'false']])(
    'meilisearch/sync sends execute=true only when asked (%s)',
    async (query, expected) => {
      await call(find('meilisearch/sync', 'POST'), { query });
      expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`${BACKEND}/api/admin/meilisearch/sync?execute=${expected}`);
    }
  );

  it.each(['sources', 'crawl/logs', 'observability/validation-errors'])(
    '%s forwards its query re-encoded, so a value cannot add parameters',
    async (name) => {
      await call(find(name), { query: '?source_id=a%26limit%3D999' });
      const [url] = fetchMock.mock.calls[0] as [string];
      expect([...new URL(url).searchParams.entries()]).toEqual([['source_id', 'a&limit=999']]);
    }
  );
});

describe('the backend address', () => {
  const formerlyUnstripped = CASES.filter((c) =>
    ['presets/sources', 'search/init', 'search/reindex', 'crawl/run-migration'].includes(c.module)
  );

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'http://backend.test/api';
  });

  it.each(formerlyUnstripped.map((c) => [c.module, c]))(
    '%s calls the same backend route whether or not the address ends in /api',
    async (_name, c) => {
      fetchMock.mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
      const kase = c as Case;
      await call(kase);
      process.env.NEXT_PUBLIC_API_URL = 'http://backend.test';
      await call(kase);
      const urls = fetchMock.mock.calls.map((args) => (args as [string])[0]);
      expect(urls).toEqual([`${BACKEND}${kase.backendPath}`, `${BACKEND}${kase.backendPath}`]);
    }
  );
});
