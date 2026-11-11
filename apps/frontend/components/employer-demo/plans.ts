import { addDays, daysUntil, isoDay, longDate, parseIso } from './engine';
import type { DemoJob, Org, Pack, Plan, State } from './types';

/** Placeholder prices and terms (employer-side plan, section 16). */
export const FREE_PER_MONTH = 2;
export const LISTED_DAYS: Record<Plan, number> = { free: 60, amplify: 100 };
export const ONE_JOB = 28.4;
export const EXTRA_JOB = 18;
export const SUBSCRIPTION_JOBS = 3;

export type PackageKey = 'one' | 'three' | 'five' | 'always';

export const PACKAGES: Array<{ key: PackageKey; label: string; rule: string; price: number; perJob: number; jobs: number; months: number }> = [
  { key: 'one', label: 'One job', rule: 'Paid when it is published', price: ONE_JOB, perJob: ONE_JOB, jobs: 1, months: 0 },
  { key: 'three', label: '3 jobs', rule: 'Used within 2 months', price: 66, perJob: 22, jobs: 3, months: 2 },
  { key: 'five', label: '5 jobs', rule: 'Used within 3 months', price: 100, perJob: 20, jobs: 5, months: 3 },
  { key: 'always', label: '“Always hiring” subscription', rule: `${SUBSCRIPTION_JOBS} jobs each month; unused ones lapse; extra jobs US$${EXTRA_JOB}; cancel any time`, price: 54, perJob: 18, jobs: SUBSCRIPTION_JOBS, months: 1 },
];

/**
 * Language versions besides the job's own language (placeholders; section 19, 8 November 2026): none for a free job, one with a job paid
 * on its own, two with a package or subscription job (the user, 12 November 2026); each further language is US$5.
 */
export const LANGUAGE_PRICE = 5;
export const LANGS_INCLUDED = { single: 1, package: 2 } as const;
export type PaidVia = keyof typeof LANGS_INCLUDED;

/** The versions a job may show: those included in how it is paid, and those bought on top; none unless amplified. */
export function langSlots(j: DemoJob, plan: Plan | null = j.plan, via: PaidVia = j.paidVia ?? 'single'): number {
  return plan === 'amplify' ? LANGS_INCLUDED[via] + (j.langsPaid ?? 0) : 0;
}

/** The versions beyond what is included and already paid for: added to the job's checkout, or bought on their own after publishing. */
export function langsToPay(j: DemoJob, plan: Plan | null = j.plan, via: PaidVia = j.paidVia ?? 'single'): number {
  return plan === 'amplify' ? Math.max(0, Object.keys(j.translations ?? {}).length - langSlots(j, plan, via)) : 0;
}

export const BADGE = 'Actively hiring';
export const BADGE_TIP = 'Promoted by the employer · posted directly by a verified organisation · details checked by AidJobs';

export function usd(n: number): string {
  return `US$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

export function packageOf(key: PackageKey) {
  return PACKAGES.find((p) => p.key === key) ?? PACKAGES[0];
}

/** What the main button says a package costs. */
export function priceLabel(key: PackageKey | 'extra'): string {
  if (key === 'extra') return `${usd(EXTRA_JOB)} extra job`;
  const p = packageOf(key);
  if (key === 'one') return usd(p.price);
  if (key === 'always') return `${usd(p.price)} a month for ${p.jobs} jobs`;
  return `${usd(p.price)} for ${p.jobs} jobs`;
}

const ZONES: Record<string, string> = {
  Kenya: 'Africa/Nairobi',
  Uganda: 'Africa/Kampala',
  Ethiopia: 'Africa/Addis_Ababa',
  'South Sudan': 'Africa/Juba',
  Tanzania: 'Africa/Dar_es_Salaam',
  Rwanda: 'Africa/Kigali',
  Nigeria: 'Africa/Lagos',
  'South Africa': 'Africa/Johannesburg',
  Senegal: 'Africa/Dakar',
  Jordan: 'Asia/Amman',
  Lebanon: 'Asia/Beirut',
  India: 'Asia/Kolkata',
  Bangladesh: 'Asia/Dhaka',
  Pakistan: 'Asia/Karachi',
  Philippines: 'Asia/Manila',
  Switzerland: 'Europe/Zurich',
  'United Kingdom': 'Europe/London',
  France: 'Europe/Paris',
  Germany: 'Europe/Berlin',
  Netherlands: 'Europe/Amsterdam',
  Denmark: 'Europe/Copenhagen',
  Norway: 'Europe/Oslo',
  Italy: 'Europe/Rome',
  Spain: 'Europe/Madrid',
  'United States': 'America/New_York',
  Canada: 'America/Toronto',
  Australia: 'Australia/Sydney',
};

/** The organisation's time zone, from its headquarters; the free allowance runs by its calendar month. */
export function orgZone(org: Org): { zone: string; city: string } {
  const [city, country] = org.hq.split(',').map((x) => x.trim());
  const zone = ZONES[country ?? ''] ?? 'UTC';
  return { zone, city: zone === 'UTC' ? 'UTC' : city };
}

export function monthOf(ms: number, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit' }).formatToParts(ms);
  return `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}`;
}

/** The month the demo's day falls in, at the organisation's headquarters (noon of the day, so the date never slips). */
export function currentMonth(s: State): string {
  return monthOf(s.today + 12 * 3_600_000, orgZone(s.org).zone);
}

export function monthName(key: string): string {
  return new Date(parseIso(`${key}-01`)).toLocaleDateString('en-GB', { month: 'long' });
}

export function firstOfNextMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
}

export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  return isoDay(new Date(y, m - 1 + n, Math.min(d, last)).getTime());
}

/** The month whose free allowance a job uses: this month, or the month it is scheduled for. */
export function monthFor(s: State, schedule: string | null): string {
  return schedule ? schedule.slice(0, 7) : currentMonth(s);
}

export function freeUsed(s: State, month: string): number {
  return s.freeUses.filter((u) => u.month === month).length;
}

export function freeLeft(s: State, month = currentMonth(s)): number {
  return Math.max(0, FREE_PER_MONTH - freeUsed(s, month));
}

export function hasFreeUse(s: State, jobId: string): boolean {
  return s.freeUses.some((u) => u.jobId === jobId);
}

/** Whether the job already counts against `month`'s free jobs: published or scheduled for that month. */
export function countedFor(s: State, jobId: string, month: string): boolean {
  return s.freeUses.some((u) => u.jobId === jobId && u.month === month);
}

/**
 * A free job goes live in its own month (decided by the user, 7 November 2026): it can go free if it already counts against the month it
 * goes live in, or that month still has a free job. A count from an earlier month does not carry over; it stays used there.
 */
export function canGoFree(s: State, jobId: string, schedule: string | null): boolean {
  const month = monthFor(s, schedule);
  return countedFor(s, jobId, month) || freeLeft(s, month) > 0;
}

/** Paid jobs on hand, the soonest to lapse first: a subscription's jobs for this month, then packs. */
export function nextPaidJob(s: State): { kind: 'pack'; pack: Pack } | { kind: 'subscription' } | null {
  const options: Array<{ ends: string; pick: { kind: 'pack'; pack: Pack } | { kind: 'subscription' } }> = [
    ...s.packs.filter((p) => p.left > 0).map((p) => ({ ends: p.ends, pick: { kind: 'pack' as const, pack: p } })),
    ...(s.subscription && s.subscription.left > 0 ? [{ ends: s.subscription.renews, pick: { kind: 'subscription' as const } }] : []),
  ];
  return options.sort((a, b) => a.ends.localeCompare(b.ends))[0]?.pick ?? null;
}

export function paidJobsLeft(s: State): number {
  return s.packs.reduce((n, p) => n + p.left, 0) + (s.subscription?.left ?? 0);
}

/** One more job beyond what is on hand: the subscription's extra-job price, or the single price. */
export function singlePrice(s: State): { key: 'one' | 'extra'; amount: number } {
  return s.subscription && !s.subscription.cancelled ? { key: 'extra', amount: EXTRA_JOB } : { key: 'one', amount: ONE_JOB };
}

/** Lapses unused pack jobs after their end date, and renews or ends the subscription on its date. */
export function rollBilling(s: State): State {
  const today = isoDay(s.today);
  const packs = s.packs.filter((p) => p.left > 0 && p.ends >= today);
  let sub = s.subscription;
  while (sub && sub.renews <= today) sub = sub.cancelled ? null : { ...sub, left: SUBSCRIPTION_JOBS, renews: addMonths(sub.renews, 1) };
  if (packs.length === s.packs.length && sub === s.subscription) return s;
  return { ...s, packs, subscription: sub };
}

/** The end of the job's listing period, counted from publishing, whatever its closing date. */
export function listingEnd(j: DemoJob, today: number): string {
  const start = j.scheduledFor ?? (j.publishedAt ? isoDay(j.publishedAt) : isoDay(today));
  return addDays(parseIso(start) + 12 * 3_600_000, LISTED_DAYS[j.plan ?? 'free']);
}

/** The last day a job is listed: its listing period from publishing, or its closing date if that comes first. */
export function listedUntil(j: DemoJob, today: number): string {
  const end = listingEnd(j, today);
  return j.facts.deadline && j.facts.deadline < end ? j.facts.deadline : end;
}

/** A free live job whose listing ends before its closing date: the days left to choose (decision 3), within the last 7; null otherwise. */
export function listingEndsIn(j: DemoJob, today: number): number | null {
  if (j.status !== 'live' || j.plan !== 'free' || j.listingChoice === 'leave' || !j.facts.deadline) return null;
  const end = listingEnd(j, today);
  if (j.facts.deadline <= end) return null;
  const left = daysUntil(today, end);
  return left >= 0 && left <= 7 ? left : null;
}

/** A free live job past its listing period but still open: out of AidJobs' lists and search, its page still opens from links. */
export function delisted(j: DemoJob, today: number): boolean {
  if (j.status !== 'live' || j.plan !== 'free' || !j.facts.deadline) return false;
  const end = listingEnd(j, today);
  return j.facts.deadline > end && isoDay(today) > end;
}

/** "1 December 2026 (Nairobi time)": when the free allowance starts again. */
export function resetText(s: State): string {
  return `${longDate(firstOfNextMonth(currentMonth(s)))} (${orgZone(s.org).city} time)`;
}
