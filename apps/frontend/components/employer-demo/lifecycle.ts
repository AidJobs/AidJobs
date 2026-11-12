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

/** Reopen (decision 5): within the 14 days, for a job closed early, withdrawn, or past its date; a filled position uses Hire again. */
export function canReopen(j: DemoJob, today: number): boolean {
  return inGrace(j, today) && j.closeReason !== 'filled';
}

/** 30 days after closing the closed page is removed: links then say "This vacancy is no longer available". */
export function pageRemoved(j: DemoJob, today: number): boolean {
  return j.status === 'closed' && j.closedAt !== undefined && today >= j.closedAt + PAGE_REMOVED_DAYS * DAY;
}

/** 90 days after closing the description is dropped; the basic record stays. */
export function textDropped(j: DemoJob, today: number): boolean {
  return j.status === 'closed' && j.closedAt !== undefined && today >= j.closedAt + TEXT_DROPPED_DAYS * DAY;
}

/** An action on a job in its state (section 17's menu), as the window offers it: each opens its own dialog, or is its own button. */
export type StateAction = 'publishNow' | 'reschedule' | 'backToDraft' | 'extend' | 'share' | 'amplify' | 'filled' | 'close' | 'withdraw' | 'reopen' | 'hire' | 'download' | 'delete';

export const STATE_LABEL: Record<StateAction, string> = {
  publishNow: 'Publish now',
  reschedule: 'Change the date',
  backToDraft: 'Back to draft',
  extend: 'Extend',
  share: 'Share',
  amplify: 'Amplify',
  filled: 'Position filled',
  close: 'Close now',
  withdraw: 'Withdraw',
  reopen: 'Reopen',
  hire: 'Hire again',
  download: 'Download a copy',
  delete: 'Delete',
};

/**
 * The actions a job opened in the window offers for its state (section 19, phase 4, from section 17's menu), with its permission rules:
 * only the owner deletes a published job, and reviewers have none. Editing is the window itself, and a draft's steps are the chat's.
 */
export function stateActionsOf(s: State, j: DemoJob): StateAction[] {
  if (s.reviewerAs) return [];
  const del: StateAction[] = s.me.role === 'owner' ? ['delete'] : [];
  if (j.status === 'scheduled') return ['publishNow', 'reschedule', 'backToDraft', ...del];
  if (j.status === 'live') return ['extend', 'share', ...(j.plan === 'free' && s.org.verified ? (['amplify'] as const) : []), 'filled', 'close', 'withdraw', ...del];
  if (j.status === 'closed') return [...(canReopen(j, s.today) ? (['reopen'] as const) : []), 'hire', 'download'];
  return [];
}

export function erasedOn(at: number): number {
  return at + KEEP_DELETED_DAYS * DAY;
}

/** Deleted jobs are erased on the day shown, 14 days after deletion: only a line in the activity log stays. */
export function purgeDeleted(s: State): State {
  const due = (d: { at: number }) => s.today >= new Date(erasedOn(d.at)).setHours(0, 0, 0, 0);
  const old = (s.deleted ?? []).filter(due);
  if (!old.length) return s;
  return {
    ...s,
    deleted: (s.deleted ?? []).filter((d) => !due(d)),
    activity: [...old.map((d) => ({ at: s.today, who: 'AidJobs', what: `Erased for good: "${d.job.facts.title || 'untitled job'}", 14 days after it was deleted` })), ...(s.activity ?? [])],
  };
}
