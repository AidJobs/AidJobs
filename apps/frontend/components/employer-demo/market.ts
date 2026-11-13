/**
 * The market check and the advert checks (employer-side plan, section 16, decision 6). In production every figure comes from the jobs
 * AidJobs collects, with its count shown; the demo uses a labelled sample of similar open jobs, generated the same way every time for a
 * role and a place. Where there are too few similar jobs, the check says so instead of guessing.
 */
import { addDays, allLines, daysUntil, findInclusive, holiday, isoDay, longDate, parseIso, PLACES, placeOf, quality, roleByKey, salarySuggestion, weekend, type Place } from './engine';
import type { DemoJob, Facts, State } from './types';

/** Below this many similar open jobs, nothing is compared. */
export const MIN_SIMILAR = 5;

export type SimilarJob = { org: string; title: string; city: string; country: string; iso: string; daysOpen: number; closes: string; languages: string[]; showsPay: boolean; years: number; essentials: number };

/** A one-tap fix: what changes, in the job's own terms. */
export type Fix = { kind: 'deadline'; date: string } | { kind: 'language'; lang: string } | { kind: 'facts'; patch: Partial<Facts> } | { kind: 'text'; section: string; lines: string[] };

/** `hit`: for highlighted wording, the key a genuine requirement is kept under; `line`: the line it is in. */
export type Point = { key: string; ok: boolean; title: string; detail?: string; fix?: { label: string; fix: Fix }; section?: string; hit?: string; line?: string };

const ORGS = ['Harbour Health Alliance', 'Meridian Education Trust', 'Northfield Relief', 'Bluewater Climate Fund', 'Open Hands Foundation', 'Lakeshore Development Partners', 'Cedar Humanitarian', 'Sunrise Community Action', 'Tideway Aid', 'Granite Relief International', 'Willow Child Fund', 'Kestrel Water Initiative'];

/** Similar open jobs in the sample, by role family; communications and climate are kept thin on purpose, to show what the check says then. */
const COUNT: Record<string, number> = { wash: 14, health: 18, protection: 12, education: 11, meal: 9, finance: 16, logistics: 13, comms: 3, climate: 4, livelihoods: 10, hr: 7, programme: 21 };
const YEARS: Record<string, number> = { wash: 5, health: 3, protection: 4, education: 3, meal: 5, finance: 3, logistics: 3, comms: 2, climate: 5, livelihoods: 3, hr: 3, programme: 5 };
const OPEN_DAYS: Record<string, number> = { finance: 21, logistics: 21, comms: 18, programme: 30 };

const REGIONS: Array<{ name: string; isos: string[] }> = [
  { name: 'East Africa', isos: ['KE', 'UG', 'ET', 'SS', 'SO'] },
  { name: 'Central and West Africa', isos: ['CD', 'NG', 'SN'] },
  { name: 'Southern Africa', isos: ['MW', 'MZ'] },
  { name: 'the Middle East', isos: ['JO'] },
  { name: 'South Asia', isos: ['BD', 'AF', 'NP', 'IN'] },
  { name: 'South-East Asia', isos: ['PH'] },
  { name: 'Latin America and the Caribbean', isos: ['HT', 'CO'] },
  { name: 'Europe', isos: ['CH', 'GB'] },
  { name: 'North America', isos: ['US'] },
  { name: 'Australia', isos: ['AU'] },
];

/** The language similar jobs in a country most often ask for besides English. */
export const LOCAL_LANG: Record<string, string> = { CD: 'French', SN: 'French', HT: 'French', JO: 'Arabic', SS: 'Arabic', SO: 'Arabic', MZ: 'Portuguese', CO: 'Spanish', KE: 'Swahili', UG: 'Swahili' };

function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

/** The first working day on or after a date in the duty-station country. */
export function workingDay(iso: string, countryIso: string): string {
  let d = iso;
  for (let i = 0; i < 7 && (weekend(d, countryIso) || holiday(d, countryIso)); i++) d = addDays(parseIso(d) + 12 * 3_600_000, 1);
  return d;
}

function jobPlace(job: DemoJob, s: State): Place {
  return placeOf(job.facts.location) ?? PLACES.find((p) => p.iso === job.facts.iso) ?? PLACES.find((p) => s.org.countries.includes(p.country)) ?? PLACES[0];
}

function regionOf(iso: string) {
  return REGIONS.find((r) => r.isos.includes(iso)) ?? REGIONS[0];
}

/** The last working day of the month ten days from now: when many vacancies close. */
function monthEnd(today: number, iso: string): string {
  const d = new Date(today + 10 * 86_400_000);
  let last = isoDay(new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime());
  for (let i = 0; i < 7 && (weekend(last, iso) || holiday(last, iso)); i++) last = addDays(parseIso(last) + 12 * 3_600_000, -1);
  return last;
}

/** Similar open jobs from the labelled sample: the same every time for a role and a place. */
export function similarJobs(job: DemoJob, s: State): SimilarJob[] {
  const role = roleByKey(job.family);
  const place = jobPlace(job, s);
  const region = regionOf(place.iso);
  const nearby = PLACES.filter((p) => region.isos.includes(p.iso));
  const rand = seeded(`${role.key}|${place.iso}`);
  const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const n = COUNT[role.key] ?? 8;
  const busy = monthEnd(s.today, place.iso);
  const out: SimilarJob[] = [];
  for (let i = 0; i < n; i++) {
    const p = i % 2 === 0 ? place : nearby[int(0, nearby.length - 1)];
    const local = LOCAL_LANG[p.iso];
    const closes = p.iso === place.iso && i % 3 === 0 ? addDays(parseIso(busy) + 12 * 3_600_000, -int(0, 2)) : addDays(s.today, int(4, 40));
    out.push({
      org: ORGS[int(0, ORGS.length - 1)],
      title: i % 4 === 1 ? `Senior ${role.title}` : role.title,
      city: p.city,
      country: p.country,
      iso: p.iso,
      daysOpen: (OPEN_DAYS[role.key] ?? 28) + int(-5, 7),
      closes,
      languages: ['English', ...(local && rand() < 0.75 ? [local] : [])],
      showsPay: rand() < (['GB', 'US', 'AU'].includes(p.iso) ? 0.8 : 0.6),
      years: Math.max(1, (YEARS[role.key] ?? 3) + int(-1, 2)),
      essentials: int(4, 7),
    });
  }
  return out;
}

export type MarketCheck = { count: number; scope: string; thin: boolean; points: Point[]; similar: SimilarJob[] };

/** "How does your job compare?": similar open jobs, how long they stay open, the languages they ask for, and deadlines that clash. */
export function marketCheck(job: DemoJob, s: State, schedule: string | null): MarketCheck {
  const role = roleByKey(job.family);
  const place = jobPlace(job, s);
  const similar = similarJobs(job, s);
  const scope = `${role.sector} jobs in ${regionOf(place.iso).name}`;
  if (similar.length < MIN_SIMILAR) return { count: similar.length, scope, thin: true, points: [], similar };
  const f = job.facts;
  const points: Point[] = [];
  const start = schedule ?? isoDay(s.today);

  const typical = median(similar.map((x) => x.daysOpen));
  if (!f.deadline) points.push({ key: 'window', ok: false, title: 'Add a closing date to compare how long it stays open', detail: `Similar jobs stay open a median ${typical} days.` });
  else {
    const open = daysUntil(parseIso(start), f.deadline);
    if (open < Math.round(typical * 0.75)) {
      const date = workingDay(addDays(parseIso(start) + 12 * 3_600_000, typical), place.iso);
      points.push({ key: 'window', ok: false, title: `Open ${open} days; similar jobs stay open a median ${typical}`, detail: 'A short window loses people who see it late, in the field or offline.', fix: { label: `Close on ${longDate(date)}`, fix: { kind: 'deadline', date } } });
    } else points.push({ key: 'window', ok: true, title: `Open ${open} days, in line with similar jobs (median ${typical})` });
  }

  const asked = new Map<string, number>();
  for (const x of similar) for (const l of x.languages) if (l !== 'English') asked.set(l, (asked.get(l) ?? 0) + 1);
  const [top, topCount] = [...asked.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  const mine = f.languages.length ? f.languages : ['English'];
  if (top && topCount / similar.length >= 0.3 && !mine.includes(top)) {
    points.push({ key: 'language', ok: false, title: `${topCount} of ${similar.length} similar jobs ask for ${top}; yours doesn't mention it`, detail: `Worth adding as desirable if the work involves it.`, fix: { label: `Add ${top} as desirable`, fix: { kind: 'language', lang: top } } });
  } else points.push({ key: 'language', ok: true, title: top && mine.includes(top) ? `You ask for ${top}, like ${topCount} of ${similar.length} similar jobs` : 'Languages in line with similar jobs' });

  if (f.deadline) {
    const clashes = (d: string) => similar.filter((x) => x.iso === place.iso && Math.abs(daysUntil(parseIso(d), x.closes)) <= 3).length;
    const c = clashes(f.deadline);
    if (c >= 2) {
      let best = '';
      for (let k = 4; k <= 14 && !best; k++) {
        const d = workingDay(addDays(parseIso(f.deadline) + 12 * 3_600_000, k), place.iso);
        if (clashes(d) === 0) best = d;
      }
      points.push({
        key: 'clash',
        ok: false,
        title: `${c} similar jobs in ${place.country} close the same week as yours`,
        detail: 'Candidates applying to several at once have less time for each.',
        fix: best ? { label: `Move to ${longDate(best)}`, fix: { kind: 'deadline', date: best } } : undefined,
      });
    } else points.push({ key: 'clash', ok: true, title: `No more than one similar job in ${place.country} closes the same week` });
  }
  return { count: similar.length, scope, thin: false, points, similar };
}

function essentialRange(lines: string[]): { from: number; to: number } | null {
  const from = lines.indexOf('Essential:');
  if (from < 0) return null;
  const desirable = lines.indexOf('Desirable:');
  return { from: from + 1, to: desirable > from ? desirable : lines.length };
}

/** The full advert check (Amplify): unrealistic requirements and missing pay information, compared with similar jobs. */
export function fullAdvertCheck(job: DemoJob, s: State): { thin: boolean; points: Point[] } {
  const similar = similarJobs(job, s);
  if (similar.length < MIN_SIMILAR) return { thin: true, points: [] };
  const points: Point[] = [];
  const req = job.sections.find((x) => x.key === 'requirements');
  const typicalYears = median(similar.map((x) => x.years));
  if (req) {
    const at = req.lines.findIndex((l) => /\b\d+\+?\s+years\b/i.test(l));
    const years = at >= 0 ? Number(req.lines[at].match(/\b(\d+)\+?\s+years\b/i)?.[1]) : null;
    if (years !== null && years >= typicalYears + 3) {
      const lines = req.lines.map((l, i) => (i === at ? l.replace(/\b\d+(\+?\s+years)\b/i, `${typicalYears}$1`) : l));
      points.push({ key: 'years', ok: false, section: 'requirements', title: `Asks for ${years} years of experience; similar jobs ask a median ${typicalYears}`, detail: 'A high bar puts off capable people, and women more than men.', fix: { label: `Ask for ${typicalYears} years`, fix: { kind: 'text', section: 'requirements', lines } } });
    } else if (years !== null) points.push({ key: 'years', ok: true, title: `Experience asked is in line with similar jobs (median ${typicalYears} years)` });
    const range = essentialRange(req.lines);
    const essentials = range ? req.lines.slice(range.from, range.to).filter((l) => l.startsWith('- ')) : [];
    const typicalEssentials = median(similar.map((x) => x.essentials));
    if (range && essentials.length >= typicalEssentials + 4) {
      const keep = essentials.slice(0, typicalEssentials);
      const move = essentials.slice(typicalEssentials);
      const before = req.lines.slice(0, range.from - 1);
      const after = req.lines.slice(range.to);
      const desirable = after[0] === 'Desirable:' ? after.slice(1) : after;
      const lines = [...before, 'Essential:', ...keep, 'Desirable:', ...move, ...desirable];
      points.push({ key: 'essentials', ok: false, section: 'requirements', title: `${essentials.length} essential requirements; similar jobs list a median ${typicalEssentials}`, detail: 'People tend to apply only when they meet every essential point.', fix: { label: `Move ${move.length} to desirable`, fix: { kind: 'text', section: 'requirements', lines } } });
    } else if (range) points.push({ key: 'essentials', ok: true, title: `${essentials.length} essential requirements, in line with similar jobs` });
  }
  const f = job.facts;
  const showing = similar.filter((x) => x.showsPay).length;
  const noAmount = ['hidden', 'competitive', 'scale'].includes(f.salaryMode);
  if (noAmount && showing / similar.length >= 0.5) {
    const hint = salarySuggestion(f, s.org);
    const fmt = (n: number) => n.toLocaleString('en-US');
    points.push({
      key: 'pay',
      ok: false,
      title: `${showing} of ${similar.length} similar jobs show pay; yours doesn't give an amount`,
      detail: hint ? `Basis: ${hint.basis}.` : 'Add a range from the Salary pill in the job description.',
      fix: hint ? { label: `Show ${hint.currency} ${fmt(hint.min)} to ${fmt(hint.max)}`, fix: { kind: 'facts', patch: { salaryMode: 'range', salaryMin: fmt(hint.min), salaryMax: fmt(hint.max), currency: hint.currency, period: hint.period } } } : undefined,
    });
  } else if (!noAmount) points.push({ key: 'pay', ok: true, title: 'Pay is shown, as candidates expect' });
  return { thin: false, points };
}

/** The basic advert check, for every job: clarity and inclusion. */
export function basicAdvertCheck(job: DemoJob, s: State): Point[] {
  const live = s.jobs.filter((j) => j.id !== job.id && (j.status === 'live' || j.status === 'scheduled')).map((j) => j.facts.title);
  // Sub-sections are checked with their section: a placeholder left in one is a point like any other.
  const flat = job.sections.map((sec) => (sec.subs?.length ? { ...sec, lines: allLines(sec) } : sec));
  const points: Point[] = quality(flat, job.facts, s.today, live)
    .filter((q) => q.level !== 'ok')
    .map((q) => ({ key: q.key, ok: false, title: q.text, section: q.section }));
  for (const sec of job.sections) {
    for (const [n, line] of sec.lines.entries()) {
      for (const h of findInclusive(line, job.format)) {
        const hit = `${h.rule.id}:${sec.key}:${h.match.toLowerCase()}`;
        if (job.genuine[hit]) continue;
        points.push({ key: `inclusive-${sec.key}-${n}-${h.index}-${h.rule.id}`, ok: false, section: sec.key, title: `“${h.match}” in ${sec.title}`, detail: `${h.rule.why} ${h.rule.alt}.`, hit, line });
      }
    }
  }
  if (!points.some((p) => !p.ok)) points.unshift({ key: 'clear', ok: true, title: 'Clear and inclusive: nothing to look at' });
  return points;
}
