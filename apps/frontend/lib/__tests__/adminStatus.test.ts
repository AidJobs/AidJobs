import {
  adminErrorMessage,
  aiKeyStatus,
  COUNT_LABELS,
  databaseStatus,
  healthScore,
  jobsCountScope,
  MEILI_NOT_CONFIGURED,
  meiliSetupStatus,
  qualityList,
  recentActivity,
  searchSummary,
  type ReportResult,
  type SourceQuality,
  type SourceRow,
} from '../admin/status';

const SOURCES: SourceRow[] = [
  { id: 'unicef', org_name: 'UNICEF', careers_url: 'https://jobs.unicef.org/en-us/listing/', status: 'active' },
  { id: 'icrc', org_name: 'ICRC', careers_url: 'https://careers.icrc.org/go/Global-Opportunities/8821501/', status: 'active' },
  { id: 'oxfam', org_name: 'Oxfam GB', careers_url: 'https://jobs.oxfam.org.uk/jobs/home/', status: 'active' },
];

function report(id: string, overrides: Partial<SourceQuality> = {}): ReportResult {
  return {
    ok: true,
    report: {
      source_id: id,
      source_name: id,
      source_url: null,
      total_jobs: 10,
      unique_urls: 10,
      null_urls: 0,
      listing_page_urls: 0,
      duplicate_urls: [],
      quality_score: 100,
      ...overrides,
    },
  };
}

const healthy = { unicef: report('unicef'), icrc: report('icrc'), oxfam: report('oxfam') };

describe('Data Quality source list', () => {
  it('lists every source and says no issues were found when all are healthy', () => {
    const list = qualityList(SOURCES, null, healthy);
    expect(list.state).toBe('all-healthy');
    expect(list.summary).toBe('No issues found in 3 sources.');
    expect(list.rows.map((r) => r.source.id)).toEqual(['unicef', 'icrc', 'oxfam']);
    expect(list.rows.every((r) => r.result?.ok)).toBe(true);
  });

  it('marks sources with issues first and keeps healthy sources listed', () => {
    const list = qualityList(SOURCES, null, { ...healthy, oxfam: report('oxfam', { listing_page_urls: 2 }) });
    expect(list.state).toBe('some-issues');
    expect(list.summary).toBe('1 of 3 sources have issues.');
    expect(list.rows.map((r) => [r.source.id, r.issues])).toEqual([
      ['oxfam', true],
      ['unicef', false],
      ['icrc', false],
    ]);
  });

  it('counts a missing link as an issue, like the global count', () => {
    const list = qualityList(SOURCES, null, { ...healthy, icrc: report('icrc', { null_urls: 1 }) });
    expect(list.rows[0]).toMatchObject({ source: { id: 'icrc' }, issues: true });
  });

  it('shows a report that failed as a failure, not as no data, and keeps the other sources', () => {
    const list = qualityList(SOURCES, null, { ...healthy, icrc: { ok: false, error: 'HTTP 500' } });
    expect(list.state).toBe('some-failed');
    expect(list.summary).toBe('Could not load 1 of 3 reports. No issues in the others.');
    expect(list.rows).toHaveLength(3);
    expect(list.rows[0]).toMatchObject({ source: { id: 'icrc' }, result: { ok: false, error: 'HTTP 500' } });
    expect(list.summary).not.toMatch(/no data/i);
  });

  it('reports issues and failures together', () => {
    const list = qualityList(SOURCES, null, {
      unicef: report('unicef', { null_urls: 3 }),
      icrc: { ok: false, error: 'timeout' },
      oxfam: report('oxfam'),
    });
    expect(list.state).toBe('some-issues');
    expect(list.summary).toBe('1 of 3 sources have issues; 1 report could not be loaded.');
    expect(list.rows.map((r) => r.source.id)).toEqual(['unicef', 'icrc', 'oxfam']);
  });

  it('shows a failure when the list of sources cannot be loaded', () => {
    const list = qualityList(null, 'HTTP 503', {});
    expect(list.state).toBe('failed');
    expect(list.summary).toBe('Could not load the list of sources: HTTP 503');
    expect(list.summary).not.toMatch(/no (source quality )?data/i);
  });

  it('says there are no sources only when there are none', () => {
    expect(qualityList([], null, {})).toMatchObject({ state: 'no-sources', summary: 'No sources yet.' });
    const onlyDeleted = [{ ...SOURCES[0], status: 'deleted' }];
    expect(qualityList(onlyDeleted, null, {}).state).toBe('no-sources');
  });

  it('is loading until every report has answered, and lists sources meanwhile', () => {
    const list = qualityList(SOURCES, null, { unicef: report('unicef') });
    expect(list.state).toBe('loading');
    expect(list.rows).toHaveLength(3);
  });
});

describe('Recent Activity', () => {
  const run = (i: number) => ({
    id: String(i), org_name: 'UNICEF', ran_at: `2026-10-2${i}T10:00:00Z`, status: 'ok', found: 5, inserted: 1, updated: 0,
  });

  it('shows the latest five crawl runs from the crawl log answer', () => {
    const activity = recentActivity({ status: 'ok', data: [1, 2, 3, 4, 5, 6, 7].map(run) });
    expect(activity.state).toBe('ok');
    if (activity.state === 'ok') expect(activity.runs.map((r) => r.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('says there are no runs when the log is empty', () => {
    expect(recentActivity({ status: 'ok', data: [] })).toEqual({ state: 'empty' });
  });

  it('says the runs could not be loaded on an error or no answer', () => {
    expect(recentActivity({ status: 'error', error: 'Authentication required' })).toEqual({ state: 'error' });
    expect(recentActivity(null)).toEqual({ state: 'error' });
    expect(recentActivity({ status: 'ok', data: null })).toEqual({ state: 'error' });
  });
});

describe('Search status and health', () => {
  it('reports database search as normal when Meilisearch is not configured', () => {
    expect(searchSummary({ enabled: false, error: MEILI_NOT_CONFIGURED }, null)).toEqual({
      text: 'Search runs on the database (Meilisearch not used).',
      tone: 'neutral',
    });
  });

  it('still reports a configured Meilisearch that fails, and a status that cannot be read', () => {
    expect(searchSummary({ enabled: false, error: 'Meilisearch client not initialized' }, null).tone).toBe('error');
    expect(searchSummary(null, 'HTTP 502').tone).toBe('error');
  });

  it('never tells the reader to check the console', () => {
    const texts = [
      searchSummary({ enabled: false, error: 'Expecting value: line 1 column 1' }, null).text,
      searchSummary(null, 'HTTP 0').text,
      searchSummary({ enabled: false, error: MEILI_NOT_CONFIGURED }, null).text,
    ];
    texts.forEach((t) => expect(t).not.toMatch(/console/i));
  });

  it('counts the database and the crawler, not Meilisearch', () => {
    expect(healthScore({ ok: true }, { running: true })).toBe(100);
    expect(healthScore({ ok: true }, { running: false })).toBe(50);
    expect(healthScore({ ok: false }, { running: true })).toBe(50);
    expect(healthScore({ ok: true }, null)).toBe(100);
    expect(healthScore({ ok: false }, null)).toBe(0);
    expect(healthScore(null, null)).toBe(0);
  });
});

describe('Settings', () => {
  it('says whether an AI key is set without claiming AI works', () => {
    expect(aiKeyStatus(true)).toEqual({ text: 'Key set, not tested', tone: 'warn' });
    expect(aiKeyStatus(false)).toEqual({ text: 'No key', tone: 'neutral' });
    [aiKeyStatus(true).text, aiKeyStatus(false).text].forEach((t) => expect(t).not.toMatch(/configured|working|ok/i));
  });

  it('describes the database check', () => {
    expect(databaseStatus('ok').text).toBe('Connected');
    expect(databaseStatus('warn').tone).toBe('error');
    expect(databaseStatus('fail').text).toBe('Cannot connect');
  });

  it('shows Meilisearch as not used only when the backend says it is not configured', () => {
    expect(meiliSetupStatus('fail', { enabled: false, error: MEILI_NOT_CONFIGURED })).toEqual({
      text: 'Not used: search runs on the database',
      tone: 'neutral',
    });
    expect(meiliSetupStatus('fail', null)).toEqual({ text: 'Not responding', tone: 'error' });
    expect(meiliSetupStatus('warn', { enabled: false, error: 'Meilisearch client not initialized' }).tone).toBe('warn');
    expect(meiliSetupStatus('ok', { enabled: true }).text).toBe('Connected');
  });
});

describe('Admin failure messages', () => {
  it('reads the message of an admin proxy\'s failure answer', () => {
    const body = { status: 'error', error: 'Authentication required', detail: 'Authentication required' };
    expect(adminErrorMessage(JSON.stringify(body))).toBe('Authentication required');
    expect(adminErrorMessage(JSON.stringify({ detail: ' Not found ' }))).toBe('Not found');
  });

  it('gives nothing for text that is not such an answer', () => {
    expect(adminErrorMessage('<html>Bad gateway</html>')).toBeNull();
    expect(adminErrorMessage('')).toBeNull();
    expect(adminErrorMessage('null')).toBeNull();
    expect(adminErrorMessage(JSON.stringify({ error: 42 }))).toBeNull();
  });
});

describe('Count labels', () => {
  it('names what each count includes', () => {
    expect(COUNT_LABELS.allRecords).toMatch(/including deleted/);
    expect(COUNT_LABELS.openOnSite).toBe('Open on the public site');
    expect(COUNT_LABELS.activeJobs).toMatch(/including past deadline/);
    expect(COUNT_LABELS.notDeleted).toMatch(/not deleted, any status/);
  });

  it('describes the Jobs page total for each filter', () => {
    expect(jobsCountScope('all', false)).toBe('not deleted, any status');
    expect(jobsCountScope('all', true)).toBe('including deleted, any status');
    expect(jobsCountScope('active', false)).toBe('active, not deleted');
    expect(jobsCountScope('deleted', false)).toBe('deleted only');
  });
});
