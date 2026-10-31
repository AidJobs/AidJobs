import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const mockToasts: string[] = [];
jest.mock('sonner', () => {
  const record = (message: string) => {
    mockToasts.push(message);
  };
  return { toast: Object.assign(record, { success: record, error: record, info: record, warning: record }) };
});
jest.mock('@/components/DataQualityBadge', () => ({ __esModule: true, default: () => null }));

import JobManagementPage from '../admin/jobs/page';

type Recorded = { url: string; method: string; body: Record<string, unknown> | undefined };

let listed: string[];
let requests: Recorded[];
let container: HTMLDivElement;
let root: Root;

function job(id: string) {
  return {
    id,
    title: `Job ${id}`,
    org_name: 'Org',
    location_raw: null,
    country_iso: null,
    level_norm: null,
    deadline: null,
    apply_url: null,
    status: 'active',
    source_id: null,
    source: null,
    created_at: '2026-10-30T00:00:00Z',
    fetched_at: null,
    deleted_at: null,
    deleted_by: null,
    deletion_reason: null,
    data_quality_score: null,
    data_quality_issues: null,
    quality_score: null,
    quality_grade: null,
    quality_issues: null,
    needs_review: null,
    latitude: null,
    longitude: null,
    is_remote: null,
    geocoding_source: null,
  };
}

function reply(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

async function fakeBackend(url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET';
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  requests.push({ url, method, body });
  if (url.startsWith('/api/admin/jobs/search')) {
    return reply({ status: 'ok', data: { items: listed.map(job), total: listed.length, page: 1, size: 50, pages: 1 } });
  }
  if (url === '/api/admin/jobs/impact-analysis') {
    const n = (body?.job_ids as string[]).length;
    return reply({ status: 'ok', data: { total_jobs: n, active_jobs: n, deleted_jobs: 0, shortlists_count: 0, risk_level: 'low' } });
  }
  if (url === '/api/admin/jobs/delete-bulk') {
    const ids = body?.job_ids as string[];
    return reply({ status: 'ok', data: { deleted_count: ids.length, deleted_ids: ids, message: 'recorded' } });
  }
  return reply({ detail: 'Not found' }, 404);
}

async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function click(element: Element | null | undefined) {
  if (!element) throw new Error('element not found');
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await wait(20);
}

async function typeInto(element: Element | null | undefined, value: string) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) throw new Error('field not found');
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function rowCheckbox(id: string) {
  const row = Array.from(container.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes(`Job ${id}`));
  return row?.querySelector('input[type="checkbox"]');
}

function button(label: string) {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
}

const byLabel = (label: string) => container.querySelector(`[aria-label="${label}"]`);
const sent = (url: string) => requests.filter((r) => r.url === url).map((r) => r.body);

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockToasts.length = 0;
  listed = ['a', 'b', 'c'];
  requests = [];
  global.fetch = jest.fn(fakeBackend) as unknown as typeof fetch;

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<JobManagementPage />);
  });
  // The first load and the 500 ms debounced reload.
  await wait(700);
});

afterEach(async () => {
  // Let the 300 ms reload after a delete finish before unmounting.
  await wait(400);
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

describe('admin bulk delete (W-45)', () => {
  it('never sends a selected job that left the list after Refresh', async () => {
    await click(rowCheckbox('a'));
    await click(rowCheckbox('b'));

    listed = ['b', 'c'];
    await click(byLabel('Refresh jobs'));
    expect(mockToasts).toContain('1 selected job is no longer shown and was removed from your selection.');
    expect(container.textContent).toContain('1 job selected');

    await click(byLabel('Delete selected jobs'));
    await click(button('Analyze Impact'));
    await click(button('Soft Delete'));

    expect(sent('/api/admin/jobs/impact-analysis')).toEqual([{ job_ids: ['b'] }]);
    expect(sent('/api/admin/jobs/delete-bulk')).toEqual([
      { job_ids: ['b'], deletion_type: 'soft', export_data: false, dry_run: false },
    ]);
  });

  it('deletes nothing when the selection changes after the impact was analysed', async () => {
    await click(rowCheckbox('a'));
    await click(rowCheckbox('b'));
    await click(byLabel('Delete selected jobs'));
    await click(button('Analyze Impact'));
    expect(sent('/api/admin/jobs/impact-analysis')).toEqual([{ job_ids: ['a', 'b'] }]);

    // A reload finishing while the delete window is open.
    listed = ['b', 'c'];
    await click(byLabel('Refresh jobs'));
    await click(button('Soft Delete'));

    expect(sent('/api/admin/jobs/delete-bulk')).toEqual([]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Nothing was deleted');
    expect(button('Analyze Impact')).toBeDefined();

    await click(button('Analyze Impact'));
    await click(button('Soft Delete'));
    expect(sent('/api/admin/jobs/impact-analysis')).toEqual([{ job_ids: ['a', 'b'] }, { job_ids: ['b'] }]);
    expect(sent('/api/admin/jobs/delete-bulk')).toEqual([
      { job_ids: ['b'], deletion_type: 'soft', export_data: false, dry_run: false },
    ]);
  });

  it('asks a Hard Delete to confirm the number of jobs actually sent', async () => {
    await click(rowCheckbox('a'));
    await click(rowCheckbox('b'));
    await click(rowCheckbox('c'));

    listed = ['a', 'b'];
    await click(byLabel('Refresh jobs'));
    await click(byLabel('Delete selected jobs'));
    await click(container.querySelector('input[name="deletionType"][value="hard"]'));
    expect(container.textContent).toContain('2 jobs will be removed permanently');

    await click(button('Analyze Impact'));
    await typeInto(container.querySelector('textarea'), 'duplicates');
    await typeInto(container.querySelector('input[inputmode="numeric"]'), '3');
    expect(button('Hard Delete')?.disabled).toBe(true);
    await typeInto(container.querySelector('input[inputmode="numeric"]'), '2');
    await click(button('Hard Delete'));

    expect(sent('/api/admin/jobs/delete-bulk')).toEqual([
      { job_ids: ['a', 'b'], deletion_type: 'hard', deletion_reason: 'duplicates', export_data: false, dry_run: false },
    ]);
  });
});
