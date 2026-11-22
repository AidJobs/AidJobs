/**
 * R1-27 Option A (22 November 2026): quiet group labels for the draft JD; Move up/down at a
 * group boundary still joins (moveInReading); Undo restores; ends stay no-ops (R1-10).
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { groupingOf, outlineOp, undoStep } from '../../components/employer-demo/actions';
import { SECTION_BY_KEY } from '../../components/employer-demo/engine';
import { draftGroupBreaks, groupLabelOf, groupOfKey, grouped, moveInReading } from '../../components/employer-demo/outline';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
});

describe('R1-27: draftGroupBreaks (quiet labels)', () => {
  it('labels the first section of each non-empty group in reading order', () => {
    const j = job('job-comms');
    const g = { ...groupingOf(j), customGroups: j.customGroups };
    const keys = grouped(j.tags, g);
    const breaks = draftGroupBreaks(keys, g);
    expect(breaks.size).toBeGreaterThanOrEqual(2);
    const first = keys[0];
    expect(breaks.get(first)?.group).toBe(groupOfKey(g, first));
    expect(breaks.get(first)?.label).toBe(groupLabelOf(groupOfKey(g, first), j.customGroups));
    const same = keys.find((k, i) => i > 0 && groupOfKey(g, k) === groupOfKey(g, first));
    if (same) expect(breaks.has(same)).toBe(false);
    const other = keys.find((k) => groupOfKey(g, k) !== groupOfKey(g, first))!;
    expect(breaks.get(other)?.group).toBe(groupOfKey(g, other));
  });

  it('includes a custom group label when that group has a section', () => {
    outlineOp('job-comms', { op: 'addGroup', label: 'Field notes' });
    const gid = job('job-comms').customGroups![0].id;
    outlineOp('job-comms', { op: 'addCustom', heading: 'Week one', group: gid });
    const j = job('job-comms');
    const g = { ...groupingOf(j), customGroups: j.customGroups };
    const custom = j.tags.find((k) => k.startsWith('c-'))!;
    const breaks = draftGroupBreaks(grouped(j.tags, g), g);
    expect(breaks.get(custom)?.group).toBe(gid);
    expect(breaks.get(custom)?.label).toBe('Field notes');
  });
});

describe('R1-27: Move up at a group boundary joins and is undoable', () => {
  it('reading Move up on the first section of a group joins the previous group with an honest note', () => {
    const before = job('job-comms');
    const g0 = groupingOf(before);
    const read = grouped(before.tags, g0);
    const firstJob = read.find((k) => groupOfKey(g0, k) === 'job' && SECTION_BY_KEY[k]?.group === 'job') ?? read.find((k) => groupOfKey(g0, k) === 'job')!;
    expect(groupOfKey(g0, firstJob)).toBe('job');
    const snapTags = before.tags.slice();

    outlineOp('job-comms', { op: 'by', key: firstJob, by: -1, reading: true });

    const after = job('job-comms');
    expect(groupOfKey(groupingOf(after), firstJob)).not.toBe('job');
    expect(after.undoStep?.keys).toContain(firstJob);
    expect(after.undoStep?.text).toMatch(/Moved .+ to /);

    undoStep('job-comms');
    const back = job('job-comms');
    expect(back.tags).toEqual(snapTags);
    expect(groupOfKey(groupingOf(back), firstJob)).toBe('job');
  });

  it('moveInReading at a boundary joins the neighbour; ends stay no-ops', () => {
    const keys = ['about', 'team', 'purpose', 'responsibilities', 'requirements', 'offer', 'apply'];
    const up = moveInReading(keys, {}, 'purpose', -1);
    expect(up.grouping.groupOf).toEqual({ purpose: 'employer' });
    expect(up.keys.indexOf('purpose')).toBe(keys.indexOf('purpose') - 1);

    const ends = moveInReading(keys, {}, 'about', -1);
    expect(ends.keys).toEqual(keys);
    expect(ends.grouping.groupOf).toBeUndefined();
  });
});
