/**
 * R1-10 / R2-P1-4 leftover (21 November 2026): visible group drop targets (helper + attrs) and
 * remove-group rehomes sections instead of deleting them. Undo restores the group.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { addTranslation, groupingOf, outlineOp, undoStep, versionOp } from '../../components/employer-demo/actions';
import { groupDropAt } from '../../components/employer-demo/Grip';
import { groupOfKey, groupOrderOf, rehomeTarget, removeCustomGroup } from '../../components/employer-demo/outline';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
});

describe('R1-10 / R2-P1-4: groupDropAt', () => {
  it('returns the first group whose upper band is below the pointer, else null for the end', () => {
    const root = document.createElement('div');
    const a = document.createElement('section');
    a.dataset.groupBlock = 'employer';
    Object.defineProperty(a, 'getBoundingClientRect', { value: () => ({ top: 0, height: 80, bottom: 80, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) }) });
    const b = document.createElement('section');
    b.dataset.groupBlock = 'job';
    Object.defineProperty(b, 'getBoundingClientRect', { value: () => ({ top: 100, height: 80, bottom: 180, left: 0, right: 100, width: 100, x: 0, y: 100, toJSON: () => ({}) }) });
    const c = document.createElement('section');
    c.dataset.groupBlock = 'person';
    Object.defineProperty(c, 'getBoundingClientRect', { value: () => ({ top: 200, height: 80, bottom: 280, left: 0, right: 100, width: 100, x: 0, y: 200, toJSON: () => ({}) }) });
    root.append(a, b, c);

    // Dragging "employer": skip self; pointer in upper band of "job" → before job.
    expect(groupDropAt(root, 105, 'employer')).toBe('job');
    // Past job's upper band, into person → before person.
    expect(groupDropAt(root, 205, 'employer')).toBe('person');
    // Below every group → end.
    expect(groupDropAt(root, 400, 'employer')).toBeNull();
  });
});

describe('R1-10 / R2-P1-4: removeGroup rehomes sections', () => {
  it('rehomeTarget: catalog → own group; custom → previous group; apply → apply', () => {
    outlineOp('job-comms', { op: 'addGroup', label: 'Annex' });
    const gid = job('job-comms').customGroups![0].id;
    const g = groupingOf(job('job-comms'));
    expect(rehomeTarget(g, gid, 'responsibilities')).toBe('job');
    expect(rehomeTarget(g, gid, 'purpose')).toBe('job');
    expect(rehomeTarget(g, gid, 'apply')).toBe('apply');
    // Custom group sits after catalog groups; previous is apply when at the end.
    const order = groupOrderOf(g);
    expect(order[order.length - 1]).toBe(gid);
    expect(rehomeTarget(g, gid, 'c-fake')).toBe('apply');
  });

  it('removeCustomGroup keeps keys and drops only the custom group', () => {
    outlineOp('job-comms', { op: 'addGroup', label: 'Field notes' });
    const gid = job('job-comms').customGroups![0].id;
    outlineOp('job-comms', { op: 'addCustom', heading: 'Week one', group: gid });
    outlineOp('job-comms', { op: 'toGroup', key: 'purpose', group: gid });
    const before = job('job-comms');
    const custom = before.tags.find((k) => k.startsWith('c-'))!;
    const removed = removeCustomGroup(before.tags, groupingOf(before), gid)!;
    expect(removed.keys).toContain(custom);
    expect(removed.keys).toContain('purpose');
    expect(removed.customGroups).toBeUndefined();
    // Catalog Role purpose returns to The job; custom Week one goes to the previous group (Applying).
    expect(groupOfKey({ ...removed.grouping, customGroups: removed.customGroups }, 'purpose')).toBe('job');
    expect(groupOfKey({ ...removed.grouping, customGroups: removed.customGroups }, custom)).toBe('apply');
  });

  it('outlineOp removeGroup keeps sections, rehomes them, and Undo restores the group', () => {
    outlineOp('job-comms', { op: 'addGroup', label: 'Field notes' });
    const gid = job('job-comms').customGroups![0].id;
    outlineOp('job-comms', { op: 'addCustom', heading: 'Week one', group: gid });
    outlineOp('job-comms', { op: 'toGroup', key: 'purpose', group: gid });
    const custom = job('job-comms').tags.find((k) => k.startsWith('c-'))!;
    const tagsBefore = job('job-comms').tags.slice();

    outlineOp('job-comms', { op: 'removeGroup', group: gid });

    const after = job('job-comms');
    expect(after.customGroups).toBeUndefined();
    expect(after.tags).toEqual(expect.arrayContaining(tagsBefore));
    expect(after.tags).toContain(custom);
    expect(after.sections.some((x) => x.key === custom)).toBe(true);
    expect(groupOfKey(groupingOf(after), 'purpose')).toBe('job');
    expect(after.undoStep?.text).toMatch(/Removed the group/i);

    undoStep('job-comms');
    expect(job('job-comms').customGroups?.[0].id).toBe(gid);
    expect(groupOfKey(groupingOf(job('job-comms')), 'purpose')).toBe(gid);
    expect(groupOfKey(groupingOf(job('job-comms')), custom)).toBe(gid);
  });

  it('versionOp removeGroup rehomes on a language version without deleting sections', () => {
    addTranslation('job-comms', 'fr');
    versionOp('job-comms', 'fr', { op: 'addGroup', label: 'Notes FR' });
    const gid = job('job-comms').translations!.fr!.customGroups![0].id;
    versionOp('job-comms', 'fr', { op: 'addCustom', heading: 'Semaine un', group: gid });
    const custom = job('job-comms').translations!.fr!.sections.find((x) => x.key.startsWith('c-'))!.key;
    const n = job('job-comms').translations!.fr!.sections.length;

    versionOp('job-comms', 'fr', { op: 'removeGroup', group: gid });

    const t = job('job-comms').translations!.fr!;
    expect(t.customGroups).toBeUndefined();
    expect(t.sections).toHaveLength(n);
    expect(t.sections.some((x) => x.key === custom)).toBe(true);
  });
});
