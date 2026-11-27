/**
 * Admin demo figures, copied from the progress ledger and the admin pages read on 20 October 2026.
 * Times are UTC. Where the ledger has no time, only the date is given.
 */

export type CrawlRun = {
  source: string;
  when: string;
  status: 'ok' | 'partial' | 'failed';
  found: number;
  inserted: number;
  updated: number;
  seconds: number;
  message: string;
};

export type DemoSource = {
  id: string;
  org: string;
  url: string;
  type: 'html';
  schedule: string;
  lastCrawl: string;
  nextCrawl: string | null;
  result: 'complete' | 'partial';
  found: number;
  expected: number | null;
  rejected: number;
  failures: number;
  health: number;
  note: string;
};

export const TOTALS = {
  allRows: 234,
  active: 218,
  shownPublicly: 206,
  addedOn19Oct: 114,
};

export const SOURCES: DemoSource[] = [
  {
    id: 'oxfam',
    org: 'Oxfam GB',
    url: 'https://jobs.oxfam.org.uk/jobs/home/',
    type: 'html',
    schedule: 'Every 3 days',
    lastCrawl: '19 Oct 19:24',
    nextCrawl: '23 Oct 03:35',
    result: 'complete',
    found: 5,
    expected: null,
    rejected: 0,
    failures: 0,
    health: 73,
    note: 'All five deadlines corrected after the ISO date fix.',
  },
  {
    id: 'icrc',
    org: 'ICRC (or International Committee of the Red Cross)',
    url: 'https://careers.icrc.org/go/Global-Opportunities/8821501/',
    type: 'html',
    schedule: 'Every 3 days',
    lastCrawl: '17 Oct 18:40',
    nextCrawl: null,
    result: 'complete',
    found: 34,
    expected: null,
    rejected: 20,
    failures: 0,
    health: 62,
    note: '14 roles saved; 20 non-job links correctly rejected.',
  },
  {
    id: 'unicef',
    org: 'UNICEF',
    url: 'https://jobs.unicef.org/en-us/listing/',
    type: 'html',
    schedule: 'Every 3 days',
    lastCrawl: '19 Oct 09:58',
    nextCrawl: null,
    result: 'partial',
    found: 120,
    expected: 209,
    rejected: 0,
    failures: 0,
    health: 59,
    note: 'Stopped by a bot challenge on page 7, after one retry.',
  },
];

export const RUNS: CrawlRun[] = [
  { source: 'Oxfam GB', when: '19 Oct 19:24', status: 'ok', found: 5, inserted: 0, updated: 5, seconds: 23.9, message: 'Found 5 jobs' },
  { source: 'Oxfam GB', when: '19 Oct 10:08', status: 'ok', found: 5, inserted: 5, updated: 0, seconds: 103.6, message: 'Found 5 jobs' },
  { source: 'UNICEF', when: '19 Oct 09:58', status: 'partial', found: 120, inserted: 10, updated: 0, seconds: 393.6, message: 'Listing partial: 6 pages, expected 209, HTTP 202 on page 7 after one retry' },
  { source: 'UNICEF', when: '19 Oct 08:51', status: 'failed', found: 0, inserted: 0, updated: 0, seconds: 30.5, message: 'HTTP 0: page 1 timed out' },
  { source: 'UNICEF', when: '19 Oct 06:23', status: 'partial', found: 120, inserted: 99, updated: 20, seconds: 124.8, message: 'Listing partial: 6 pages, expected 199, HTTP 202 on page 7' },
  { source: 'UNICEF', when: '18 Oct', status: 'ok', found: 20, inserted: 20, updated: 0, seconds: 81.7, message: 'Found 20 jobs' },
  { source: 'UNICEF', when: '18 Oct 09:21', status: 'failed', found: 0, inserted: 0, updated: 0, seconds: 30.5, message: 'HTTP 0' },
  { source: 'UNICEF', when: '18 Oct', status: 'ok', found: 39, inserted: 0, updated: 0, seconds: 7.3, message: 'Found 39 jobs' },
  { source: 'ICRC', when: '17 Oct 18:40', status: 'ok', found: 34, inserted: 0, updated: 1, seconds: 145.3, message: 'Found 34 jobs' },
  { source: 'ICRC', when: '17 Oct', status: 'ok', found: 34, inserted: 14, updated: 0, seconds: 142.1, message: 'Found 34 jobs' },
  { source: 'UNICEF', when: '17 Oct', status: 'ok', found: 39, inserted: 0, updated: 0, seconds: 5.0, message: 'Found 39 jobs' },
  { source: 'UNICEF', when: '16 Oct', status: 'ok', found: 39, inserted: 0, updated: 0, seconds: 6.0, message: 'Found 39 jobs' },
];

/** Jobs found per crawl, oldest first, for the sparklines. */
export const FOUND_HISTORY: Record<string, number[]> = {
  oxfam: [5, 5],
  icrc: [34, 34],
  unicef: [39, 39, 39, 0, 20, 120, 0, 120],
};

export type StageCard = { name: string; detail: string; item?: string };

export const STAGES: Array<{ stage: string; cards: StageCard[] }> = [
  {
    stage: 'Proposed',
    cards: [
      { name: 'Médecins Sans Frontières', detail: 'msf.org/jobs needs one approved fetch', item: 'W-08' },
      { name: 'DevNetJobsIndia', detail: 'About 150 candidates; needs the confirmation fetch', item: 'W-08' },
      { name: 'Global Partnership for Education', detail: 'Job links not extracted yet', item: 'W-08' },
      { name: 'International Rescue Committee', detail: 'Saved page is a landing page, not a job list', item: 'W-08' },
    ],
  },
  {
    stage: 'Checked offline',
    cards: [
      { name: 'UNDP', detail: 'Oracle listing; the general reader saves junk rows. Needs a reader', item: 'W-19' },
      { name: 'UNESCO', detail: '52 candidates, above the 50-job detail limit', item: 'W-09' },
    ],
  },
  {
    stage: 'Live',
    cards: [
      { name: 'Oxfam GB', detail: '5 jobs, complete' },
      { name: 'ICRC', detail: '14 jobs, complete' },
    ],
  },
  {
    stage: 'Needs attention',
    cards: [{ name: 'UNICEF', detail: '120 of 209 jobs: bot challenge on page 7', item: 'W-04' }],
  },
];

export const ALERTS: Array<{ tone: 'red' | 'amber'; text: string }> = [
  { tone: 'red', text: 'www.aidjobs.app does not resolve in public DNS (20 Oct). The domain needs renewing.' },
  { tone: 'amber', text: 'UNICEF listing partial: 120 of 209 jobs read.' },
  { tone: 'amber', text: 'Search runs on the database; Meilisearch returns an empty response.' },
  { tone: 'amber', text: 'AI key revoked: crawls continue without AI.' },
];

export const CHECKLIST: Array<{ step: string; done: boolean }> = [
  { step: 'One approved fetch of the listing', done: false },
  { step: 'Extraction checked offline', done: false },
  { step: 'Admission: real jobs kept, junk rejected', done: false },
  { step: 'Report and approval to add', done: false },
];
