import {
  copyBeforeDelete,
  decideBulkDelete,
  exportedJobsMatching,
  exportRequest,
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
    savedCopyIds: null,
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
    const decision = decideBulkDelete(input({ visibleIds: ['b', 'a'], dateFrom: '2026-10-01' }));
    expect(decision).toEqual({
      action: 'send',
      body: {
        job_ids: ['b', 'a'],
        date_from: '2026-10-01',
        deletion_type: 'soft',
        export_data: false,
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

describe('a copy before deleting (W-48)', () => {
  it('saves the copy of the analysed jobs first, instead of deleting', () => {
    expect(decideBulkDelete(input({ exportData: true }))).toEqual({ action: 'saveCopy', ids: ['a', 'b'] });
  });

  it('deletes only after a copy of exactly these jobs was saved, and never asks the delete to export', () => {
    expect(decideBulkDelete(input({ exportData: true, savedCopyIds: ['b', 'a'] }))).toEqual({
      action: 'send',
      body: { job_ids: ['a', 'b'], deletion_type: 'soft', export_data: false, dry_run: false },
    });
    for (const savedCopyIds of [['a'], ['a', 'b', 'c'], ['a', 'c'], []]) {
      expect(decideBulkDelete(input({ exportData: true, savedCopyIds }))).toEqual({ action: 'saveCopy', ids: ['a', 'b'] });
    }
  });

  it('checks the selection and the Hard Delete confirmation before saving a copy', () => {
    expect(decideBulkDelete(input({ exportData: true, analyzedIds: null })).action).toBe('analyze');
    expect(decideBulkDelete(input({ exportData: true, analyzedIds: ['a'] })).action).toBe('reconfirm');
    expect(decideBulkDelete(input({ exportData: true, hiddenCount: 1 })).action).toBe('reconfirm');
    const hard = { exportData: true, deletionType: 'hard' as const };
    expect(decideBulkDelete(input({ ...hard, hardConfirmText: '2' })).action).toBe('blocked');
    expect(decideBulkDelete(input({ ...hard, deletionReason: 'duplicates', hardConfirmText: '3' })).action).toBe('blocked');
    expect(decideBulkDelete(input({ ...hard, deletionReason: 'duplicates', hardConfirmText: '2' })).action).toBe('saveCopy');
  });

  it('exports only the listed jobs, each once', () => {
    expect(exportRequest(['a', 'b', 'a'])).toEqual({ job_ids: ['a', 'b'], format: 'json' });
    expect(exportRequest([])).toBeNull();
  });

  it('accepts an export only when it holds exactly the requested jobs', () => {
    const ok = (ids: string[]) => ({ status: 'ok', data: { format: 'json', count: ids.length, jobs: ids.map((id) => ({ id, title: `Job ${id}` })) } });
    expect(exportedJobsMatching(ok(['b', 'a']), ['a', 'b'])).toEqual([
      { id: 'b', title: 'Job b' },
      { id: 'a', title: 'Job a' },
    ]);
    expect(exportedJobsMatching(ok(['a']), ['a', 'b'])).toBeNull();
    expect(exportedJobsMatching(ok(['a', 'b', 'c']), ['a', 'b'])).toBeNull();
    expect(exportedJobsMatching(ok(['a', 'a', 'b']), ['a', 'b'])).toBeNull();
    expect(exportedJobsMatching(ok([]), ['a'])).toBeNull();
  });

  it('refuses a reply that is not a JSON export', () => {
    const jobs = [{ id: 'a' }];
    for (const reply of [
      null,
      'ok',
      { status: 'error', data: { format: 'json', jobs } },
      { status: 'ok' },
      { status: 'ok', data: { format: 'csv', content: 'id\na\n', count: 1 } },
      { status: 'ok', data: { format: 'json', jobs: 'a' } },
      { status: 'ok', data: { format: 'json', jobs: [{ title: 'no id' }] } },
      { status: 'ok', data: { format: 'json', jobs: [null] } },
    ]) {
      expect(exportedJobsMatching(reply, ['a'])).toBeNull();
    }
  });

  it('names the file by the delete type and time, and records what was about to be deleted', () => {
    const jobs = [{ id: 'a', title: 'Job a' }, { id: 'b', title: 'Job b' }];
    const copy = copyBeforeDelete({
      jobs,
      deletionType: 'hard',
      deletionReason: '  duplicates ',
      savedAt: new Date('2026-11-08T01:02:03.456Z'),
    });
    expect(copy.fileName).toBe('jobs-before-hard-delete-2026-11-08T01-02-03Z.json');
    expect(JSON.parse(copy.content)).toEqual({
      saved_at: '2026-11-08T01:02:03.456Z',
      deletion_type: 'hard',
      deletion_reason: 'duplicates',
      count: 2,
      jobs,
    });

    const soft = copyBeforeDelete({ jobs, deletionType: 'soft', deletionReason: '', savedAt: new Date('2026-11-08T01:02:03Z') });
    expect(soft.fileName).toBe('jobs-before-soft-delete-2026-11-08T01-02-03Z.json');
    expect(JSON.parse(soft.content).deletion_reason).toBeNull();
  });
});
