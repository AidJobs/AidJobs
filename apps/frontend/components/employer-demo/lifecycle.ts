/** Managing jobs after they are written (employer-side plan, section 17): the grace period after closing, deletion, and erasure. */
import type { DemoJob, State } from './types';

const DAY = 86_400_000;

/** A closed job stays in "Closed", with its second chances, for 14 days; then it moves to History. */
export const GRACE_DAYS = 14;
/** A deleted job can be restored for 14 days; then it is erased. */
export const KEEP_DELETED_DAYS = 14;
/** The public side, unchanged (growth plan decision 5): the closed page shows for 30 days; the description is dropped at 90. */
export const PAGE_REMOVED_DAYS = 30;
export const TEXT_DROPPED_DAYS = 90;

export function isPublished(j: DemoJob): boolean {
  return j.status === 'scheduled' || j.status === 'live' || j.status === 'closed';
}

export function graceEnds(j: DemoJob): number | null {
  return j.status === 'closed' && j.closedAt !== undefined ? j.closedAt + GRACE_DAYS * DAY : null;
}

export function inGrace(j: DemoJob, today: number): boolean {
  const end = graceEnds(j);
  return end !== null && today < end;
}

export function erasedOn(at: number): number {
  return at + KEEP_DELETED_DAYS * DAY;
}

/** Deleted jobs older than 14 days are erased: only a line in the activity log stays. */
export function purgeDeleted(s: State): State {
  const old = (s.deleted ?? []).filter((d) => s.today >= erasedOn(d.at));
  if (!old.length) return s;
  return {
    ...s,
    deleted: (s.deleted ?? []).filter((d) => s.today < erasedOn(d.at)),
    activity: [...old.map((d) => ({ at: s.today, who: 'AidJobs', what: `Erased for good: "${d.job.facts.title || 'untitled job'}", 14 days after it was deleted` })), ...(s.activity ?? [])],
  };
}
