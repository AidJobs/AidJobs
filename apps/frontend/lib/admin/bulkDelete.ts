/**
 * Admin bulk delete (W-45). A delete acts only on selected jobs that are on screen, and only on
 * exactly the set whose impact was analysed; any difference stops it for a fresh confirmation.
 * The backend deletes exactly the IDs it is sent, so this is the only check on what is deleted.
 *
 * A copy before deleting (W-48) is saved by its own read-only export, before the delete request:
 * the delete route's own export reaches the browser only after the jobs are deleted.
 */
import { hardDeleteConfirmationMatches } from './danger';

/** Selected jobs that are in the current list, in list order. */
export function visibleSelection(selected: ReadonlySet<string>, visibleIds: readonly string[]): string[] {
  return Array.from(new Set(visibleIds.filter((id) => selected.has(id))));
}

/** Selected jobs that are not in the current list. */
export function hiddenSelectionCount(selected: ReadonlySet<string>, visibleIds: readonly string[]): number {
  return selected.size - visibleSelection(selected, visibleIds).length;
}

/** The selection without jobs that are no longer in the list; the same set when nothing changed. */
export function pruneSelection(selected: Set<string>, visibleIds: readonly string[]): Set<string> {
  const kept = visibleSelection(selected, visibleIds);
  return kept.length === selected.size ? selected : new Set(kept);
}

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size === setB.size && Array.from(setA).every((id) => setB.has(id));
}

export type ImpactAnalysisRequest = {
  job_ids: string[];
  date_from?: string;
  date_to?: string;
};

export type BulkDeleteRequest = ImpactAnalysisRequest & {
  deletion_type: 'soft' | 'hard';
  deletion_reason?: string;
  export_data: false;
  dry_run: false;
};

/** Never targets an organisation or a source: only the listed jobs, or nothing. */
export function impactAnalysisRequest(ids: readonly string[], dateFrom: string, dateTo: string): ImpactAnalysisRequest | null {
  if (ids.length === 0) return null;
  const body: ImpactAnalysisRequest = { job_ids: [...ids] };
  if (dateFrom) body.date_from = dateFrom;
  if (dateTo) body.date_to = dateTo;
  return body;
}

export type BulkDeleteInput = {
  visibleIds: readonly string[];
  hiddenCount: number;
  analyzedIds: readonly string[] | null;
  deletionType: 'soft' | 'hard';
  deletionReason: string;
  hardConfirmText: string;
  exportData: boolean;
  /** The jobs of the copy saved in this window, or null when none was saved. */
  savedCopyIds: readonly string[] | null;
  dateFrom: string;
  dateTo: string;
};

export type BulkDeleteDecision =
  | { action: 'analyze'; ids: string[] }
  | { action: 'reconfirm'; ids: string[]; message: string }
  | { action: 'blocked'; message: string }
  | { action: 'saveCopy'; ids: string[] }
  | { action: 'send'; body: BulkDeleteRequest };

function selectedJobsText(n: number): string {
  return `${n} selected job${n === 1 ? '' : 's'}`;
}

/** What one press of the delete window's main button does. */
export function decideBulkDelete(input: BulkDeleteInput): BulkDeleteDecision {
  const ids = Array.from(new Set(input.visibleIds));
  if (input.hiddenCount > 0) {
    return {
      action: 'reconfirm',
      ids,
      message: `${selectedJobsText(input.hiddenCount)} ${input.hiddenCount === 1 ? 'is' : 'are'} no longer on screen and ${input.hiddenCount === 1 ? 'was' : 'were'} removed from your selection. Nothing was deleted. Review the selection and confirm again.`,
    };
  }
  if (ids.length === 0) {
    return { action: 'blocked', message: 'Select the jobs to delete first.' };
  }
  if (input.analyzedIds === null) {
    return { action: 'analyze', ids };
  }
  if (!sameIds(input.analyzedIds, ids)) {
    return {
      action: 'reconfirm',
      ids,
      message: 'The selection changed after the impact was analysed. Nothing was deleted. Analyze the impact again and confirm.',
    };
  }
  if (input.deletionType === 'hard' && !input.deletionReason.trim()) {
    return { action: 'blocked', message: 'Deletion reason is required for hard delete' };
  }
  if (input.deletionType === 'hard' && !hardDeleteConfirmationMatches(input.hardConfirmText, ids.length)) {
    return { action: 'blocked', message: `Type ${ids.length} to confirm the Hard Delete.` };
  }
  if (input.exportData && !(input.savedCopyIds !== null && sameIds(input.savedCopyIds, ids))) {
    return { action: 'saveCopy', ids };
  }
  const body: BulkDeleteRequest = {
    job_ids: ids,
    deletion_type: input.deletionType,
    export_data: false,
    dry_run: false,
  };
  if (input.deletionReason) body.deletion_reason = input.deletionReason;
  if (input.dateFrom) body.date_from = input.dateFrom;
  if (input.dateTo) body.date_to = input.dateTo;
  return { action: 'send', body };
}

export type ExportRequest = { job_ids: string[]; format: 'json' };

/** The read-only export of exactly these jobs; nothing when no job is given. */
export function exportRequest(ids: readonly string[]): ExportRequest | null {
  if (ids.length === 0) return null;
  return { job_ids: Array.from(new Set(ids)), format: 'json' };
}

export type ExportedJob = Record<string, unknown> & { id: string };

/** The exported jobs when the reply holds exactly the requested jobs, each once; otherwise null. */
export function exportedJobsMatching(reply: unknown, ids: readonly string[]): ExportedJob[] | null {
  if (typeof reply !== 'object' || reply === null) return null;
  const { status, data } = reply as { status?: unknown; data?: unknown };
  if (status !== 'ok' || typeof data !== 'object' || data === null) return null;
  const { format, jobs } = data as { format?: unknown; jobs?: unknown };
  if (format !== 'json' || !Array.isArray(jobs)) return null;
  if (!jobs.every((j) => typeof j === 'object' && j !== null && typeof (j as { id?: unknown }).id === 'string')) {
    return null;
  }
  const exported = jobs as ExportedJob[];
  const exportedIds = exported.map((j) => j.id);
  if (new Set(exportedIds).size !== exportedIds.length || !sameIds(exportedIds, ids)) return null;
  return exported;
}

export type SavedCopy = { fileName: string; content: string };

/** The file saved before a delete: what was about to be deleted, how, why, and when. */
export function copyBeforeDelete(input: {
  jobs: readonly ExportedJob[];
  deletionType: 'soft' | 'hard';
  deletionReason: string;
  savedAt: Date;
}): SavedCopy {
  const savedAt = input.savedAt.toISOString();
  const stamp = `${savedAt.slice(0, 19).replace(/:/g, '-')}Z`;
  const content = JSON.stringify(
    {
      saved_at: savedAt,
      deletion_type: input.deletionType,
      deletion_reason: input.deletionReason.trim() || null,
      count: input.jobs.length,
      jobs: input.jobs,
    },
    null,
    2,
  );
  return { fileName: `jobs-before-${input.deletionType}-delete-${stamp}.json`, content };
}
