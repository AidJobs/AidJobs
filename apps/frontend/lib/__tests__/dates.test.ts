import { adminDate, adminDateTime, formatDate, formatDateTime, NO_DATE, relativeTime, zoneLabel } from '../dates';
import { formatDate as siteFormatDate, formatLongDate } from '../site/jobs';

const INDIA = 330;
const NEW_YORK = -240;
const LOS_ANGELES = -420;

describe('calendar dates', () => {
  it('shows a deadline exactly as written', () => {
    expect(formatDate('2026-11-06')).toBe('6 Nov 2026');
    expect(adminDate('2026-10-28')).toBe('28 Oct 2026');
  });

  it('never shifts a deadline west of UTC (the old Jobs page showed "Nov 5" in the Americas)', () => {
    expect(formatDateTime('2026-11-06', LOS_ANGELES)).toBe('6 Nov 2026');
    expect(adminDateTime('2026-11-06', NEW_YORK)).toBe('6 Nov 2026');
    // The same day as a moment at UTC midnight is the evening before in New York.
    expect(formatDateTime('2026-11-06T00:00:00Z', NEW_YORK)).toBe('5 Nov 2026, 20:00 GMT-4');
  });
});

describe('moments', () => {
  it('shows a crawl time on the reader clock with its zone', () => {
    expect(formatDateTime('2026-10-19T19:24:44.794571+00:00', INDIA)).toBe('20 Oct 2026, 00:54 GMT+5:30');
    expect(formatDateTime('2026-10-23T05:05:43Z', INDIA)).toBe('23 Oct 2026, 10:35 GMT+5:30');
    expect(formatDateTime('2026-10-23T05:05:43Z', 0)).toBe('23 Oct 2026, 05:05 GMT');
    expect(formatDateTime('2026-10-23T05:05:43Z', NEW_YORK)).toBe('23 Oct 2026, 01:05 GMT-4');
  });

  it('labels zones by their offset', () => {
    expect(zoneLabel(330)).toBe('GMT+5:30');
    expect(zoneLabel(-240)).toBe('GMT-4');
    expect(zoneLabel(0)).toBe('GMT');
    expect(zoneLabel(345)).toBe('GMT+5:45');
    expect(zoneLabel(-570)).toBe('GMT-9:30');
  });

  it('uses the reader clock by default', () => {
    const iso = '2026-10-23T05:05:43Z';
    const offset = -new Date(iso).getTimezoneOffset();
    expect(adminDateTime(iso)).toBe(formatDateTime(iso, offset));
  });
});

describe('missing and unreadable values', () => {
  it('shows a dash in the admin, never "Invalid Date"', () => {
    for (const value of [null, undefined, '', 'garbage', '2026-13-45', 'not-a-date-at-all']) {
      expect(adminDate(value)).toBe(NO_DATE);
      expect(adminDateTime(value)).toBe(NO_DATE);
      expect(adminDateTime(value)).not.toMatch(/Invalid/);
    }
  });

  it('keeps the public site output empty for the same values', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate('garbage')).toBe('');
  });
});

describe('relative times on the Crawls page', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('keeps the existing wording for the last 7 days', () => {
    expect(relativeTime(ago(30_000), now)).toBe('Just now');
    expect(relativeTime(ago(60_000), now)).toBe('1m ago');
    expect(relativeTime(ago(59 * 60_000), now)).toBe('59m ago');
    expect(relativeTime(ago(60 * 60_000), now)).toBe('1h ago');
    expect(relativeTime(ago(23 * 3_600_000), now)).toBe('23h ago');
    expect(relativeTime(ago(24 * 3_600_000), now)).toBe('1d ago');
    expect(relativeTime(ago(6 * 86_400_000), now)).toBe('6d ago');
  });

  it('hands older, future, missing, and unreadable times to the full format', () => {
    expect(relativeTime(ago(7 * 86_400_000), now)).toBeNull();
    expect(relativeTime(new Date(now + 60_000).toISOString(), now)).toBeNull();
    expect(relativeTime(null, now)).toBeNull();
    expect(relativeTime('garbage', now)).toBeNull();
  });
});

describe('the public site uses the same formatter', () => {
  it('re-exports it unchanged', () => {
    expect(siteFormatDate).toBe(formatDate);
    expect(formatLongDate('2026-10-23')).toBe('Fri 23 Oct 2026');
  });
});
