/**
 * R2-P1-8 (21 November 2026): Check progress / card honesty vs empty Qualifications
 * (and other outline gaps). Soft skip must not clear outline gaps; card matches checkPoints.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { leavePoint, startJob } from '../../components/employer-demo/actions';
import { addDays } from '../../components/employer-demo/engine';
import { checkPoints, isOutlineGapPoint, outlineGapPointKey, sectionPublishGaps } from '../../components/employer-demo/flow';
import { partsOf } from '../../components/employer-demo/parts';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo('tumaini');
  update((s) => ({ ...s, signedIn: true }));
});

/** A walk job with enough written sections for a soft-clear basic check, but Qualifications empty. */
function walkWithEmptyRequirements(): string {
  const id = startJob('WASH Coordinator in Kisumu, Kenya, 12-month fixed-term, closing 18 December 2026', undefined, [], true);
  update((s) => ({
    ...s,
    jobs: s.jobs.map((j) => {
      if (j.id !== id) return j;
      const tags = ['background', 'purpose', 'responsibilities', 'requirements', 'apply'];
      const filled = (key: string, title: string, lines: string[]) => ({ key, title, lines });
      return {
        ...j,
        setup: undefined,
        format: 'local-concise',
        tags,
        facts: { ...j.facts, title: 'WASH Coordinator', location: 'Kisumu, Kenya', deadline: addDays(s.today, 30), contract: 'Fixed-term' },
        sections: [
          filled('background', 'Project brief', ['County WASH programme in Kisumu.']),
          filled('purpose', 'Job purpose', ['Coordinate county WASH delivery with the field team.']),
          filled('responsibilities', 'Key responsibilities', ['- Lead county WASH work with partners.']),
          filled('apply', 'How to apply', ['Email jobs@tumaini.example.org by the closing date.']),
        ],
        walk: { approved: ['background', 'purpose', 'responsibilities', 'apply'], settled: [], pace: 'step' },
      };
    }),
  }));
  return id;
}

describe('R2-P1-8: Check done vs empty Qualifications', () => {
  it('empty Qualifications keeps checkPoints open and Check part not done', () => {
    const id = walkWithEmptyRequirements();
    const j = job(id);
    expect(sectionPublishGaps(j).some((t) => /qualifications/i.test(t))).toBe(true);
    const points = checkPoints(j, getState());
    expect(points.some((p) => p.key === outlineGapPointKey('requirements'))).toBe(true);
    const check = partsOf(j, getState()).find((p) => p.key === 'check')!;
    expect(check.done).toBe(false);
  });

  it('leavePoint cannot skip an outline gap; Check stays open', () => {
    const id = walkWithEmptyRequirements();
    const key = outlineGapPointKey('requirements');
    leavePoint(id, key, 'Leave it as it is');
    expect(job(id).walk?.skipped?.includes(key)).toBeFalsy();
    expect(checkPoints(job(id), getState()).some((p) => p.key === key)).toBe(true);
    expect(partsOf(job(id), getState()).find((p) => p.key === 'check')!.done).toBe(false);
    expect(job(id).chat.some((m) => /still needs wording/i.test(m.text))).toBe(true);
  });

  it('skipped soft points stay off checkPoints; outline gaps still block Check', () => {
    const id = walkWithEmptyRequirements();
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) =>
        j.id === id
          ? {
              ...j,
              walk: {
                ...j.walk!,
                skipped: ['inclusive-fake', outlineGapPointKey('requirements')],
              },
            }
          : j,
      ),
    }));
    const points = checkPoints(job(id), getState());
    expect(points.some((p) => p.key === 'inclusive-fake')).toBe(false);
    expect(points.some((p) => isOutlineGapPoint(p.key) && p.section === 'requirements')).toBe(true);
    expect(partsOf(job(id), getState()).find((p) => p.key === 'check')!.done).toBe(false);
  });

  it('filling Qualifications clears the outline gap and can make Check done when soft points are clear', () => {
    const id = walkWithEmptyRequirements();
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => {
        if (j.id !== id) return j;
        const next = {
          ...j,
          sections: [...j.sections, { key: 'requirements', title: 'Qualifications and experience', lines: ['- Five years in WASH programme work.'] }],
          walk: { ...j.walk!, approved: [...(j.walk?.approved ?? []), 'requirements'] },
        };
        const soft = checkPoints(next, s)
          .filter((p) => !isOutlineGapPoint(p.key))
          .map((p) => p.key);
        return { ...next, walk: { ...next.walk, skipped: soft } };
      }),
    }));
    expect(checkPoints(job(id), getState()).some((p) => isOutlineGapPoint(p.key))).toBe(false);
    expect(partsOf(job(id), getState()).find((p) => p.key === 'check')!.done).toBe(true);
  });

  it('walk Check card list matches checkPoints titles (no google-only openPoints split)', () => {
    const id = walkWithEmptyRequirements();
    const j = job(id);
    const fromPoints = checkPoints(j, getState()).map((p) => p.title);
    expect(fromPoints.some((t) => /Qualifications.*empty or unfinished/i.test(t))).toBe(true);
    // Google readiness is facts-only: never in checkPoints.
    expect(checkPoints(j, getState()).some((p) => p.key === 'google')).toBe(false);
  });
});
