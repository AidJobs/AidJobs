import { addDays, daysUntil, isoDay, longDate, parseIso } from './engine';
import type { DemoJob, Pack, Plan, State } from './types';

/** Placeholder prices and terms (employer-side plan, section 16; the free listings of section 19, phase 5). */
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
 * on its own or the free Amplify, two with a package or subscription job (the user, 12 November 2026); each further language is US$5.
 */
export const LANGUAGE_PRICE = 5;
export const LANGS_INCLUDED = { single: 1, package: 2, free: 1 } as const;
export type PaidVia = keyof typeof LANGS_INCLUDED;

/** The versions a job may show: those included in how it is paid, and those bought on top; none unless amplified. */
export function langSlots(j: DemoJob, plan: Plan | null = j.plan, via: PaidVia = j.paidVia ?? 'single'): number {
  return plan === 'amplify' ? LANGS_INCLUDED[via] + (j.langsPaid ?? 0) : 0;
}

/** How the job is, or will be, paid for: already paid, the free Amplify, a package job on hand, or the package chosen; otherwise on its own. */
export function viaFor(s: State, j: DemoJob): PaidVia {
  if (j.plan === 'amplify' || j.paidFor) return j.paidVia ?? 'single';
  if (usesFreeAmplify(s, j)) return 'free';
  return nextPaidJob(s) || (j.payWith && j.payWith !== 'one' && j.payWith !== 'free') ? 'package' : 'single';
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

export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  return isoDay(new Date(y, m - 1 + n, Math.min(d, last)).getTime());
}

export type FreeKind = 'standard' | 'amplify';

/** One free listing: available, held by a scheduled job, or used by a job that went live. */
export type Allowance = { state: 'available' } | { state: 'held' | 'used'; jobId: string };

/** The scheduled job holding a free listing: a free job for the standard one, a job amplified with the free Amplify for the other. */
function holder(s: State, kind: FreeKind): DemoJob | undefined {
  return s.jobs.find((j) => j.status === 'scheduled' && (kind === 'standard' ? j.plan === 'free' : j.plan === 'amplify' && j.paidVia === 'free'));
}

/**
 * One standard listing free and one Amplify listing free, each once per organisation, ever, never renewed (section 19, phase 5, D). Used
 * when its job goes live; scheduled, the job holds it, and taken back to a draft, withdrawn, deleted, or amplified first, it is given back.
 */
export function allowance(s: State, kind: FreeKind): Allowance {
  const used = s.free?.[kind];
  if (used) return { state: 'used', jobId: used };
  const h = holder(s, kind);
  return h ? { state: 'held', jobId: h.id } : { state: 'available' };
}

/** Whether this job may take the listing: it is available, or this job already holds it. */
function openTo(s: State, kind: FreeKind, jobId: string): boolean {
  const a = allowance(s, kind);
  return a.state === 'available' || (a.state === 'held' && a.jobId === jobId);
}

/** The free standard listing is available to this job. After it, a job is Amplify, a package job, or the subscription. */
export function canGoFree(s: State, jobId: string): boolean {
  return openTo(s, 'standard', jobId);
}

/** The free Amplify is available to this job: a verified organisation only, as for any Amplify. */
export function canAmplifyFree(s: State, jobId: string): boolean {
  return s.org.verified && openTo(s, 'amplify', jobId);
}

/**
 * Whether amplifying this job uses the free Amplify: while it is available, unless the user chose to pay for this job and keep the
 * free one for later. A job already paid for uses nothing more.
 */
export function usesFreeAmplify(s: State, j: DemoJob): boolean {
  if (j.paidFor || j.plan === 'amplify') return j.paidVia === 'free';
  return canAmplifyFree(s, j.id) && (j.payWith === undefined || j.payWith === 'free');
}

/** Records a listing as used by the job going live; once used it stays used, whatever the job becomes. */
export function takeAllowance(s: State, kind: FreeKind, jobId: string): State {
  if (s.free?.[kind] || !openTo(s, kind, jobId)) return s;
  return { ...s, free: { ...s.free, [kind]: jobId } };
}

/** "Used by Finance Officer", "held by Finance Officer (goes live on 2 December 2026)", or "available". */
export function allowanceText(s: State, kind: FreeKind): string {
  const a = allowance(s, kind);
  if (a.state === 'available') return 'available';
  const j = s.jobs.find((x) => x.id === a.jobId) ?? s.deleted?.find((d) => d.job.id === a.jobId)?.job;
  const title = j?.facts.title || (a.state === 'used' ? 'a deleted job' : 'an untitled job');
  return a.state === 'used' ? `used by ${title}` : `held by ${title} (goes live on ${longDate(j?.scheduledFor ?? '')})`;
}

/** "Free standard: available · free Amplify: used", for the side menu and Overview. */
export function freeSummary(s: State): string {
  const word = (kind: FreeKind) => allowance(s, kind).state;
  return `Free standard: ${word('standard')} · free Amplify: ${word('amplify')}`;
}

/**
 * Saves from earlier previews counted free jobs by the month: if any free job went live, the free standard is used; a scheduled free job
 * holds it only when none went live (read from the job, as always); no job amplified then uses the free Amplify.
 */
export function freeBroughtForward(s: State): State {
  if (s.free) return s;
  // Used: the first free job that really went live (an old use whose job never did is not one), else any free job published.
  const live = (j: State['jobs'][number]) => j.plan === 'free' && Boolean(j.publishedAt) && (j.status === 'live' || j.status === 'closed');
  const went = s.freeUses?.map((u) => u.jobId).find((id) => s.jobs.some((j) => j.id === id && live(j))) ?? s.jobs.find(live)?.id;
  // Scheduled free jobs beyond the one allowance (all of them when it is used) go back to drafts, so none goes live free as a second.
  const scheduled = s.jobs.filter((j) => j.status === 'scheduled' && j.plan === 'free').sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''));
  const keep = went ? undefined : scheduled[0]?.id;
  const back = new Set(scheduled.filter((j) => j.id !== keep).map((j) => j.id));
  const { freeUses: _old, ...rest } = s;
  void _old;
  return {
    ...rest,
    free: went ? { standard: went } : {},
    jobs: back.size ? s.jobs.map((j) => (back.has(j.id) ? { ...j, status: 'draft' as const, plan: null, scheduledFor: undefined, audit: [...j.audit, { at: s.today, who: 'AidJobs', what: 'Back to a draft: the free standard listing is now once per organisation, and another job has it' }] } : j)) : s.jobs,
    ...(back.size ? { notice: { text: `${back.size === 1 ? 'One scheduled free job is' : `${back.size} scheduled free jobs are`} back to drafts: the free standard listing is now once per organisation. Publish ${back.size === 1 ? 'it' : 'them'} with Amplify or a package.` } } : {}),
  };
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