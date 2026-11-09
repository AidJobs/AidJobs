import { formatOf, missingFacts } from './actions';
import { openPoints } from './Checks';
import { headingFor } from './engine';
import { canGoFree } from './plans';
import type { DemoJob, State } from './types';

/** One part of a job on the window's progress line: the JD outline, each section, the details, the fixed text, the check, publishing. */
export type Part = { key: string; label: string; done: boolean; section?: string };

const PLACEHOLDER = /\[(Duty station|Closing date)\]/;

export const sectionPart = (key: string) => `s:${key}`;

export function sectionOf(part: string): string | null {
  return part.startsWith('s:') ? part.slice(2) : null;
}

/** The parts in the line's order: the sections first, then the details, the fixed text, the check, and publishing. */
export function partsOf(job: DemoJob, s: State): Part[] {
  const format = formatOf(s, job.format);
  const amplify = Boolean(job.paidFor) || !canGoFree(s, job.id, null);
  const sections = job.tags.map((k): Part => {
    const sec = job.sections.find((x) => x.key === k);
    return { key: sectionPart(k), label: sec?.title ?? headingFor(k, format), section: k, done: Boolean(sec?.lines.length) && !sec?.lines.some((l) => PLACEHOLDER.test(l)) };
  });
  return [
    { key: 'outline', label: format.label, done: !job.setup },
    ...sections,
    { key: 'details', label: 'Details', done: missingFacts(job.facts).length === 0 },
    { key: 'fixed', label: 'Fixed text', done: job.commitments.length > 0 },
    { key: 'check', label: 'Check', done: job.sections.length > 0 && openPoints(job, s, amplify).length === 0 },
    { key: 'publish', label: 'Publish', done: ['scheduled', 'live', 'closed'].includes(job.status) },
  ];
}

/** The part in view: the one last opened; else Details while the chat asks for a fact; else the first part still to do. */
export function currentPart(job: DemoJob, s: State, parts = partsOf(job, s)): string {
  if (job.setup) return 'outline';
  if (job.part && parts.some((p) => p.key === job.part)) return job.part;
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

/** The parts on the line and those in "+N": the first that fit, with the part in view always on the line. */
export function onLine(parts: Part[], fit: number, current: string): { shown: Part[]; more: Part[] } {
  const n = Math.min(fit, parts.length);
  const at = parts.findIndex((p) => p.key === current);
  const shown = at >= n && n > 0 ? [...parts.slice(0, n - 1), parts[at]] : parts.slice(0, n);
  return { shown, more: parts.filter((p) => !shown.includes(p)) };
}

/** Parts that open their own fields in the panel, so they can be set without the chat; the template opens its own panel. */
export function hasFields(part: string): boolean {
  return ['details', 'fixed', 'check', 'publish', 's:apply'].includes(part);
}
