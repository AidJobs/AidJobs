import type { RawJob } from './jobs';
import { EMPTY_FACTS, parseFacts } from './facts';

/** The backend's page-size limit for `/api/search/query`. */
export const PAGE_SIZE = 100;
const MAX_PAGES = 50;

type SearchItem = {
  id?: unknown;
  title?: unknown;
  org_name?: unknown;
  location_raw?: unknown;
  country_iso?: unknown;
  deadline?: unknown;
  apply_url?: unknown;
  last_seen_at?: unknown;
  facts?: unknown;
};

type SearchBody = {
  status?: unknown;
  data?: { items?: unknown; total?: unknown; source?: unknown } | null;
};

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function toRawJob(item: SearchItem): RawJob | null {
  const id = text(item.id);
  const title = text(item.title);
  const org = text(item.org_name);
  const applyUrl = text(item.apply_url);
  if (!id || !title || !org || !applyUrl) return null;
  return {
    id,
    title,
    org,
    location: text(item.location_raw),
    country_iso: text(item.country_iso),
    deadline: text(item.deadline)?.slice(0, 10) ?? null,
    apply_url: applyUrl,
    last_seen_at: text(item.last_seen_at),
    // Whitelist: keep facts; strip every other enrichment field from the search item.
    facts: parseFacts(item.facts) ?? EMPTY_FACTS,
  };
}

export function backendOrigin(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/?$/, '').replace(/\/+$/, '');
}

export type LoadOptions = {
  /** Backend origin on the server; '' in the browser, which goes through the site's `/api/search` rewrite. */
  origin: string;
  /** Time allowed for all pages together. */
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

/**
 * Every open job, in pages. Throws unless the result is complete: the search answers `ok` with no jobs when its
 * database is unreachable, and its order is not unique, so a short or repeated page would otherwise pass as real.
 */
/** `AbortSignal.timeout` is missing before Safari 16 (iOS 15), where the browser loads the jobs itself. */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new Error('timed out')), ms);
  return controller.signal;
}

export async function loadOpenJobs({ origin, timeoutMs, fetchImpl = fetch }: LoadOptions): Promise<RawJob[]> {
  const signal = timeoutSignal(timeoutMs);
  const byId = new Map<string, RawJob>();
  const seen = new Set<string>();
  let total: number | null = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchImpl(`${origin}/api/search/query?size=${PAGE_SIZE}&page=${page}`, { signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`search answered ${res.status} on page ${page}`);
    const body = (await res.json()) as SearchBody;
    const data = body.data;
    if (body.status !== 'ok' || !data || !Array.isArray(data.items)) throw new Error(`search returned no data on page ${page}`);
    if (data.source === 'none') throw new Error('search has no data source');
    if (typeof data.total !== 'number' || data.total <= 0) throw new Error('search reported no open jobs');
    total ??= data.total;

    for (const item of data.items as SearchItem[]) {
      const id = text(item.id);
      if (id) seen.add(id);
      const job = toRawJob(item);
      if (job) byId.set(job.id, job);
    }
    if (data.items.length < PAGE_SIZE || page * PAGE_SIZE >= total) break;
  }

  if (total === null || seen.size < total) throw new Error(`search returned ${seen.size} of ${total ?? 0} open jobs`);
  return [...byId.values()];
}
