import {
  decideBulkDelete,
  hiddenSelectionCount,
  impactAnalysisRequest,
  pruneSelection,
  sameIds,
  visibleSelection,
  type BulkDeleteInput,
} from '../admin/bulkDelete';

const LIST = ['a', 'b', 'c', 'd'];

function input(overrides: Partial<BulkDeleteInput> = {}): BulkDeleteInput {
  return {
    visibleIds: ['a', 'b'],
    hiddenCount: 0,
    analyzedIds: ['a', 'b'],
    deletionType: 'soft',
    deletionReason: '',
    hardConfirmText: '',
    exportData: false,
    dateFrom: '',
    dateTo: '',
    ...overrides,
  };
}

describe('the visible selection', () => {
  it('keeps only selected jobs that are in the list, in list order', () => {
    expect(visibleSelection(new Set(['c', 'x', 'a']), LIST)).toEqual(['a', 'c']);
    expect(visibleSelection(new Set(['x', 'y']), LIST)).toEqual([]);
    expect(visibleSelection(new Set(), LIST)).toEqual([]);
    expect(visibleSelection(new Set(['a']), [])).toEqual([]);
  });

  it('lists a job once even if the list repeats it', () => {
    expect(visibleSelection(new Set(['a']), ['a', 'a', 'b'])).toEqual(['a']);
  });

  it('counts the selected jobs that are not in the list', () => {
    expect(hiddenSelectionCount(new Set(['a', 'x', 'y']), LIST)).toBe(2);
    expect(hiddenSelectionCount(new Set(['a', 'b']), LIST)).toBe(0);
    expect(hiddenSelectionCount(new Set(), LIST)).toBe(0);
  });

  it('prunes without changing the input, and returns the same set when nothing changed', () => {
    const selected = new Set(['a', 'x']);
    const pruned = pruneSelection(selected, LIST);
    expect(Array.from(pruned)).toEqual(['a']);
    expect(Array.from(selected)).toEqual(['a', 'x']);

    const unchanged = new Set(['a', 'b']);
    expect(pruneSelection(unchanged, LIST)).toBe(unchanged);
  });

  it('compares ID sets regardless of order and repeats', () => {
    expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameIds(['a', 'a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameIds(['a', 'b'], ['a'])).toBe(false);
    expect(sameIds(['a'], ['b'])).toBe(false);
    expect(sameIds([], [])).toBe(true);
  });
});

describe('the impact analysis request', () => {
  it('lists only the given jobs and passes the dates through', () => {
    expect(impactAnalysisRequest(['a', 'b'], '', '')).toEqual({ job_ids: ['a', 'b'] });
    expect(impactAnalysisRequest(['a'], '2026-10-01', '2026-10-31')).toEqual({
      job_ids: ['a'],
      date_from: '2026-10-01',
      date_to: '2026-10-31',
    });
  });

  it('is nothing when no job is given', () => {
    expect(impactAnalysisRequest([], '2026-10-01', '')).toBeNull();
  });
});

describe('a press of the delete button', () => {
  it('analyses the visible selection first', () => {
    expect(decideBulkDelete(input({ analyzedIds: null }))).toEqual({ action: 'analyze', ids: ['a', 'b'] });
  });

  it('stops for a fresh confirmation when selected jobs are no longer on screen, and sends nothing', () => {
    const decision = decideBulkDelete(input({ visibleIds: ['a'], hiddenCount: 2, analyzedIds: ['a', 'x', 'y'] }));
    expect(decision.action).toBe('reconfirm');
    if (decision.action !== 'reconfirm') return;
    expect(decision.ids).toEqual(['a']);
    expect(decision.message).toContain('2 selected jobs are no longer on screen');
    expect(decision.message).toContain('Nothing was deleted');
    expect(decideBulkDelete(input({ visibleIds: ['a'], hiddenCount: 1, analyzedIds: null })).action).toBe('reconfirm');
  });

  it('stops for a fresh confirmation when the selection differs from what was analysed', () => {
    for (const analyzedIds of [['a'], ['a', 'b', 'c'], ['a', 'c']]) {
      const decision = decideBulkDelete(input({ analyzedIds }));
      expect(decision.action).toBe('reconfirm');
      if (decision.action === 'reconfirm') expect(decision.message).toContain('Nothing was deleted');
    }
  });

  it('needs a selection', () => {
    expect(decideBulkDelete(input({ visibleIds: [], analyzedIds: null }))).toEqual({
      action: 'blocked',
      message: 'Select the jobs to delete first.',
    });
  });

  it('sends exactly the analysed visible jobs, never an organisation or a source', () => {
    const decision = decideBulkDelete(input({ visibleIds: ['b', 'a'], dateFrom: '2026-10-01', exportData: true }));
    expect(decision).toEqual({
      action: 'send',
      body: {
        job_ids: ['b', 'a'],
        date_from: '2026-10-01',
        deletion_type: 'soft',
        export_data: true,
        dry_run: false,
      },
    });
    if (decision.action !== 'send') return;
    expect(decision.body).not.toHaveProperty('org_name');
    expect(decision.body).not.toHaveProperty('source_id');
  });

  it('for a hard delete, needs a reason and the exact number of jobs being sent', () => {
    const hard = { deletionType: 'hard' as const };
    expect(decideBulkDelete(input({ ...hard, hardConfirmText: '2' }))).toEqual({
      action: 'blocked',
      message: 'Deletion reason is required for hard delete',
    });
    expect(decideBulkDelete(input({ ...hard, deletionReason: 'duplicates', hardConfirmText: '3' }))).toEqual({
      action: 'blocked',
      message: 'Type 2 to confirm the Hard Delete.',
    });

    const decision = decideBulkDelete(input({ ...hard, deletionReason: 'duplicates', hardConfirmText: '2' }));
    expect(decision.action).toBe('send');
    if (decision.action !== 'send') return;
    expect(decision.body.job_ids).toHaveLength(2);
    expect(decision.body.deletion_type).toBe('hard');
    expect(decision.body.deletion_reason).toBe('duplicates');
  });
});
