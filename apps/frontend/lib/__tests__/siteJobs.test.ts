import { dayStart, daysUntil, isOpen, normaliseJobs, recommendedOrder, type RawJob } from '../site/jobs';

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

describe('dates from a fixed day', () => {
  it('starts the day at midnight UTC', () => {
    expect(dayStart(Date.UTC(2026, 9, 23, 23, 59))).toBe(TODAY);
    expect(dayStart(Date.UTC(2026, 9, 23, 0, 0))).toBe(TODAY);
  });

  it('counts days left from the given day, not the clock', () => {
    expect(daysUntil('2026-10-23', TODAY)).toBe(0);
    expect(daysUntil('2026-10-24', TODAY)).toBe(1);
    expect(daysUntil('2026-10-22', TODAY)).toBe(-1);
    expect(daysUntil(null, TODAY)).toBeNull();
    expect(daysUntil('not a date', TODAY)).toBeNull();
  });

  it('hides a job once its deadline has passed, and keeps jobs without one', () => {
    const jobs = normaliseJobs([raw('past', { deadline: '2026-10-22' }), raw('today', { deadline: '2026-10-23' }), raw('none')], TODAY);
    expect(jobs.filter(isOpen).map((j) => j.id)).toEqual(['today', 'none']);
    const nextDay = normaliseJobs([raw('today', { deadline: '2026-10-23' })], TODAY + 86_400_000);
    expect(nextDay.filter(isOpen)).toHaveLength(0);
  });

  it('reads the country from the location when there is no code', () => {
    const [job] = normaliseJobs([raw('a', { location: 'Juba, South Sudan' })], TODAY);
    expect(job.iso).toBe('SS');
    expect(job.country).toBe('South Sudan');
    expect(job.place).toBe('Juba, South Sudan');
  });

  it('counts days since the job was last seen on the employer site', () => {
    const [job] = normaliseJobs([raw('a', { last_seen_at: '2026-09-01T08:00:00+00:00' })], TODAY);
    expect(job.seenDaysAgo).toBe(52);
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
    );
    expect(recommendedOrder(jobs).map((j) => j.id)).toEqual(['u1', 'u2', 'o1', 'u3', 'open', 'old']);
  });
});
