import { countries as flagCountries, hasFlag } from 'country-flag-icons';

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

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

const isoByName = (() => {
  const map = new Map<string, string>();
  for (const code of flagCountries) {
    if (code.length !== 2) continue;
    const name = regionNames.of(code);
    if (name) map.set(name.toLowerCase(), code);
  }
  map.set('uk', 'GB');
  map.set('usa', 'US');
  map.set('south sudan', 'SS');
  map.set("cote d'ivoire", 'CI');
  map.set('state of palestine', 'PS');
  map.set('state of palestine (sop)', 'PS');
  return map;
})();

export function countryName(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return regionNames.of(iso.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

function isoFromLocation(location: string | null): string | null {
  if (!location) return null;
  const last = location.split(',').pop()?.trim().toLowerCase();
  if (!last) return null;
  return isoByName.get(last) ?? null;
}

function startOfToday(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function daysUntil(deadline: string | null): number | null {
  if (!deadline) return null;
  const t = Date.parse(`${deadline}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return Math.round((t - startOfToday()) / DAY_MS);
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

export function normaliseJobs(raw: RawJob[]): Job[] {
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
    const seenDaysAgo = Number.isNaN(seen) ? null : Math.max(0, Math.floor((startOfToday() + DAY_MS - seen) / DAY_MS));
    return { ...r, iso, country, place, daysLeft: daysUntil(r.deadline), seenDaysAgo };
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

export type DeadlineFilter = 'soon' | 'month' | 'dated';

export const DEADLINE_LABELS: Record<DeadlineFilter, string> = {
  soon: `Closing within ${SOON_DAYS} days`,
  month: 'Closing within 30 days',
  dated: 'Has a deadline',
};

export function matchesDeadline(job: Job, filter: DeadlineFilter | null): boolean {
  if (!filter) return true;
  if (job.daysLeft === null) return false;
  if (filter === 'soon') return job.daysLeft <= SOON_DAYS;
  if (filter === 'month') return job.daysLeft <= 30;
  return true;
}
