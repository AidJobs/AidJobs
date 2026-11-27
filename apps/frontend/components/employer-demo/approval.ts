import type { DemoJob, State } from './types';

/** Whether the organisation asks for approval on this job: on every job, or on senior roles (configured seniorGrades, or UN P4/P5/D/NO-D). */
export function approvalRequired(s: State, j: DemoJob): boolean {
  if (s.org.approval === 'all') return true;
  if (s.org.approval === 'senior') {
    const grade = j.facts.grade.trim().toUpperCase().replace(/\s+/g, '');
    if (!grade) return false;
    if (s.org.seniorGrades?.length) {
      return s.org.seniorGrades.some((g) => g.trim().toUpperCase().replace(/\s+/g, '') === grade);
    }
    return /^(P-?[45]|D-?\d|NO-?D)$/i.test(grade);
  }
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
