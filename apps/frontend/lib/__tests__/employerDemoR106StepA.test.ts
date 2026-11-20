/**
 * English fix-order item 5 Step A (20 November 2026): Approve vs unsaved buffer (R1-06).
 * Save that changes text clears walk.approved; Approve stays a UI concern while the pencil is open.
 * Add-panel blur/Escape is Step B.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { approveSection, editSection, withoutWalkApproval } from '../../components/employer-demo/actions';
import { savePageFieldText } from '../../components/employer-demo/context';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
});

describe('R1-06 Step A: Approve vs buffer', () => {
  it('withoutWalkApproval removes only that section from the walk list', () => {
    const j = {
      ...job('job-comms'),
      walk: { pace: 'step' as const, settled: [] as string[], approved: ['about', 'purpose'] },
    };
    expect(withoutWalkApproval(j, 'about').walk?.approved).toEqual(['purpose']);
    expect(withoutWalkApproval(j, 'missing').walk?.approved).toEqual(['about', 'purpose']);
  });

  it('editSection that changes text clears that section from walk.approved', () => {
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) =>
        j.id === 'job-comms'
          ? {
              ...j,
              walk: { pace: 'step', settled: [], approved: ['about'] },
              sections: j.sections.map((x) => (x.key === 'about' ? { ...x, lines: ['Old About us.'] } : x)),
            }
          : j,
      ),
    }));
    expect(job('job-comms').walk?.approved).toContain('about');
    editSection('job-comms', 'about', 'New About us after edit.');
    expect(job('job-comms').sections.find((x) => x.key === 'about')?.lines).toEqual(['New About us after edit.']);
    expect(job('job-comms').walk?.approved ?? []).not.toContain('about');
  });

  it('editSection with the same text leaves approval in place', () => {
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) =>
        j.id === 'job-comms'
          ? {
              ...j,
              walk: { pace: 'step', settled: [], approved: ['about'] },
              sections: j.sections.map((x) => (x.key === 'about' ? { ...x, lines: ['Same About us.'] } : x)),
            }
          : j,
      ),
    }));
    editSection('job-comms', 'about', 'Same About us.');
    expect(job('job-comms').walk?.approved).toContain('about');
  });

  it('approve then project Save that changes body clears background approval', () => {
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) =>
        j.id === 'job-comms'
          ? {
              ...j,
              walk: { pace: 'step', settled: [], approved: [] },
              tags: j.tags.includes('background') ? j.tags : [...j.tags, 'background'],
              sections: j.sections.some((x) => x.key === 'background')
                ? j.sections.map((x) => (x.key === 'background' ? { ...x, lines: ['Old project line.'] } : x))
                : [...j.sections, { key: 'background', title: 'Background', lines: ['Old project line.'] }],
            }
          : j,
      ),
    }));
    approveSection('job-comms', 'background');
    expect(job('job-comms').walk?.approved).toContain('background');
    savePageFieldText('job-comms', 'project', 'New project text from Save.');
    expect(job('job-comms').walk?.approved ?? []).not.toContain('background');
  });
});
