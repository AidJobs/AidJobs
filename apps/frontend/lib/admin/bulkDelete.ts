/**
 * Admin bulk delete (W-45). A delete acts only on selected jobs that are on screen, and only on
 * exactly the set whose impact was analysed; any difference stops it for a fresh confirmation.
 * The backend deletes exactly the IDs it is sent, so this is the only check on what is deleted.
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
  export_data: boolean;
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
  dateFrom: string;
  dateTo: string;
};

export type BulkDeleteDecision =
  | { action: 'analyze'; ids: string[] }
  | { action: 'reconfirm'; ids: string[]; message: string }
  | { action: 'blocked'; message: string }
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
  const body: BulkDeleteRequest = {
    job_ids: ids,
    deletion_type: input.deletionType,
    export_data: input.exportData,
    dry_run: false,
  };
  if (input.deletionReason) body.deletion_reason = input.deletionReason;
  if (input.dateFrom) body.date_from = input.dateFrom;
  if (input.dateTo) body.date_to = input.dateTo;
  return { action: 'send', body };
}
