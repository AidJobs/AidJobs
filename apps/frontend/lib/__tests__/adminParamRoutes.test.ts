/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

// Next.js 15+ passes route params as a promise; each proxy must await it and call the right backend route.
// Some modules read the backend address when loaded, so it is set before they are imported below.
process.env.NEXT_PUBLIC_API_URL = 'http://backend.test/api';
const BACKEND = 'http://backend.test';

type Handler = (req: NextRequest, props: { params: Promise<Record<string, string>> }) => Promise<Response>;

const CASES: {
  module: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  params: Record<string, string>;
  backendPath: string;
  body?: unknown;
}[] = [
  { module: 'crawl/analytics/source/[sourceId]', method: 'GET', params: { sourceId: 'src-1' }, backendPath: '/api/admin/crawl/analytics/source/src-1' },
  { module: 'data-quality/source/[sourceId]', method: 'GET', params: { sourceId: 'src-2' }, backendPath: '/api/admin/data-quality/source/src-2' },
  { module: 'domain_policies/[host]', method: 'GET', params: { host: 'jobs.example.org' }, backendPath: '/api/admin/domain_policies/jobs.example.org' },
  { module: 'domain_policies/[host]', method: 'POST', params: { host: 'jobs.example.org' }, backendPath: '/api/admin/domain_policies/jobs.example.org', body: { max_concurrency: 1 } },
  { module: 'jobs/diagnose/[job_id]', method: 'GET', params: { job_id: 'job-3' }, backendPath: '/api/admin/jobs/diagnose/job-3' },
  { module: 'link-validation/validate-job/[job_id]', method: 'POST', params: { job_id: 'job-4' }, backendPath: '/api/admin/link-validation/validate-job/job-4' },
  { module: 'sources/[id]/export', method: 'GET', params: { id: 'src-5' }, backendPath: '/api/admin/sources/src-5/export' },
  { module: 'sources/[id]/permanent', method: 'DELETE', params: { id: 'src-6' }, backendPath: '/api/admin/sources/src-6/permanent' },
  { module: 'sources/[id]', method: 'GET', params: { id: 'src-7' }, backendPath: '/api/admin/sources/src-7' },
  { module: 'sources/[id]', method: 'PATCH', params: { id: 'src-7' }, backendPath: '/api/admin/sources/src-7', body: { status: 'paused' } },
  { module: 'sources/[id]', method: 'DELETE', params: { id: 'src-7' }, backendPath: '/api/admin/sources/src-7' },
  { module: 'sources/[id]/simulate_extract', method: 'POST', params: { id: 'src-8' }, backendPath: '/api/admin/sources/src-8/simulate_extract' },
  { module: 'sources/[id]/test', method: 'POST', params: { id: 'src-9' }, backendPath: '/api/admin/sources/src-9/test' },
];

const fetchMock = jest.fn();
const realFetch = global.fetch;

beforeAll(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } })
  );
});

describe('admin proxy routes with params', () => {
  it('covers every route the async-params change touched', () => {
    expect(new Set(CASES.map((c) => c.module)).size).toBe(10);
  });

  it.each(CASES)('$method $module calls $backendPath', async ({ module, method, params, backendPath, body }) => {
    const routes = (await import(`@/app/api/admin/${module}/route`)) as Record<string, Handler>;
    const request = new NextRequest(`http://site.test/api/admin/${module}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const response = await routes[method](request, { params: Promise.resolve(params) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe(`${BACKEND}${backendPath}`);
    expect((init?.method ?? 'GET').toUpperCase()).toBe(method);
    if (body !== undefined) expect(JSON.parse(String(init?.body))).toEqual(body);
    expect(response.status).toBe(200);
  });
});
