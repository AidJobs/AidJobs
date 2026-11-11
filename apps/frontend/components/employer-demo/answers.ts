/**
 * Quick picks for AidJobs' questions in the chat. Each pick is relevant and says why; when nothing relevant exists there are no picks, only
 * search or free text. Sources, in order: what the organisation said about itself and its own jobs, then AidJobs data (sample figures in the demo).
 */
import { addDays, CONTRACTS, holiday, longDate, PLACES, salarySuggestion, weekend } from './engine';
import { LOCAL_LANG } from './market';
import { MARKET_SAMPLE } from './sample';
import type { ApplySettings, DemoJob, Facts, State } from './types';

export type Pick = { label: string; why: string; patch: Partial<Facts> };

/** What the picks need to know about a job, so they also work before the job exists (on the first screen). */
type Subject = { id: string; family: string; facts: Facts };

/** Roles that are often home-based, so "Remote" is a sensible pick for them. */
const REMOTE_OK = new Set(['finance', 'comms', 'meal', 'hr', 'climate']);

/** Where similar roles are most often posted on AidJobs, by role family (sample figures in the demo). */
const MARKET_PLACES: Record<string, string[]> = {
  wash: ['Juba', "Cox's Bazar", 'Maiduguri'],
  health: ['Juba', 'Goma', 'Kabul'],
  nutrition: ['Maiduguri', 'Juba', "Cox's Bazar"],
  protection: ["Cox's Bazar", 'Amman', 'Goma'],
  education: ["Cox's Bazar", 'Amman', 'Kabul'],
  logistics: ['Goma', 'Juba', 'Port-au-Prince'],
};

export function placePatch(city: string): Partial<Facts> {
  const p = PLACES.find((x) => x.city === city);
  if (!p) return { location: city, arrangement: 'onsite' };
  return { location: `${p.city}, ${p.country}`, country: p.country, iso: p.iso, timezone: p.tz, currency: p.currency, arrangement: 'onsite' };
}

export function placePicks(s: State, j: Subject): Pick[] {
  const out: Pick[] = [];
  const add = (city: string, why: string) => {
    if (out.length < 4 && !out.some((p) => p.label === city) && PLACES.some((x) => x.city === city)) out.push({ label: city, why, patch: placePatch(city) });
  };
  const past = new Map<string, number>();
  for (const x of s.jobs) {
    const city = x.id !== j.id ? x.facts.location.split(',')[0] : '';
    if (city) past.set(city, (past.get(city) ?? 0) + 1);
  }
  [...past.entries()].sort((a, b) => b[1] - a[1]).forEach(([city, n]) => add(city, `${n} of your jobs ${n === 1 ? 'was' : 'were'} based here`));
  for (const country of s.org.countries) {
    const city = PLACES.find((p) => p.country === country)?.city;
    if (city) add(city, `${s.org.short} works in ${country} (your organisation profile)`);
  }
  for (const city of MARKET_PLACES[j.family] ?? []) add(city, 'Where similar roles are often posted on AidJobs (sample figures in the demo)');
  if (REMOTE_OK.has(j.family)) out.push({ label: 'Remote', why: 'Roles like this are often home-based', patch: { arrangement: 'remote' } });
  return out;
}

/** The first working day on or after a date in the duty-station country. */
function workingDay(today: number, days: number, countryIso: string): string {
  let n = days;
  while (n < days + 7 && (weekend(addDays(today, n), countryIso) || holiday(addDays(today, n), countryIso))) n++;
  return addDays(today, n);
}

export function deadlinePicks(s: State, j: Subject): Pick[] {
  const pick = (days: number, why: string): Pick => {
    const d = workingDay(s.today, days, j.facts.iso);
    return { label: longDate(d), why, patch: { deadline: d } };
  };
  return [
    pick(MARKET_SAMPLE.daysOpen, `Similar roles stay open about ${MARKET_SAMPLE.daysOpen} days on AidJobs (sample figures in the demo); moved to a working day`),
    pick(14, 'Two weeks, for an urgent role'),
    pick(28, 'Four weeks, more time for people to apply'),
  ];
}

export function contractPicks(s: State, j: Subject): Pick[] {
  const options = CONTRACTS[j.facts.engagement] ?? CONTRACTS.job;
  const by = s.org.orgType === 'un' ? 'UN agencies' : s.org.orgType === 'contractor' ? 'development contractors' : 'NGOs like yours';
  const kind = j.facts.engagement === 'consultancy' ? 'consultancies' : j.facts.engagement === 'internship' ? 'internships' : j.facts.engagement === 'volunteer' ? 'volunteer roles' : 'staff jobs';
  return options.slice(0, 3).map((c) => ({ label: c, why: `A contract type ${by} use for ${kind}`, patch: { contract: c } }));
}

export function gradePicks(s: State, j: Subject): Pick[] {
  const own = s.org.scale.map((r) => r.grade);
  const un = s.org.orgType === 'un' ? ['P2', 'P3', 'P4'] : [];
  const grades = (own.length ? own : un).slice(0, 4);
  return [
    ...grades.map((g) => ({ label: g, why: own.includes(g) ? `A grade on your ${s.org.short} salary scale` : 'A UN professional grade', patch: { grade: g } })),
    { label: 'No grade', why: 'The job description shows no grade or band', patch: { grade: '' } },
  ];
}

export function eligibilityPicks(_s: State, j: Subject): Pick[] {
  const where = j.facts.country || 'the country';
  return [
    { label: 'Anyone', why: 'Open to all applicants', patch: { eligibility: 'anyone' } },
    { label: `Nationals of ${where}`, why: 'A national post', patch: { eligibility: 'nationals' } },
    { label: 'Right to work there', why: 'People already allowed to work in the country', patch: { eligibility: 'righttowork' } },
    { label: 'Internal candidates', why: 'Only people who already work for you', patch: { eligibility: 'internal' } },
  ];
}

export function languagePicks(_s: State, j: Subject): Pick[] {
  const local = LOCAL_LANG[j.facts.iso];
  const out: Pick[] = [{ label: 'English', why: 'English only', patch: { languages: ['English'] } }];
  if (local) out.push({ label: `English and ${local}`, why: `${local} is widely used in ${j.facts.country} (sample figures in the demo)`, patch: { languages: ['English', local] } });
  if (local !== 'French') out.push({ label: 'English and French', why: 'Often asked for in the sector', patch: { languages: ['English', 'French'] } });
  return out;
}

export function safeguardingPicks(): Pick[] {
  return [
    { label: 'High', why: 'Regular direct contact with children or adults at risk', patch: { safeguarding: 'high' } },
    { label: 'Medium', why: 'Some contact, or access to their data', patch: { safeguarding: 'medium' } },
    { label: 'Low', why: 'No contact with children or adults at risk', patch: { safeguarding: 'low' } },
  ];
}

export function salaryPicks(s: State, j: Subject): Pick[] {
  const hint = salarySuggestion(j.facts, s.org);
  const fmt = (n: number) => n.toLocaleString('en-US');
  const per = (p: string) => ({ hour: 'an hour', day: 'a day', month: 'a month', year: 'a year' })[p] ?? `a ${p}`;
  const out: Pick[] = [];
  if (hint) out.push({ label: `${hint.currency} ${fmt(hint.min)} to ${fmt(hint.max)} ${per(hint.period)}`, why: `Basis: ${hint.basis}`, patch: { salaryMode: 'range', salaryMin: fmt(hint.min), salaryMax: fmt(hint.max), currency: hint.currency, period: hint.period } });
  if (j.facts.grade) out.push({ label: `By grade (${j.facts.grade})`, why: 'Shows the grade instead of an amount', patch: { salaryMode: 'grade' } });
  if (s.org.scale.length) out.push({ label: 'As per our salary scale', why: `Your ${s.org.short} salary scale, without an amount`, patch: { salaryMode: 'scale' } });
  out.push({ label: 'Not shown', why: 'No pay in the job description; jobs that show pay get more applications', patch: { salaryMode: 'hidden' } });
  return out;
}

export type MethodPick = { label: string; why: string; method: ApplySettings['method'] };

export function methodPicks(s: State): MethodPick[] {
  return [
    { label: 'Through our careers site', why: s.org.careersUrl ? `Your careers site, ${s.org.careersUrl}` : 'Your careers site', method: 'system' },
    { label: 'By email', why: 'CVs and letters to an address you give', method: 'email' },
    { label: 'An online form', why: 'A short form, with a CV', method: 'form' },
  ];
}

/** How a pick reads when added to the first message ("in Juba, South Sudan", "closing 25 November 2026"). */
export function pickPhrase(kind: 'place' | 'deadline' | 'contract', p: Pick): string {
  if (kind === 'place') return p.patch.arrangement === 'remote' ? ', home-based' : ` in ${p.patch.location}`;
  if (kind === 'deadline') return `, closing ${p.label}`;
  return `, ${p.label.replace(/\s*\(.*\)/, '').toLowerCase()} contract`;
}

/** Organisation memory: one click to reuse the main facts of the most recent similar job, labelled as coming from it. */
export function memoryPick(s: State, j: Subject): { label: string; why: string; text: string } | null {
  const title = j.facts.title.toLowerCase();
  const past: DemoJob | undefined = s.jobs
    .filter((x) => x.id !== j.id && x.facts.location && (x.family === j.family || (title && x.facts.title.toLowerCase() === title)))
    .sort((a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt))[0];
  if (!past || (j.family === 'programme' && past.facts.title.toLowerCase() !== title)) return null;
  const parts = [
    !j.facts.location && past.facts.location ? `in ${past.facts.location}` : '',
    !j.facts.duration && past.facts.duration ? `${past.facts.duration}` : '',
    !j.facts.contract && past.facts.contract ? `${past.facts.contract.toLowerCase()} contract` : '',
    !j.facts.grade && past.facts.grade ? `at ${past.facts.grade}` : '',
  ].filter(Boolean);
  if (parts.length < 2) return null;
  return {
    label: `Same as your last ${past.facts.title} (${past.facts.location.split(',')[0]})`,
    why: `From your own job "${past.facts.title}": ${parts.join(', ')}. Check them; you can change any of them.`,
    text: `, ${parts.join(', ')}`,
  };
}