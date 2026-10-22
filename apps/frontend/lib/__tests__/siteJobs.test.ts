import { daysUntil, formatDate, isoFromLocation, isOpen, localDay, normaliseJobs, recommendedOrder, utcDay, type RawJob } from '../site/jobs';

const TODAY = Date.UTC(2026, 9, 23);

function raw(id: string, extra: Partial<RawJob> = {}): RawJob {
  return {
    id,
    title: `Job ${id}`,
    org: 'UNICEF',
    location: 'Nairobi, Kenya',
    country_iso: null,
    deadline: null,
    apply_url: `https://jobs.example.org/${id}`,
    last_seen_at: '2026-10-22T10:00:00+00:00',
    ...extra,
  };
}

describe('days', () => {
  it('reads the server day in UTC', () => {
    expect(utcDay(Date.UTC(2026, 9, 23, 23, 59))).toBe(TODAY);
    expect(utcDay(Date.UTC(2026, 9, 23, 0, 0))).toBe(TODAY);
  });

  it("reads the visitor's day on their own clock", () => {
    const now = new Date(2026, 9, 23, 0, 30);
    expect(localDay(now.getTime())).toBe(TODAY);
    expect(localDay(new Date(2026, 9, 22, 23, 59).getTime())).toBe(Date.UTC(2026, 9, 22));
  });

  it('counts days left from the given day, not the clock', () => {
    expect(daysUntil('2026-10-23', TODAY)).toBe(0);
    expect(daysUntil('2026-10-24', TODAY)).toBe(1);
    expect(daysUntil('2026-10-22', TODAY)).toBe(-1);
    expect(daysUntil(null, TODAY)).toBeNull();
    expect(daysUntil('not a date', TODAY)).toBeNull();
  });

  it('hides a job once its deadline has passed, and keeps jobs without one', () => {
    const jobs = normaliseJobs([raw('past', { deadline: '2026-10-22' }), raw('today', { deadline: '2026-10-23' }), raw('none')], TODAY, utcDay);
    expect(jobs.filter(isOpen).map((j) => j.id)).toEqual(['today', 'none']);
    const nextDay = normaliseJobs([raw('today', { deadline: '2026-10-23' })], TODAY + 86_400_000, utcDay);
    expect(nextDay.filter(isOpen)).toHaveLength(0);
  });

  it('counts calendar days since the job was last seen', () => {
    const [old] = normaliseJobs([raw('a', { last_seen_at: '2026-09-01T08:00:00+00:00' })], TODAY, utcDay);
    expect(old.seenDaysAgo).toBe(52);
    const [late] = normaliseJobs([raw('b', { last_seen_at: '2026-10-22T23:30:00+00:00' })], TODAY, utcDay);
    expect(late.seenDaysAgo).toBe(1);
    const [same] = normaliseJobs([raw('c', { last_seen_at: '2026-10-23T00:10:00+00:00' })], TODAY, utcDay);
    expect(same.seenDaysAgo).toBe(0);
  });

  it('writes a date as given and a moment on the local clock', () => {
    expect(formatDate('2026-10-23')).toBe('23 Oct 2026');
    const moment = new Date(2026, 9, 23, 0, 25);
    expect(formatDate(moment.toISOString())).toBe('23 Oct 2026');
    expect(formatDate(null)).toBe('');
    expect(formatDate('garbage')).toBe('');
  });
});

describe('locations', () => {
  it('reads the country from the location when there is no code', () => {
    const [job] = normaliseJobs([raw('a', { location: 'Juba, South Sudan' })], TODAY, utcDay);
    expect(job.iso).toBe('SS');
    expect(job.country).toBe('South Sudan');
    expect(job.place).toBe('Juba, South Sudan');
  });

  it('finds the country in any part, from the right', () => {
    expect(isoFromLocation('Afghanistan, various sites')).toBe('AF');
    expect(isoFromLocation('Yangon, Bahan Township, Myanmar')).toBe('MM');
    expect(isoFromLocation('Dar es Salaam, United Republic of Tanzania')).toBe('TZ');
  });

  it('does not place a region, a global role, or an excluded country', () => {
    expect(isoFromLocation('West Africa, various contexts')).toBeNull();
    expect(isoFromLocation('To be deployed globally')).toBeNull();
    expect(isoFromLocation('within the Caribbean Multi-Country Office (excluding Kingston, Jamaica)')).toBeNull();
    expect(isoFromLocation(null)).toBeNull();
  });
});

describe('Recommended order', () => {
  it('puts the soonest deadline first, mixes organisations, and puts jobs unseen for 30 days last', () => {
    const jobs = normaliseJobs(
      [
        raw('u1', { deadline: '2026-10-24' }),
        raw('u2', { deadline: '2026-10-25' }),
        raw('u3', { deadline: '2026-10-26' }),
        raw('o1', { org: 'Oxfam GB', deadline: '2026-11-20' }),
        raw('old', { deadline: '2026-10-23', last_seen_at: '2026-09-01T08:00:00+00:00' }),
        raw('open', { deadline: null }),
      ],
      TODAY,
      utcDay,
    );
    expect(recommendedOrder(jobs).map((j) => j.id)).toEqual(['u1', 'u2', 'o1', 'u3', 'open', 'old']);
  });
});
