import {
  canConfirm,
  confirmationMatches,
  countText,
  crawlRunCountFrom,
  hardDeleteConfirmationMatches,
  jobCountFrom,
  meiliControlsVisible,
  sourceDangerActions,
  sourceRowActions,
  type ImpactCount,
} from '../admin/danger';
import { MEILI_NOT_CONFIGURED } from '../admin/status';

const ICRC = 'ICRC (or International Committee of the Red Cross)';

describe('typed confirmation', () => {
  it('accepts only the exact organisation name', () => {
    expect(confirmationMatches(ICRC, ICRC)).toBe(true);
    expect(confirmationMatches('UNICEF', 'UNICEF')).toBe(true);
  });

  it('rejects a different case, extra or missing spaces, partial names, and empty input', () => {
    expect(confirmationMatches('unicef', 'UNICEF')).toBe(false);
    expect(confirmationMatches('UNICEF ', 'UNICEF')).toBe(false);
    expect(confirmationMatches(' UNICEF', 'UNICEF')).toBe(false);
    expect(confirmationMatches('ICRC', ICRC)).toBe(false);
    expect(confirmationMatches('', 'UNICEF')).toBe(false);
    expect(confirmationMatches('', '')).toBe(false);
  });

  it('accepts only the exact number of jobs for Hard Delete', () => {
    expect(hardDeleteConfirmationMatches('3', 3)).toBe(true);
    expect(hardDeleteConfirmationMatches(' 3', 3)).toBe(false);
    expect(hardDeleteConfirmationMatches('3 ', 3)).toBe(false);
    expect(hardDeleteConfirmationMatches('03', 3)).toBe(false);
    expect(hardDeleteConfirmationMatches('three', 3)).toBe(false);
    expect(hardDeleteConfirmationMatches('4', 3)).toBe(false);
    expect(hardDeleteConfirmationMatches('', 3)).toBe(false);
    expect(hardDeleteConfirmationMatches('0', 0)).toBe(false);
  });
});

describe('source danger actions', () => {
  it('offers delete for active and paused sources, and permanent delete only for deleted ones', () => {
    expect(sourceDangerActions('active')).toEqual({ deleteSource: true, permanentDelete: false });
    expect(sourceDangerActions('paused')).toEqual({ deleteSource: true, permanentDelete: false });
    expect(sourceDangerActions('deleted')).toEqual({ deleteSource: false, permanentDelete: true });
  });
});

describe('source row actions', () => {
  it('offers run, pause or resume, and edit for every active or paused source', () => {
    for (const status of ['active', 'paused', null, undefined]) {
      expect(sourceRowActions(status)).toEqual({ run: true, toggle: true, edit: true, activate: false });
    }
  });

  it('offers edit and activate, not run or pause or resume, for a pending source', () => {
    expect(sourceRowActions('pending_validation')).toEqual({
      run: false,
      toggle: false,
      edit: true,
      activate: true,
    });
  });

  it('offers none of them for a deleted source', () => {
    expect(sourceRowActions('deleted')).toEqual({
      run: false,
      toggle: false,
      edit: false,
      activate: false,
    });
  });
});

describe('impact counts', () => {
  it('reads the job count from the jobs search answer', () => {
    expect(jobCountFrom(true, { status: 'ok', data: { total: 301, items: [] } })).toEqual({ state: 'ok', count: 301, atLeast: false });
    expect(jobCountFrom(true, { status: 'ok', data: { total: 0 } })).toEqual({ state: 'ok', count: 0, atLeast: false });
  });

  it('is an error when the job count does not load', () => {
    expect(jobCountFrom(false, { status: 'error', error: 'HTTP 500' })).toEqual({
      state: 'error',
      message: 'The number of jobs could not be loaded. (HTTP 500)',
    });
    expect(jobCountFrom(true, null).state).toBe('error');
    expect(jobCountFrom(true, { status: 'ok', data: {} }).state).toBe('error');
  });

  it('counts crawl runs and says "at least" when the list is capped', () => {
    expect(crawlRunCountFrom(true, { status: 'ok', data: [1, 2, 3] }, 100)).toEqual({ state: 'ok', count: 3, atLeast: false });
    const capped = crawlRunCountFrom(true, { status: 'ok', data: new Array(100).fill(0) }, 100);
    expect(capped).toEqual({ state: 'ok', count: 100, atLeast: true });
    expect(countText(capped, 'crawl run')).toBe('at least 100 crawl runs');
    expect(crawlRunCountFrom(false, { detail: 'Not found' }, 100).state).toBe('error');
  });

  it('describes counts in words', () => {
    expect(countText({ state: 'ok', count: 1, atLeast: false }, 'job')).toBe('1 job');
    expect(countText({ state: 'ok', count: 301, atLeast: false }, 'job')).toBe('301 jobs');
    expect(countText({ state: 'loading' }, 'job')).toBe('Counting jobs…');
    expect(countText({ state: 'error', message: 'x' }, 'job')).toBe('x');
  });
});

describe('enabling a destructive action', () => {
  const ok: ImpactCount = { state: 'ok', count: 5, atLeast: false };

  it('needs every count loaded and the confirmation matched', () => {
    expect(canConfirm([ok], true)).toBe(true);
    expect(canConfirm([ok, ok], true)).toBe(true);
    expect(canConfirm([ok], false)).toBe(false);
  });

  it('stays disabled while a count is loading or after it failed', () => {
    expect(canConfirm([{ state: 'loading' }], true)).toBe(false);
    expect(canConfirm([ok, { state: 'error', message: 'failed' }], true)).toBe(false);
    expect(canConfirm([], true)).toBe(false);
  });
});

describe('Meilisearch controls', () => {
  it('are hidden only when the backend says Meilisearch is not configured', () => {
    expect(meiliControlsVisible({ enabled: false, error: MEILI_NOT_CONFIGURED }, null)).toBe(false);
  });

  it('stay visible when Meilisearch is enabled, failing, or the status cannot be read', () => {
    expect(meiliControlsVisible({ enabled: true }, null)).toBe(true);
    expect(meiliControlsVisible({ enabled: false, error: 'Meilisearch client not initialized' }, null)).toBe(true);
    expect(meiliControlsVisible(null, 'HTTP 502')).toBe(true);
    expect(meiliControlsVisible({ enabled: false, error: MEILI_NOT_CONFIGURED }, 'HTTP 502')).toBe(true);
  });
});
