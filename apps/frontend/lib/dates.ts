/**
 * One date formatter for the site and the admin (UX-07). A calendar date ("2026-11-06") is shown as
 * written, never shifted by a time zone. A moment ("2026-10-22T18:55:56+00:00") is shown on the
 * reader's clock.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Shown in the admin for a missing or unreadable date. */
export const NO_DATE = '—';

/** A date ("2026-10-23") as written; a moment on the reader's clock. Empty when missing or unreadable. */
export function formatDate(iso: string | null): string {
  if (!iso) return '';
  if (iso.length === 10) {
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** The offset of a clock from UTC, as "GMT+5:30", "GMT-4", or "GMT". */
export function zoneLabel(offsetMinutes: number): string {
  if (offsetMinutes === 0) return 'GMT';
  const sign = offsetMinutes > 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `GMT${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
}

/**
 * A moment as "23 Oct 2026, 10:35 GMT+5:30" on a clock `offsetMinutes` ahead of UTC (east positive).
 * The default is the reader's clock at that moment. A calendar date is shown as a date only.
 */
export function formatDateTime(iso: string | null, offsetMinutes?: number): string {
  if (!iso) return '';
  if (iso.length === 10) return formatDate(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const offset = offsetMinutes ?? -d.getTimezoneOffset();
  const wall = new Date(d.getTime() + offset * 60_000);
  const hh = String(wall.getUTCHours()).padStart(2, '0');
  const mm = String(wall.getUTCMinutes()).padStart(2, '0');
  return `${wall.getUTCDate()} ${MONTHS[wall.getUTCMonth()]} ${wall.getUTCFullYear()}, ${hh}:${mm} ${zoneLabel(offset)}`;
}

/** Admin: a date, or "—". */
export function adminDate(iso: string | null | undefined): string {
  return formatDate(iso ?? null) || NO_DATE;
}

/** Admin: a moment with time and zone, or "—". */
export function adminDateTime(iso: string | null | undefined, offsetMinutes?: number): string {
  return formatDateTime(iso ?? null, offsetMinutes) || NO_DATE;
}

/** "Just now", "5m ago", "3h ago", "2d ago" for the last 7 days; null when older, unreadable, or in the future. */
export function relativeTime(iso: string | null | undefined, nowMs: number): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = nowMs - t;
  if (diff < 0) return null;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return null;
}
