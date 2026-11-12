import { approvalRequired, approvedFor } from './approval';
import { addSuggestions, SECTION_BY_KEY } from './engine';
import { isPublished } from './lifecycle';
import { basicAdvertCheck, fullAdvertCheck, marketCheck, type Point } from './market';
import { inferSdgs } from './setup';
import { versionsOf } from './translate';
import type { AskKind, DemoJob, Format, GroupKey, JobLang, State, Walk } from './types';

/**
 * A new employer's writing, in order (employer-side plan, section 19, steps 3 to 7): each fact just before the first section that uses
 * it, then the section written and approved, then what is left (the facts no section used, the other details, the fixed text, and
 * suggestions), then the basic check point by point. One function says what comes next; the AI words it and the rules carry it out,
 * and when the AI is off the rules do both, in the same order.
 */

/** Sections the rules write from the organisation's profile and its application settings; the AI never writes them. */
export const FIXED_SECTIONS = ['about', 'apply'];

/** The facts each group of sections needs, asked just before its first section. */
export const FACTS_BEFORE: Record<GroupKey, AskKind[]> = {
  employer: ['title', 'place', 'contract', 'grade'],
  job: ['title', 'place', 'contract', 'grade'],
  person: ['eligibility', 'languages', 'safeguarding'],
  offer: ['salary'],
  apply: ['deadline', 'method'],
};

export const ASKS: AskKind[] = ['title', 'place', 'contract', 'grade', 'eligibility', 'languages', 'safeguarding', 'salary', 'deadline', 'method'];

/** Questions that can be answered by keeping the default or saying there is none; the others need a value. */
export const DECLINABLE: AskKind[] = ['grade', 'eligibility', 'languages', 'safeguarding', 'salary', 'method'];

/** The parts of step 6 that are settled once answered. */
export const LEFT = ['details', 'sdgs', 'fixed', 'suggest'] as const;

/** The parts of steps 8 and 9 that are settled once answered: the plan, Amplify's parts, and review where it is optional. */
export const LATER = ['plan', 'market', 'full', 'langs', 'flyer', 'reach', 'review'] as const;

let aiWriting = false;

/** Whether the AI writes the sections (it is on); otherwise the rules write them as soon as they are reached. */
export function aiWrites(): boolean {
  return aiWriting;
}

export function setAiWrites(on: boolean) {
  aiWriting = on;
}

function formatFor(s: State, key: string): Format {
  return s.formats.find((f) => f.key === key) ?? s.formats[0];
}

/** Whether a fact is known from the job itself; facts with a default (who can apply, the method) are known only once asked. */
export function isKnown(kind: AskKind, job: DemoJob): boolean {
  const f = job.facts;
  switch (kind) {
    case 'title':
      return Boolean(f.title);
    case 'place':
      return Boolean(f.location) || f.arrangement === 'remote';
    case 'contract':
      return f.engagement !== 'job' || Boolean(f.contract);
    case 'grade':
      return f.engagement !== 'job' || Boolean(f.grade);
    case 'languages':
      return f.languages.length > 0;
    case 'safeguarding':
      return f.safeguarding !== '';
    case 'salary':
      return Boolean(f.salaryMin);
    case 'deadline':
      return Boolean(f.deadline);
    default:
      return false;
  }
}

/** A question answered: by a value, by the user keeping the default or saying there is none, or a part of step 6 done. */
export function isSettled(kind: string, job: DemoJob): boolean {
  return ((ASKS as string[]).includes(kind) && isKnown(kind as AskKind, job)) || Boolean(job.walk?.settled.includes(kind));
}

/** The facts a set of changed fact fields answers, so setting them by hand or in the chat settles their question. */
export function asksOf(fields: string[]): AskKind[] {
  const by: Record<string, AskKind> = { title: 'title', location: 'place', arrangement: 'place', contract: 'contract', grade: 'grade', eligibility: 'eligibility', languages: 'languages', safeguarding: 'safeguarding', salaryMode: 'salary', salaryMin: 'salary', deadline: 'deadline' };
  return Array.from(new Set(fields.map((k) => by[k]).filter((k): k is AskKind => Boolean(k))));
}

export type Step =
  | { kind: 'setup'; stage: 'template' | 'style' | 'pace' }
  | { kind: 'change' }
  | { kind: 'again' }
  | { kind: 'genuine'; point: string }
  | { kind: 'ask'; fact: AskKind; section?: string }
  | { kind: 'write'; sections: string[] }
  | { kind: 'approve'; section: string }
  | { kind: 'details' }
  | { kind: 'sdgs' }
  | { kind: 'fixed' }
  | { kind: 'keep'; what: 'fixed' | 'apply' }
  | { kind: 'suggest'; sections: string[] }
  | { kind: 'check'; point: Point }
  | { kind: 'plan' }
  | { kind: 'market'; point: Point }
  | { kind: 'full'; point: Point }
  | { kind: 'langs' }
  | { kind: 'version'; lang: JobLang }
  | { kind: 'flyer' }
  | { kind: 'reach' }
  | { kind: 'review' }
  | { kind: 'waiting' }
  | { kind: 'publish' }
  | { kind: 'live' };

/** Amplify's parts, each on the line once Amplify is chosen; settled when answered, even with "no thanks". */
export const AMPLIFY_PARTS = ['market', 'full', 'langs', 'flyer', 'reach'] as const;

/** The market check's points still open, without those left as they are; none when there are too few similar jobs. */
export function marketPoints(job: DemoJob, s: State): Point[] {
  const m = marketCheck(job, s, job.publishOn ?? null);
  return m.thin ? [] : m.points.filter((p) => !p.ok && !job.walk?.skipped?.includes(`market:${p.key}`));
}

/** The full advert check's points still open (requirements and pay, against similar jobs), without those left as they are. */
export function fullPoints(job: DemoJob, s: State): Point[] {
  const f = fullAdvertCheck(job, s);
  return f.thin ? [] : f.points.filter((p) => !p.ok && !job.walk?.skipped?.includes(`full:${p.key}`));
}

/**
 * Kept for next time (section 19, step 10): the first time the fixed text and the way to apply come up, the chat offers to keep them for
 * every job; only to the owner, the one who may change Organisation settings in the demo. For others they apply to this job only.
 */
export function keepToOffer(job: DemoJob, s: State): 'fixed' | 'apply' | null {
  if (s.me.role !== 'owner' || s.reviewerAs || isPublished(job)) return null;
  const offered = s.org.keepOffered ?? [];
  if (!offered.includes('fixed') && !s.org.keptFixed && job.commitments.length) return 'fixed';
  if (!offered.includes('apply') && !s.org.keptApply) return 'apply';
  return null;
}

/** Whether the job goes out with Amplify: chosen before publishing, or already published with it. */
export function amplifying(job: DemoJob): boolean {
  return isPublished(job) ? job.plan === 'amplify' : job.choice === 'amplify';
}

/**
 * Steps 8 and 9 (section 19): Free or Amplify; with Amplify, its parts one at a time (the market check, the full advert check, the
 * language versions and their review, the flyer, Reach); then review, where it is asked for or required; then publishing; then the
 * link. Each is answered in the chat or from its part on the line.
 */
function afterCheck(job: DemoJob, s: State): Step {
  if (isPublished(job)) return { kind: 'live' };
  if (!isSettled('plan', job)) return { kind: 'plan' };
  if (job.choice === 'amplify') {
    const market = marketPoints(job, s)[0];
    if (market && !isSettled('market', job)) return { kind: 'market', point: market };
    const full = fullPoints(job, s)[0];
    if (full && !isSettled('full', job)) return { kind: 'full', point: full };
    if (!isSettled('langs', job)) return { kind: 'langs' };
    const draft = versionsOf(job).find((k) => !job.translations?.[k]?.reviewed);
    if (draft) return { kind: 'version', lang: draft };
    if (!isSettled('flyer', job)) return { kind: 'flyer' };
    if (!isSettled('reach', job)) return { kind: 'reach' };
  }
  const required = approvalRequired(s, job);
  if (required && !approvedFor(s, job)) return job.review.state === 'none' ? { kind: 'review' } : { kind: 'waiting' };
  if (!required && job.review.state === 'none' && !isSettled('review', job)) return { kind: 'review' };
  return { kind: 'publish' };
}

export function isWritten(job: DemoJob, key: string): boolean {
  return job.sections.some((x) => x.key === key && x.lines.length > 0);
}

/** The basic check's open points, without those the user chose to leave; Google's needs are asked for as facts. */
export function checkPoints(job: DemoJob, s: State): Point[] {
  return basicAdvertCheck(job, s).filter((p) => !p.ok && p.key !== 'google' && !job.walk?.skipped?.includes(p.key));
}

/** Up to three sections that would make this job description stronger, not in it yet. */
export function suggestionsFor(job: DemoJob, s: State): string[] {
  return addSuggestions(formatFor(s, job.format), job.facts)
    .filter((k) => !job.tags.includes(k))
    .slice(0, 3);
}

/** What comes next for a job started in the window; null for a job that is not walked through (the samples, earlier versions). */
export function nextStep(job: DemoJob, s: State): Step | null {
  const w = job.walk;
  if (!w) return null;
  // Once published, the writing is over: editing a job in its state is phase 4's (section 19, "A returning employer").
  if (isPublished(job)) return { kind: 'live' };
  if (job.setup) return { kind: 'setup', stage: job.setup };
  if (w.pending) return { kind: 'change' };
  if (w.awaiting) return { kind: 'genuine', point: w.awaiting.point };
  // Hire again (section 19, phase 4): what changes comes first, then each section for a quick "keep as is".
  if (w.again && !w.settled.includes('again')) return { kind: 'again' };
  if (!isSettled('title', job)) return { kind: 'ask', fact: 'title' };
  const unwritten = job.tags.filter((k) => !isWritten(job, k));
  const all = w.pace === 'all';
  if (all && unwritten.length && !job.tags.some((k) => !FIXED_SECTIONS.includes(k) && isWritten(job, k))) return { kind: 'write', sections: unwritten };
  for (const k of job.tags) {
    if (w.approved.includes(k) && isWritten(job, k)) continue;
    const ask = FACTS_BEFORE[SECTION_BY_KEY[k]?.group ?? 'job'].find((f) => !isSettled(f, job));
    if (ask) return { kind: 'ask', fact: ask, section: k };
    if (!isWritten(job, k)) return { kind: 'write', sections: all ? unwritten : [k] };
    return { kind: 'approve', section: k };
  }
  const ask = ASKS.find((f) => !isSettled(f, job));
  if (ask) return { kind: 'ask', fact: ask };
  if (!isSettled('details', job)) return { kind: 'details' };
  if (!isSettled('sdgs', job) && !job.sdgs && !inferSdgs(job).length && s.org.sdgs.length) return { kind: 'sdgs' };
  if (!isSettled('fixed', job)) return { kind: 'fixed' };
  const keep = keepToOffer(job, s);
  if (keep) return { kind: 'keep', what: keep };
  const offered = suggestionsFor(job, s);
  if (!isSettled('suggest', job) && offered.length) return { kind: 'suggest', sections: offered };
  const point = checkPoints(job, s)[0];
  if (point && !isPublished(job)) return { kind: 'check', point };
  return afterCheck(job, s);
}

/** The step as a short key, stored on the message that asks about it. */
export function stepKey(step: Step | null): string {
  if (!step) return '';
  switch (step.kind) {
    case 'setup':
      return `setup:${step.stage}`;
    case 'genuine':
      return `genuine:${step.point}`;
    case 'ask':
      return `ask:${step.fact}`;
    case 'write':
      return `write:${step.sections.join(',')}`;
    case 'approve':
      return `approve:${step.section}`;
    case 'suggest':
      return `suggest:${step.sections.join(',')}`;
    case 'check':
      return `check:${step.point.key}`;
    case 'market':
    case 'full':
      return `${step.kind}:${step.point.key}`;
    case 'version':
      return `version:${step.lang}`;
    case 'keep':
      return `keep:${step.what}`;
    default:
      return step.kind;
  }
}

/** The part of the window a step is about, so the line follows the conversation. */
export function partOfStep(step: Step | null, job: DemoJob): string | null {
  if (!step) return null;
  switch (step.kind) {
    case 'ask':
      return step.fact === 'method' ? 's:apply' : 'details';
    case 'write':
      return `s:${step.sections[0]}`;
    case 'approve':
      return `s:${step.section}`;
    case 'change':
      return job.walk?.pending?.changes[0] ? `s:${job.walk.pending.changes[0].key}` : null;
    case 'details':
    case 'sdgs':
    case 'again':
      return 'details';
    case 'fixed':
      return 'fixed';
    case 'keep':
      return step.what === 'fixed' ? 'fixed' : 's:apply';
    case 'check':
      return step.point.section ? `s:${step.point.section}` : 'check';
    case 'plan':
    case 'market':
    case 'full':
    case 'langs':
    case 'flyer':
    case 'reach':
      return step.kind;
    case 'version':
      return 'langs';
    case 'review':
    case 'waiting':
      return 'review';
    case 'publish':
    case 'live':
      return 'publish';
    default:
      return null;
  }
}

/**
 * A job written before the window (the sample jobs, and jobs saved by earlier versions), brought forward when the demo loads (section 19,
 * phase 4): its written sections approved and its questions settled, so the window takes it on from where it stands. A fact it still
 * lacks (a closing date, say) is asked, as before. A job in review or approved has been read by its reviewers, so the basic check's
 * points are left as they are. Published jobs need no steps.
 */
export function broughtForward(job: DemoJob, s: State): DemoJob {
  if (job.walk || job.setup || isPublished(job) || !job.sections.length) return job;
  const walk: Walk = { pace: 'all', approved: job.tags.filter((k) => isWritten(job, k)), settled: [...DECLINABLE, ...LEFT] };
  const base: DemoJob = { ...job, walk };
  if (job.status === 'draft') return base;
  const skipped = checkPoints(base, s).map((p) => p.key);
  return skipped.length ? { ...base, walk: { ...walk, skipped } } : base;
}

/** The step after this section is approved, so the AI can go straight on. */
export function afterApproval(job: DemoJob, s: State, section: string): Step | null {
  if (!job.walk) return null;
  return nextStep({ ...job, walk: { ...job.walk, approved: [...job.walk.approved, section] } }, s);
}
