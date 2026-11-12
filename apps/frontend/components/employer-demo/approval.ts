import type { DemoJob, State } from './types';

/** Whether the organisation asks for approval on this job: on every job, or on senior roles (P4 and above, and D grades). */
export function approvalRequired(s: State, j: DemoJob): boolean {
  if (s.org.approval === 'all') return true;
  if (s.org.approval === 'senior') return /^(P[45]|D\d)/.test(j.facts.grade);
  return false;
}

export function isApproved(j: DemoJob): boolean {
  return j.review.state === 'approved' || (j.review.rule === 'any' ? j.review.reviewers.some((r) => r.decision === 'approved') : j.review.reviewers.length > 0 && j.review.reviewers.every((r) => r.decision === 'approved'));
}

/** "Any request for changes pauses publishing": with that setting, an open request withdraws an approval that is required. */
export function pausedByChanges(s: State, j: DemoJob): boolean {
  return Boolean(s.org.changesPause) && approvalRequired(s, j) && j.review.reviewers.some((r) => r.decision === 'changes');
}

/** Approved, as far as publishing is concerned. */
export function approvedFor(s: State, j: DemoJob): boolean {
  return isApproved(j) && !pausedByChanges(s, j);
}
