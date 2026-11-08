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
    { key: 'outline', label: 'JD outline', done: job.sections.length > 0 },
    ...sections,
    { key: 'details', label: 'Details', done: missingFacts(job.facts).length === 0 },
    { key: 'fixed', label: 'Fixed text', done: job.commitments.length > 0 },
    { key: 'check', label: 'Check', done: job.sections.length > 0 && openPoints(job, s, amplify).length === 0 },
    { key: 'publish', label: 'Publish', done: ['scheduled', 'live', 'closed'].includes(job.status) },
  ];
}

/** The part in view: the one last opened; else Details while the chat asks for a fact; else the first part still to do. */
export function currentPart(job: DemoJob, s: State, parts = partsOf(job, s)): string {
  if (job.part && parts.some((p) => p.key === job.part)) return job.part;
  const last = job.chat[job.chat.length - 1];
  if (last?.from === 'ai' && last.ask) return 'details';
  return parts.find((p) => !p.done)?.key ?? 'publish';
}

/** Parts that open their own fields in the panel, so they can be set without the chat. */
export function hasFields(part: string): boolean {
  return ['outline', 'details', 'fixed', 'check', 'publish', 's:apply'].includes(part);
}
