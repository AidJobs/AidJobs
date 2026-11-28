import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const mockParams = { id: 'unicef-id' };
const mockRouter = { push: jest.fn() };

jest.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => mockRouter,
}));

import SourceDetailPage from '../admin/sources/[id]/page';

let container: HTMLDivElement;
let root: Root;

function reply(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('SourceDetailPage effective schedule display', () => {
  it('displays 12-hour UN default instead of Every 3 days for legacy crawl_frequency_days=3', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/admin/sources/unicef-id') {
        return reply({
          status: 'ok',
          data: {
            id: 'unicef-id',
            org_name: 'UNICEF',
            careers_url: 'https://jobs.unicef.org/jobs/search',
            source_type: 'html',
            org_type: 'un',
            status: 'active',
            crawl_frequency_days: 3,
            next_run_at: '2026-11-29T12:00:00Z',
            last_crawled_at: '2026-11-29T00:00:00Z',
            last_crawl_status: 'ok',
            last_crawl_message: null,
            consecutive_failures: 0,
          },
        });
      }
      if (url.startsWith('/api/admin/crawl/logs')) {
        return reply({ status: 'ok', data: [] });
      }
      return reply({ detail: 'Not found' }, 404);
    }) as unknown as typeof fetch;

    await act(async () => {
      root.render(<SourceDetailPage />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const text = container.textContent || '';
    expect(text).toContain('Base schedule');
    expect(text).toContain('Every 12 hours (UN default)');
    expect(text).not.toContain('Every 3 days');
  });

  it('displays explicit custom override when crawl_frequency_days is not legacy 3', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/admin/sources/unicef-id') {
        return reply({
          status: 'ok',
          data: {
            id: 'unicef-id',
            org_name: 'UNICEF',
            careers_url: 'https://jobs.unicef.org/jobs/search',
            source_type: 'html',
            org_type: 'un',
            status: 'active',
            crawl_frequency_days: 2,
            next_run_at: '2026-11-29T12:00:00Z',
            last_crawled_at: '2026-11-29T00:00:00Z',
            last_crawl_status: 'ok',
            last_crawl_message: null,
            consecutive_failures: 0,
          },
        });
      }
      if (url.startsWith('/api/admin/crawl/logs')) {
        return reply({ status: 'ok', data: [] });
      }
      return reply({ detail: 'Not found' }, 404);
    }) as unknown as typeof fetch;

    await act(async () => {
      root.render(<SourceDetailPage />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const text = container.textContent || '';
    expect(text).toContain('Every 2 days (custom)');
  });
});
