/**
 * Admin status wording and states (UX-05). Each label names what the backend query counts;
 * the queries themselves are unchanged.
 */

export const COUNT_LABELS = {
  allRecords: 'All job records (including deleted)',
  openOnSite: 'Open on the public site',
  openOnSiteHelp: 'Active, not deleted, deadline not passed',
  activeJobs: 'Active jobs (including past deadline)',
  activeJobsHelp: 'Active and not deleted, whatever the deadline',
  notDeleted: 'Jobs (not deleted, any status)',
  openBySource: 'Open jobs by source',
  sources: 'Sources',
} as const;

/** What the Jobs page total counts, for the filter that produced it (`/api/admin/jobs/search`). */
export function jobsCountScope(status: 'all' | 'active' | 'deleted', includeDeleted: boolean): string {
  if (status === 'active') return 'active, not deleted';
  if (status === 'deleted') return 'deleted only';
  return includeDeleted ? 'including deleted, any status' : 'not deleted, any status';
}

export type Tone = 'ok' | 'neutral' | 'warn' | 'error';

/** Settings: whether an AI key is set. The key is never tested here, so neither state claims AI works. */
export function aiKeyStatus(keySet: boolean): { text: string; tone: Tone } {
  return keySet ? { text: 'Key set, not tested', tone: 'warn' } : { text: 'No key', tone: 'neutral' };
}

/** Settings: the database check runs `SELECT 1` on the backend. */
export function databaseStatus(status: 'ok' | 'warn' | 'fail'): { text: string; tone: Tone } {
  if (status === 'ok') return { text: 'Connected', tone: 'ok' };
  if (status === 'warn') return { text: 'Connection settings missing', tone: 'error' };
  return { text: 'Cannot connect', tone: 'error' };
}

export type SearchStatus = { enabled: boolean; error?: string; index?: unknown };

/** The backend's answer from `/api/search/status` when no Meilisearch settings are present. */
export const MEILI_NOT_CONFIGURED = 'Meilisearch not configured';

/**
 * Search always runs on the database (`/api/search/query` answers `source: "db"`); Meilisearch is an
 * optional extra. Not configuring it is not a fault. A configured Meilisearch that fails, or a status
 * that cannot be read, is still reported as an error.
 */
export function searchSummary(status: SearchStatus | null, loadError: string | null): { text: string; tone: Tone } {
  if (loadError || !status) return { text: 'Could not read the search status.', tone: 'error' };
  if (status.enabled) return { text: 'Meilisearch connected; the database also answers searches.', tone: 'ok' };
  if (status.error === MEILI_NOT_CONFIGURED) {
    return { text: 'Search runs on the database (Meilisearch not used).', tone: 'neutral' };
  }
  return { text: `Meilisearch is configured but not working: ${status.error || 'no details'}. Search still runs on the database.`, tone: 'error' };
}

/** Settings card for Meilisearch, read together with `/api/search/status`. */
export function meiliSetupStatus(setup: 'ok' | 'warn' | 'fail', search: SearchStatus | null): { text: string; tone: Tone } {
  if (setup === 'ok') return { text: 'Connected', tone: 'ok' };
  if (search && !search.enabled && search.error === MEILI_NOT_CONFIGURED) {
    return { text: 'Not used: search runs on the database', tone: 'neutral' };
  }
  if (setup === 'warn') return { text: 'Settings present, not connected', tone: 'warn' };
  return { text: 'Not responding', tone: 'error' };
}

/**
 * Dashboard health: the database and the crawler, each counted when its status loaded, as before.
 * Search is not counted: it runs on the database, which is already counted.
 */
export function healthScore(db: { ok: boolean } | null, crawler: { running: boolean } | null): number {
  const checks = [db ? db.ok : null, crawler ? crawler.running : null].filter((c): c is boolean => c !== null);
  if (checks.length === 0) return 0;
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export type CrawlRun = {
  id: string;
  org_name: string | null;
  ran_at: string;
  status: string;
  found: number;
  inserted: number;
  updated: number;
  message?: string | null;
};

export type RecentActivity = { state: 'error' } | { state: 'empty' } | { state: 'ok'; runs: CrawlRun[] };

/** Dashboard Recent Activity, from the Crawls page's own `/api/admin/crawl/logs` answer (newest first). */
export function recentActivity(body: unknown, limit = 5): RecentActivity {
  const data = (body as { status?: string; data?: unknown } | null)?.data;
  if (!body || (body as { status?: string }).status !== 'ok' || !Array.isArray(data)) return { state: 'error' };
  if (data.length === 0) return { state: 'empty' };
  return { state: 'ok', runs: (data as CrawlRun[]).slice(0, limit) };
}

export type SourceRow = { id: string; org_name: string | null; careers_url: string | null; status?: string };

export type SourceQuality = {
  source_id: string;
  source_name: string | null;
  source_url: string | null;
  total_jobs: number;
  unique_urls: number;
  null_urls: number;
  listing_page_urls: number;
  missing_titles?: number;
  short_titles?: number;
  duplicate_urls: Array<{ url: string; count: number; titles: string[] }>;
  quality_score: number;
};

export type ReportResult = { ok: true; report: SourceQuality } | { ok: false; error: string };

/** The same test as the global "Sources with Issues" count: a job without a link, or linking to a listing page. */
export function hasIssues(report: SourceQuality): boolean {
  return (report.null_urls ?? 0) > 0 || (report.listing_page_urls ?? 0) > 0;
}

export type QualityRow = {
  source: SourceRow;
  /** Undefined while the report is loading. */
  result: ReportResult | undefined;
  issues: boolean;
};

export type QualityListState = 'failed' | 'no-sources' | 'loading' | 'some-issues' | 'some-failed' | 'all-healthy';

/**
 * Data Quality "Source Quality Reports". Every source is listed, whatever its reports say;
 * "no data" is said only when there are no sources, and a failure is never shown as "no data".
 * Order: sources with issues, then reports that failed, then healthy, then loading.
 */
export function qualityList(
  sources: SourceRow[] | null,
  sourcesError: string | null,
  reports: Record<string, ReportResult | undefined>,
): { state: QualityListState; summary: string; rows: QualityRow[] } {
  if (sourcesError || !sources) {
    return { state: 'failed', summary: `Could not load the list of sources: ${sourcesError || 'no answer'}`, rows: [] };
  }
  const listed = sources.filter((s) => s.status !== 'deleted');
  if (listed.length === 0) return { state: 'no-sources', summary: 'No sources yet.', rows: [] };

  const rank = (row: QualityRow) => (row.issues ? 0 : row.result && !row.result.ok ? 1 : row.result ? 2 : 3);
  const rows = listed
    .map((source) => {
      const result = reports[source.id];
      return { source, result, issues: !!result && result.ok && hasIssues(result.report) };
    })
    .sort((a, b) => rank(a) - rank(b));

  const n = rows.length;
  const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;
  const withIssues = rows.filter((r) => r.issues).length;
  const failed = rows.filter((r) => r.result && !r.result.ok).length;
  const loading = rows.filter((r) => !r.result).length;

  if (withIssues > 0) {
    const extra = failed > 0 ? `; ${plural(failed, 'report')} could not be loaded` : '';
    return { state: 'some-issues', summary: `${withIssues} of ${plural(n, 'source')} have issues${extra}.`, rows };
  }
  if (loading > 0) return { state: 'loading', summary: 'Loading reports…', rows };
  if (failed > 0) {
    return { state: 'some-failed', summary: `Could not load ${failed} of ${plural(n, 'report')}. No issues in the others.`, rows };
  }
  return { state: 'all-healthy', summary: `No issues found in ${plural(n, 'source')}.`, rows };
}
