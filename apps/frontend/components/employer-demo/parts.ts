import { formatOf, missingFacts } from './actions';
import { approvalRequired, approvedFor } from './approval';
import { openPoints } from './Checks';
import { headingFor } from './engine';
import { amplifying, ASKS, checkPoints, flyerStale, fullPoints, isSettled, marketPoints, reachOpen, reviewDone } from './flow';
import { isPublished } from './lifecycle';
import { versionsOf } from './translate';
import type { DemoJob, State } from './types';

/** One part of a job on the window's progress line: the JD outline, each section, the details, the fixed text, the check, publishing. */
export type Part = { key: string; label: string; done: boolean; section?: string };

const PLACEHOLDER = /\[(Duty station|Closing date)\]/;

export const sectionPart = (key: string) => `s:${key}`;

export function sectionOf(part: string): string | null {
  return part.startsWith('s:') ? part.slice(2) : null;
}

/**
 * A JD section part that is still on the job (U-2). Never returns an orphan `s:gone` key, and never invents Market/Review/Publish.
 * `neighbour` is a section key still in `tags` (e.g. the one before a remove); preferred only when it is still present.
 */
export function keepJdPart(tags: string[], part?: string | null, neighbour?: string | null): string | undefined {
  if (part?.startsWith('s:') && tags.includes(part.slice(2))) return part;
  if (neighbour && tags.includes(neighbour)) return sectionPart(neighbour);
  return tags[0] ? sectionPart(tags[0]) : undefined;
}

/**
 * The parts in the line's order: the sections first, then the details, the fixed text, the check, and publishing. A job written step by
 * step ticks a section off when it is approved, and the details, the fixed text, and the check when their steps are answered.
 */
export function partsOf(job: DemoJob, s: State): Part[] {
  const format = formatOf(s, job.format);
  const amplify = amplifying(job);
  const published = isPublished(job);
  const walk = job.walk;
  const settled = (k: string) => published || isSettled(k, job);
  const required = approvalRequired(s, job);
  const planLabel = (published ? job.plan : job.choice) === 'amplify' ? 'Amplify' : (published ? job.plan : job.choice) === 'free' ? 'Free' : 'Free or Amplify';
  // Phase 5's order (section 19, C): Amplify's checks and languages, then review, then Reach and the flyer, which open once review is done.
  const open = reachOpen(job, s);
  const later: Part[] = [
    { key: 'plan', label: planLabel, done: published || Boolean(job.choice) },
    ...(amplify
      ? [
          { key: 'market', label: 'Market check', done: settled('market') || marketPoints(job, s).length === 0 },
          { key: 'full', label: 'Full check', done: settled('full') || fullPoints(job, s).length === 0 },
          { key: 'langs', label: 'Languages', done: settled('langs') && versionsOf(job).every((k) => job.translations?.[k]?.reviewed) },
        ]
      : []),
    { key: 'review', label: 'Review', done: published || (required ? approvedFor(s, job) : reviewDone(job, s)) },
    ...(amplify
      ? [
          { key: 'reach', label: 'Reach', done: open && (settled('reach') || Boolean(job.reachPlan)) },
          { key: 'flyer', label: flyerStale(job, s) ? 'Flyer (out of date)' : 'Flyer', done: open && settled('flyer') },
        ]
      : []),
  ];
  const sections = job.tags.map((k): Part => {
    const sec = job.sections.find((x) => x.key === k);
    const written = Boolean(sec?.lines.length);
    return { key: sectionPart(k), label: sec?.title ?? job.renamed?.[k] ?? headingFor(k, format), section: k, done: walk ? written && walk.approved.includes(k) : written && !sec?.lines.some((l) => PLACEHOLDER.test(l)) };
  });
  return [
    { key: 'outline', label: format.label, done: !job.setup },
    ...sections,
    { key: 'details', label: 'Details', done: walk ? ASKS.every((k) => isSettled(k, job)) && isSettled('details', job) : missingFacts(job.facts).length === 0 },
    { key: 'fixed', label: 'Fixed text', done: walk ? isSettled('fixed', job) : job.commitments.length > 0 },
    { key: 'check', label: 'Check', done: walk ? job.sections.length > 0 && !job.setup && checkPoints(job, s).length === 0 : job.sections.length > 0 && openPoints(job, s, false).length === 0 },
    ...later,
    { key: 'publish', label: 'Publish', done: published },
  ];
}

/** The part in view: the one last opened; else Details while the chat asks for a fact; else the first part still to do. */
export function currentPart(job: DemoJob, s: State, parts = partsOf(job, s)): string {
  if (job.setup) return 'outline';
  if (job.part && parts.some((p) => p.key === job.part)) return job.part;
  // Orphan `s:gone` after a remove/undo: stay on a remaining JD section — never fall through to Market/Review/Publish (U-2).
  if (job.part?.startsWith('s:')) {
    const pinned = keepJdPart(job.tags, job.part);
    if (pinned && parts.some((p) => p.key === pinned)) return pinned;
  }
  const last = job.chat[job.chat.length - 1];
  if (last?.from === 'ai' && last.ask) return 'details';
  return parts.find((p) => !p.done)?.key ?? 'publish';
}

/** How many parts fit in `room` pixels; when not all of them, room is kept for the "+N" button. */
export function lineFit(widths: number[], room: number, more = 52): number {
  if (widths.reduce((a, w) => a + w, 0) <= room) return widths.length;
  let used = more;
  let n = 0;
  while (n < widths.length && used + widths[n] <= room) used += widths[n++];
  return Math.max(1, n);
}

/**
 * The parts on the line and those in "+N".
 * R1-09: when the part in view sits past the first `fit` slots, show a window ending at it — so Languages /
 * Review stay with Publish instead of early sections + Publish while those sit only in +N.
 */
export function onLine(parts: Part[], fit: number, current: string): { shown: Part[]; more: Part[] } {
  const n = Math.min(fit, parts.length);
  const at = parts.findIndex((p) => p.key === current);
  const shown = at >= n && n > 0 ? parts.slice(at - n + 1, at + 1) : parts.slice(0, n);
  return { shown, more: parts.filter((p) => !shown.includes(p)) };
}

/** Parts that open their own fields in the panel, so they can be set without the chat; the template opens its own panel. About us and Project live in the JD section itself. */
export function hasFields(part: string): boolean {
  return ['details', 'fixed', 'check', 'plan', 'market', 'full', 'langs', 'flyer', 'reach', 'review', 'publish', 's:apply'].includes(part);
}
