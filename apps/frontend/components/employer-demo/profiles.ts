import { daysUntil, isoDay, SECTION_BY_KEY } from './engine';
import type { DemoJob, JobProfile, State } from './types';

/**
 * A job profile (section 19, step 10 / Phase 7): the role's facts and choices, saved automatically when the job is published, for the
 * next job like it. The closing date, dates, and positions are left out: they change from job to job. Grouping is kept; section text is not.
 */
export function profileOf(j: DemoJob, at = Date.now()): JobProfile {
  const { deadline: _deadline, closingTime: _time, startDate: _start, positions: _positions, ...facts } = j.facts;
  return {
    id: `pf-${j.id}-${at}`,
    from: j.id,
    title: j.facts.title,
    location: j.facts.location,
    family: j.family,
    format: j.format,
    tags: [...j.tags],
    ...(j.groupOrder?.length ? { groupOrder: [...j.groupOrder] } : {}),
    ...(j.groupOf && Object.keys(j.groupOf).length ? { groupOf: { ...j.groupOf } } : {}),
    facts,
    style: j.style,
    apply: j.apply,
    commitments: [...j.commitments],
    lang: j.lang,
    at,
  };
}

/** The profiles a job published before profiles were saved would have left: one for each published job, the newest first. */
export function profilesFromJobs(jobs: DemoJob[]): JobProfile[] {
  const out: JobProfile[] = [];
  const published = jobs.filter((j) => j.publishedAt && j.facts.title && j.sections.length).sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  for (const j of published) if (!out.some((p) => same(p.title, j.facts.title) && p.location === j.facts.location)) out.push(profileOf(j, j.publishedAt));
  return out;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The saved profile for the role being started (section 19, phase 4): the newest one with the same title, preferring the duty station
 * the new job names. None when the title is not known yet. Profiles whose format is gone are hidden.
 */
export function profileFor(s: State, job: DemoJob): JobProfile | null {
  const title = job.facts.title;
  if (!title) return null;
  const mine = (s.profiles ?? []).filter((p) => same(p.title, title) && s.formats.some((f) => f.key === p.format));
  const city = job.facts.location.split(',')[0].trim().toLowerCase();
  return (city ? mine.find((p) => p.location.split(',')[0].trim().toLowerCase() === city) : undefined) ?? mine[0] ?? null;
}

/** Display name: optional rename, otherwise "Juba Finance Officer". */
export function profileName(p: JobProfile): string {
  const named = p.name?.trim();
  if (named) return named;
  const city = p.location.split(',')[0].trim();
  return city ? `${city} ${p.title}` : p.title;
}

/** Section keys that will actually start from this profile (catalog only). */
export function profileTags(p: JobProfile): string[] {
  return p.tags.filter((k) => SECTION_BY_KEY[k]);
}

/** "today", "yesterday", or "N days ago" from the demo clock (Phase 7 list). */
export function profileSavedWhen(at: number, today: number): string {
  const day = isoDay(at);
  if (day === isoDay(today)) return 'today';
  const n = daysUntil(today, day);
  if (n === -1) return 'yesterday';
  if (n < -1) return `${-n} days ago`;
  if (n === 1) return 'tomorrow';
  return n > 1 ? `in ${n} days` : 'today';
}
