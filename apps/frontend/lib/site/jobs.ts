import { hasFlag } from 'country-flag-icons';
import { countryName, isoFromName } from './countries';

export type RawJob = {
  id: string;
  title: string;
  org: string;
  location: string | null;
  country_iso: string | null;
  deadline: string | null;
  apply_url: string;
  last_seen_at?: string | null;
};

export type Job = RawJob & {
  iso: string | null;
  country: string | null;
  place: string | null;
  daysLeft: number | null;
  seenDaysAgo: number | null;
};

export const SOON_DAYS = 10;
export const STALE_DAYS = 7;
export const OLD_DAYS = 30;

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function isoFromLocation(location: string | null): string | null {
  if (!location) return null;
  const last = location.split(',').pop()?.trim();
  if (!last) return null;
  return isoFromName(last);
}

/** Start of the UTC day containing `ms`. */
export function dayStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function daysUntil(deadline: string | null, today: number): number | null {
  if (!deadline) return null;
  const t = Date.parse(`${deadline}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return Math.round((t - today) / DAY_MS);
}

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatLongDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return `${WEEKDAYS[d.getUTCDay()]} ${formatDate(iso)}`;
}

/** `today` is the start of the UTC day to count from (see `dayStart`). */
export function normaliseJobs(raw: RawJob[], today: number): Job[] {
  return raw.map((r) => {
    const fromIso = r.country_iso && hasFlag(r.country_iso.toUpperCase()) ? r.country_iso.toUpperCase() : null;
    const iso = fromIso ?? isoFromLocation(r.location);
    const country = countryName(iso);
    let place: string | null = null;
    if (r.location) {
      const parts = r.location.split(',').map((p) => p.trim()).filter(Boolean);
      const unique = parts.filter((p, i) => parts.indexOf(p) === i);
      place = unique.join(', ');
    } else if (country) {
      place = country;
    }
    const seen = r.last_seen_at ? Date.parse(r.last_seen_at) : NaN;
    const seenDaysAgo = Number.isNaN(seen) ? null : Math.max(0, Math.floor((today + DAY_MS - seen) / DAY_MS));
    return { ...r, iso, country, place, daysLeft: daysUntil(r.deadline, today), seenDaysAgo };
  });
}

export function isOpen(job: Job): boolean {
  return job.daysLeft === null || job.daysLeft >= 0;
}

export function sortByDeadline<T extends Job>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) => {
    if (a.daysLeft !== null && b.daysLeft !== null) return a.daysLeft - b.daysLeft;
    if (a.daysLeft !== null) return -1;
    if (b.daysLeft !== null) return 1;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Recommended order: soonest deadline first, jobs not confirmed for OLD_DAYS last, and
 * never more than two in a row from one organisation while another organisation has jobs left.
 */
export function recommendedOrder<T extends Job>(jobs: T[]): T[] {
  const fresh = sortByDeadline(jobs.filter((j) => j.seenDaysAgo === null || j.seenDaysAgo <= OLD_DAYS));
  const stale = sortByDeadline(jobs.filter((j) => j.seenDaysAgo !== null && j.seenDaysAgo > OLD_DAYS));
  const pool = [...fresh];
  const out: T[] = [];
  while (pool.length) {
    const a = out[out.length - 1];
    const b = out[out.length - 2];
    let i = 0;
    if (a && b && a.org === b.org && pool[0].org === a.org) {
      const other = pool.findIndex((j) => j.org !== a.org);
      if (other > 0) i = other;
    }
    out.push(pool.splice(i, 1)[0]);
  }
  return [...out, ...stale];
}

export function initials(name: string): string {
  const short = name.replace(/\(.*?\)/g, '').trim();
  const words = short.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  if (/^[A-Z]{2,}$/.test(words[0])) return words[0].slice(0, 2);
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function countBy<T>(items: T[], key: (item: T) => string | null): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Deadline buckets do not overlap, so their counts add up to the total. */
export type DeadlineFilter = 'soon' | 'month' | 'later' | 'none';

export const DEADLINE_LABELS: Record<DeadlineFilter, string> = {
  soon: `Closing within ${SOON_DAYS} days`,
  month: `Closing in ${SOON_DAYS + 1}–30 days`,
  later: 'Closing in more than 30 days',
  none: 'No deadline listed',
};

export function matchesDeadline(job: Job, filter: DeadlineFilter | null): boolean {
  if (!filter) return true;
  if (filter === 'none') return job.daysLeft === null;
  if (job.daysLeft === null) return false;
  if (filter === 'soon') return job.daysLeft <= SOON_DAYS;
  if (filter === 'month') return job.daysLeft > SOON_DAYS && job.daysLeft <= 30;
  return job.daysLeft > 30;
}
