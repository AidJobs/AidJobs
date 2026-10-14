import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import HomeClient from '@/app/HomeClient';
import CollectionClient from '@/app/collections/[slug]/CollectionClient';

const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useParams: () => ({ slug: 'un-jobs' }),
}));

jest.mock('next/link', () => {
  return function NextLink({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) {
    return <a href={href}>{children}</a>;
  };
});

type FetchResult = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function jsonResponse(body: unknown, ok = true, status = 200): FetchResult {
  return {
    ok,
    status,
    json: async () => body,
  };
}

const capabilities = {
  search: true,
  cv: false,
  payments: false,
  findearn: false,
};

const facets = {
  enabled: true,
  facets: {
    country: { Kenya: 2 },
    level_norm: {},
    mission_tags: {},
    international_eligible: {},
  },
};

function searchBody(items: Array<{ id: string; org_name: string; title: string }>) {
  return {
    status: 'ok',
    data: {
      items,
      total: items.length,
      page: 1,
      size: 20,
      source: 'meili',
    },
    error: null,
    request_id: 'test',
  };
}

function queryUrls(): string[] {
  return (global.fetch as jest.Mock).mock.calls
    .map((call) => String(call[0]))
    .filter((url) => url.startsWith('/api/search/query'));
}

function installFetch(handler: (url: string) => Promise<FetchResult> | FetchResult) {
  global.fetch = jest.fn((input: RequestInfo) => {
    const url = String(input);
    return Promise.resolve(handler(url));
  }) as jest.Mock;
}

describe('Home search states', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    localStorage.clear();
  });

  it('shows a finished empty state from one query request', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/capabilities')) return jsonResponse(capabilities);
      if (url.startsWith('/api/search/facets')) return jsonResponse(facets);
      if (url.startsWith('/api/search/query')) return jsonResponse(searchBody([]));
      return jsonResponse({});
    });

    render(<HomeClient />);

    expect(await screen.findByText('No jobs found')).toBeTruthy();
    expect(screen.queryByText('Loading jobs...')).toBeNull();
    expect(queryUrls()).toHaveLength(1);
    expect(queryUrls()[0]).not.toContain('impact_domain');
    expect(queryUrls()[0]).not.toContain('functional_role');
    expect(queryUrls()[0]).not.toContain('experience_level');
    expect(queryUrls()[0]).not.toContain('work_modality');
  });

  it('keeps listed jobs visible when a follow-up search fails', async () => {
    let queryCount = 0;
    let resolveFailure: ((value: FetchResult) => void) | undefined;
    installFetch((url) => {
      if (url.startsWith('/api/capabilities')) return jsonResponse(capabilities);
      if (url.startsWith('/api/search/facets')) return jsonResponse(facets);
      if (url.startsWith('/api/search/query')) {
        queryCount += 1;
        if (queryCount === 1) {
          return jsonResponse(searchBody([
            { id: '1', org_name: 'UNICEF', title: 'Programme Officer' },
          ]));
        }
        return new Promise<FetchResult>((resolve) => {
          resolveFailure = resolve;
        });
      }
      return jsonResponse({});
    });

    render(<HomeClient />);

    expect(await screen.findByText('Programme Officer')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Kenya/ }));

    expect(await screen.findByText('Searching...')).toBeTruthy();
    expect(screen.getByText('Programme Officer')).toBeTruthy();
    expect(queryUrls()).toHaveLength(2);
    expect(queryUrls()[1]).toContain('country=Kenya');
    expect(queryUrls()[1]).not.toContain('impact_domain');

    await act(async () => {
      resolveFailure?.(jsonResponse({ error: 'nope' }, false, 500));
    });

    expect((await screen.findByRole('alert')).textContent).toBe('Search failed.');
    expect(screen.getByText('Programme Officer')).toBeTruthy();
    expect(screen.getByText('1 role')).toBeTruthy();
    expect(screen.queryByText('Searching...')).toBeNull();
    expect(screen.queryByText('Loading jobs...')).toBeNull();
  });

  it('ignores a stale response from an older search', async () => {
    const pending: Array<(value: FetchResult) => void> = [];
    installFetch((url) => {
      if (url.startsWith('/api/capabilities')) return jsonResponse(capabilities);
      if (url.startsWith('/api/search/facets')) return jsonResponse(facets);
      if (url.startsWith('/api/search/query')) {
        return new Promise<FetchResult>((resolve) => {
          pending.push(resolve);
        });
      }
      return jsonResponse({});
    });

    render(<HomeClient />);

    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.click(await screen.findByRole('button', { name: /Kenya/ }));
    await waitFor(() => expect(pending).toHaveLength(2));

    await act(async () => {
      pending[0](jsonResponse(searchBody([
        { id: 'stale', org_name: 'Org', title: 'Stale role' },
      ])));
    });

    expect(screen.queryByText('Stale role')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();

    await act(async () => {
      pending[1](jsonResponse(searchBody([
        { id: 'current', org_name: 'Org', title: 'Current role' },
      ])));
    });

    expect(await screen.findByText('Current role')).toBeTruthy();
    expect(screen.queryByText('Stale role')).toBeNull();
    expect(queryUrls()).toHaveLength(2);
  });

  it('sends one query request when the text field is submitted', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/capabilities')) return jsonResponse(capabilities);
      if (url.startsWith('/api/search/facets')) return jsonResponse(facets);
      if (url.startsWith('/api/search/query')) return jsonResponse(searchBody([]));
      return jsonResponse({});
    });

    render(<HomeClient />);
    expect(await screen.findByText('No jobs found')).toBeTruthy();

    const input = screen.getByRole('textbox', { name: 'Search jobs' });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'officer' } });
      fireEvent.submit(input.closest('form') as HTMLFormElement);
    });

    await waitFor(() => {
      expect(queryUrls().filter((url) => url.includes('q=officer'))).toHaveLength(1);
    });
    expect(queryUrls()).toHaveLength(2);
  });
});

describe('query commit timer', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    localStorage.clear();
  });

  async function withFakeTimers(run: () => Promise<void>) {
    jest.useFakeTimers();
    try {
      await run();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  }

  function installSettledSearch() {
    installFetch((url) => {
      if (url.startsWith('/api/capabilities')) return jsonResponse(capabilities);
      if (url.startsWith('/api/search/facets')) return jsonResponse(facets);
      if (url.startsWith('/api/search/query')) return jsonResponse(searchBody([]));
      return jsonResponse({});
    });
  }

  async function settle() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('commits a typed query at 250ms and not before', async () => {
    await withFakeTimers(async () => {
      installSettledSearch();
      render(<HomeClient />);
      await settle();

      expect(screen.getByText('No jobs found')).toBeTruthy();
      expect(queryUrls()).toHaveLength(1);
      expect(jest.getTimerCount()).toBe(1);

      fireEvent.change(screen.getByRole('textbox', { name: 'Search jobs' }), {
        target: { value: 'officer' },
      });
      expect(jest.getTimerCount()).toBe(2);

      await act(async () => {
        jest.advanceTimersByTime(249);
      });
      expect(queryUrls().filter((url) => url.includes('q=officer'))).toHaveLength(0);
      expect(queryUrls()).toHaveLength(1);

      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(queryUrls().filter((url) => url.includes('q=officer'))).toHaveLength(1);
      expect(queryUrls()).toHaveLength(2);
    });
  });

  it('does not send a second request after an immediate submit', async () => {
    await withFakeTimers(async () => {
      installSettledSearch();
      render(<HomeClient />);
      await settle();

      expect(screen.getByText('No jobs found')).toBeTruthy();
      expect(jest.getTimerCount()).toBe(1);

      const input = screen.getByRole('textbox', { name: 'Search jobs' });
      fireEvent.change(input, { target: { value: 'officer' } });
      expect(jest.getTimerCount()).toBe(2);

      fireEvent.submit(input.closest('form') as HTMLFormElement);
      expect(jest.getTimerCount()).toBe(1);
      await settle();

      expect(queryUrls().filter((url) => url.includes('q=officer'))).toHaveLength(1);
      expect(queryUrls()).toHaveLength(2);

      await act(async () => {
        jest.advanceTimersByTime(250);
      });
      expect(queryUrls().filter((url) => url.includes('q=officer'))).toHaveLength(1);
      expect(queryUrls()).toHaveLength(2);
    });
  });

  it('does not search when a pending query timer is unmounted', async () => {
    await withFakeTimers(async () => {
      installSettledSearch();
      const { unmount } = render(<HomeClient />);
      await settle();

      expect(screen.getByText('No jobs found')).toBeTruthy();
      expect(queryUrls()).toHaveLength(1);
      expect(jest.getTimerCount()).toBe(1);

      fireEvent.change(screen.getByRole('textbox', { name: 'Search jobs' }), {
        target: { value: 'officer' },
      });
      expect(jest.getTimerCount()).toBe(2);

      unmount();
      expect(jest.getTimerCount()).toBe(0);

      await act(async () => {
        jest.advanceTimersByTime(250);
      });
      expect(queryUrls().filter((url) => url.includes('q=officer'))).toHaveLength(0);
      expect(queryUrls()).toHaveLength(1);
    });
  });
});

describe('Collection finished empty state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not call a finished search with no filters a load', async () => {
    installFetch((url) => {
      if (url.startsWith('/api/capabilities')) return jsonResponse(capabilities);
      if (url.startsWith('/api/search/facets')) return jsonResponse(facets);
      if (url.startsWith('/api/search/query')) return jsonResponse(searchBody([]));
      return jsonResponse({});
    });

    render(<CollectionClient />);

    await waitFor(() => {
      expect(queryUrls().length).toBeGreaterThan(0);
      expect(screen.queryByText('Searching...')).toBeNull();
    }, { timeout: 3000 });

    expect(screen.getByText('No jobs found')).toBeTruthy();
    expect(screen.queryByText('Loading jobs...')).toBeNull();
  });
});
