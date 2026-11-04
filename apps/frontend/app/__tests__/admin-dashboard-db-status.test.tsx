import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import AdminPage from '../admin/page';

// Security plan, stage 7: the public /api/db/status answers only {ok}; the dashboard's counts and
// per-source list come from the admin route, with the admin's session.
type Recorded = { url: string; init: RequestInit | undefined };

let requests: Recorded[];
let adminDetail: unknown;
let container: HTMLDivElement;
let root: Root;

const DETAIL = {
  ok: true,
  row_counts: { jobs: 533, active_jobs: 269, sources: 3 },
  source_breakdown: [
    { source_id: 'unicef-id', org_name: 'UNICEF', job_count: 241 },
    { source_id: 'icrc-id', org_name: 'ICRC', job_count: 19 },
    { source_id: 'oxfam-id', org_name: 'Oxfam GB', job_count: 9 },
  ],
};

function reply(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

async function fakeBackend(url: string, init?: RequestInit) {
  requests.push({ url, init });
  if (url === '/api/admin/db/status') return reply(adminDetail);
  if (url === '/api/db/status') return reply({ ok: true });
  if (url === '/api/search/status') return reply({ enabled: false, error: 'Meilisearch not configured' });
  if (url === '/api/admin/crawl/status') return reply({ status: 'ok', data: { running: true, in_flight: 0, due_count: 0, locked: 0 } });
  if (url.startsWith('/api/admin/crawl/logs')) return reply({ status: 'ok', data: [] });
  return reply({ detail: 'Not found' }, 404);
}

async function render() {
  await act(async () => {
    root.render(<AdminPage />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

function databaseCard() {
  const heading = Array.from(container.querySelectorAll('h2')).find((h) => h.textContent === 'Database');
  return heading?.closest('div.bg-white') as HTMLElement | null;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  requests = [];
  adminDetail = DETAIL;
  global.fetch = jest.fn(fakeBackend) as unknown as typeof fetch;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

describe('admin dashboard database card (security stage 7)', () => {
  it('reads the counts and the per-source list from the admin route, with the session', async () => {
    await render();

    const calls = requests.filter((r) => r.url.includes('db/status'));
    expect(calls.map((r) => r.url)).toEqual(['/api/admin/db/status']);
    expect(calls[0].init).toMatchObject({ credentials: 'include', cache: 'no-store' });

    const card = databaseCard();
    expect(card).not.toBeNull();
    const text = card?.textContent ?? '';
    expect(text).toContain('533');
    expect(text).toContain('269');
    for (const [name, count] of [['UNICEF', '241'], ['ICRC', '19'], ['Oxfam GB', '9']]) {
      expect(text).toContain(name);
      expect(text).toContain(count);
    }
    expect(container.textContent).toContain('100%');
  });

  it('shows the admin route\'s own message when it refuses', async () => {
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/db/status') {
        requests.push({ url, init });
        return reply({ status: 'error', error: 'Authentication required', detail: 'Authentication required' }, 401);
      }
      return fakeBackend(url, init);
    }) as unknown as typeof fetch;
    await render();

    const text = databaseCard()?.textContent ?? '';
    expect(text).toContain('HTTP 401: Authentication required');
    expect(text).not.toContain('{');
  });
});
