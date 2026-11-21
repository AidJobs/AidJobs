/**
 * R1-10 leftover (21 November 2026): Move up on the first / Move down on the last section must not
 * change tags or create an undoStep (no fake “Moved”). Group drops / remove-group: employerDemoR1_10Groups.test.ts.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { groupingOf, outlineOp } from '../../components/employer-demo/actions';
import { grouped, moveInReading } from '../../components/employer-demo/outline';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
});

describe('R1-10 leftover: Move up/down at ends is a no-op', () => {
  it('moveInReading leaves keys and grouping unchanged at the first and last reading place', () => {
    const j = job('job-comms');
    const g = groupingOf(j);
    const read = grouped(j.tags, g);
    const first = read[0];
    const last = read[read.length - 1];

    const up = moveInReading(j.tags, g, first, -1);
    expect(up.keys).toEqual(j.tags);
    expect(JSON.stringify(up.grouping.groupOf)).toBe(JSON.stringify(g.groupOf));

    const down = moveInReading(j.tags, g, last, 1);
    expect(down.keys).toEqual(j.tags);
    expect(JSON.stringify(down.grouping.groupOf)).toBe(JSON.stringify(g.groupOf));
  });

  it('outlineOp by + reading at the first section leaves tags and undoStep unchanged', () => {
    const before = job('job-comms');
    const first = grouped(before.tags, groupingOf(before))[0];
    const tags = before.tags.slice();
    const step = before.undoStep;

    outlineOp('job-comms', { op: 'by', key: first, by: -1, reading: true });

    const after = job('job-comms');
    expect(after.tags).toEqual(tags);
    expect(after.undoStep).toBe(step);
    expect(JSON.stringify(groupingOf(after))).toBe(JSON.stringify(groupingOf(before)));
  });

  it('outlineOp by + reading at the last section leaves tags and undoStep unchanged', () => {
    const before = job('job-comms');
    const read = grouped(before.tags, groupingOf(before));
    const last = read[read.length - 1];
    const tags = before.tags.slice();
    const step = before.undoStep;

    outlineOp('job-comms', { op: 'by', key: last, by: 1, reading: true });

    const after = job('job-comms');
    expect(after.tags).toEqual(tags);
    expect(after.undoStep).toBe(step);
  });

  it('a real reading move still creates an undoStep', () => {
    const before = job('job-comms');
    const read = grouped(before.tags, groupingOf(before));
    expect(read.length).toBeGreaterThan(1);
    const mid = read[1];

    outlineOp('job-comms', { op: 'by', key: mid, by: -1, reading: true });

    const after = job('job-comms');
    expect(after.tags).not.toEqual(before.tags);
    expect(after.undoStep?.keys).toContain(mid);
  });
});
