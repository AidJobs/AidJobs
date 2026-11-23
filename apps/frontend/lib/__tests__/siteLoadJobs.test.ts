/**
 * @jest-environment node
 */
import { loadOpenJobs, PAGE_SIZE } from '../site/loadJobs';

type Item = Record<string, unknown>;

function item(n: number, extra: Item = {}): Item {
  return {
    id: `job-${n}`,
    title: `Officer ${n}`,
    org_name: 'UNICEF',
    location_raw: 'Nairobi, Kenya',
    country_iso: 'KE',
    deadline: '2026-11-01',
    apply_url: `https://jobs.example.org/${n}`,
    last_seen_at: '2026-10-22T10:00:00+00:00',
    quality_score: 0.9,
    ...extra,
  };
}

function range(from: number, to: number): Item[] {
  return Array.from({ length: to - from }, (_, i) => item(from + i));
}

function body(items: Item[], total: number, source = 'db') {
  return { status: 'ok', data: { items, total, page: 1, size: PAGE_SIZE, source }, error: null };
}

/** A fetch that answers each page from `pages` in order and records the URLs asked for. */
function fakeFetch(pages: Array<unknown | Error | number>) {
  const urls: string[] = [];
  const impl = (async (url: string) => {
    urls.push(url);
    const next = pages[urls.length - 1];
    if (next instanceof Error) throw next;
    if (typeof next === 'number') return new Response('fail', { status: next });
    return new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, urls };
}

describe('loadOpenJobs', () => {
  it('joins every page and keeps only the fields the site uses', async () => {
    const { impl, urls } = fakeFetch([body(range(0, 100), 185), body(range(100, 185), 185)]);
    const jobs = await loadOpenJobs({ origin: 'https://backend.example', timeoutMs: 5000, fetchImpl: impl });
    expect(jobs).toHaveLength(185);
    expect(urls).toEqual([
      'https://backend.example/api/search/query?size=100&page=1',
      'https://backend.example/api/search/query?size=100&page=2',
    ]);
    expect(jobs[0]).toEqual({
      id: 'job-0',
      title: 'Officer 0',
      org: 'UNICEF',
      location: 'Nairobi, Kenya',
      country_iso: 'KE',
      deadline: '2026-11-01',
      apply_url: 'https://jobs.example.org/0',
      last_seen_at: '2026-10-22T10:00:00+00:00',
      facts: {
        contract: null,
        grade: null,
        duration: null,
        openTo: null,
        remote: false,
        language: 'English',
        sectors: [],
        sdgs: [],
        level: null,
        functions: [],
      },
    });
  });

  it('keeps server facts and strips other enrichment fields', async () => {
    const { impl } = fakeFetch([
      body(
        [
          item(0, {
            facts: {
              contract: 'Fixed term',
              grade: 'P-3',
              duration: null,
              openTo: 'International',
              remote: false,
              language: 'English',
              sectors: ['Education'],
              sdgs: [{ goal: 4, name: 'Quality education', colour: '#C5192D' }],
              level: 'Mid-career',
              functions: [],
            },
            functional_role: ['should-not-pass'],
            quality_score: 0.9,
          }),
        ],
        1,
      ),
    ]);
    const jobs = await loadOpenJobs({ origin: '', timeoutMs: 5000, fetchImpl: impl });
    expect(jobs[0].facts).toMatchObject({
      contract: 'Fixed term',
      grade: 'P-3',
      sectors: ['Education'],
      level: 'Mid-career',
    });
    expect(jobs[0]).not.toHaveProperty('functional_role');
    expect(jobs[0]).not.toHaveProperty('quality_score');
  });

  it('asks the site itself when the origin is empty, as in the browser', async () => {
    const { impl, urls } = fakeFetch([body(range(0, 3), 3)]);
    await loadOpenJobs({ origin: '', timeoutMs: 5000, fetchImpl: impl });
    expect(urls).toEqual(['/api/search/query?size=100&page=1']);
  });

  it('removes a job repeated across pages and fails when that leaves jobs missing', async () => {
    const { impl } = fakeFetch([body(range(0, 100), 150), body([item(99), ...range(100, 149)], 150)]);
    await expect(loadOpenJobs({ origin: '', timeoutMs: 5000, fetchImpl: impl })).rejects.toThrow('149 of 150');
  });

  it('fails on an empty answer marked ok, which the search gives when its database is unreachable', async () => {
    const { impl } = fakeFetch([body([], 0)]);
    await expect(loadOpenJobs({ origin: '', timeoutMs: 5000, fetchImpl: impl })).rejects.toThrow('no open jobs');
  });

  it('fails when the search has no data source', async () => {
    const { impl } = fakeFetch([body(range(0, 3), 3, 'none')]);
    await expect(loadOpenJobs({ origin: '', timeoutMs: 5000, fetchImpl: impl })).rejects.toThrow('no data source');
  });

  it('fails when a later page errors', async () => {
    const { impl } = fakeFetch([body(range(0, 100), 150), 502]);
    await expect(loadOpenJobs({ origin: '', timeoutMs: 5000, fetchImpl: impl })).rejects.toThrow('502 on page 2');
  });

  it('fails when the backend cannot be reached', async () => {
    const { impl } = fakeFetch([new TypeError('fetch failed')]);
    await expect(loadOpenJobs({ origin: '', timeoutMs: 5000, fetchImpl: impl })).rejects.toThrow('fetch failed');
  });

  it('gives up when the time allowed runs out', async () => {
    const slow = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as unknown as typeof fetch;
    await expect(loadOpenJobs({ origin: '', timeoutMs: 50, fetchImpl: slow })).rejects.toThrow();
  });

  it('skips a malformed job without blocking the rest', async () => {
    const { impl } = fakeFetch([body([...range(0, 2), item(2, { apply_url: null })], 3)]);
    const jobs = await loadOpenJobs({ origin: '', timeoutMs: 5000, fetchImpl: impl });
    expect(jobs.map((j) => j.id)).toEqual(['job-0', 'job-1']);
  });
});
