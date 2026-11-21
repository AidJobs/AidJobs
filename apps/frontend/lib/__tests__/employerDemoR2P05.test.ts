/**
 * R2-P0-5 / R1-19 (21 November 2026): after Approve, walk.approved holds the section (UI shows Approved chip);
 * a Save that changes text clears that approval again (R1-06).
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { approveSection, editSection } from '../../components/employer-demo/actions';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
});

describe('R2-P0-5: Approved mark state (walk.approved)', () => {
  it('approveSection adds the section; edit that changes text clears it so Approve can return', () => {
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) =>
        j.id === 'job-comms'
          ? {
              ...j,
              setup: undefined,
              walk: { pace: 'step', settled: [], approved: [] },
              sections: j.sections.map((x) => (x.key === 'purpose' ? { ...x, lines: ['Support livelihoods work in Nairobi.'] } : x)),
            }
          : j,
      ),
    }));
    expect(job('job-comms').walk?.approved ?? []).not.toContain('purpose');

    approveSection('job-comms', 'purpose');
    // DocPane shows the Approved chip whenever walk.approved includes the key (and walk is active).
    expect(job('job-comms').walk?.approved).toContain('purpose');

    editSection('job-comms', 'purpose', 'Support livelihoods work in Nairobi and Kisumu.');
    expect(job('job-comms').walk?.approved ?? []).not.toContain('purpose');
  });

  it('approveSection is a no-op when the section is already approved', () => {
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) =>
        j.id === 'job-comms'
          ? {
              ...j,
              setup: undefined,
              walk: { pace: 'step', settled: [], approved: ['purpose'] },
              sections: j.sections.map((x) => (x.key === 'purpose' ? { ...x, lines: ['Already written.'] } : x)),
            }
          : j,
      ),
    }));
    approveSection('job-comms', 'purpose');
    expect(job('job-comms').walk?.approved.filter((k) => k === 'purpose')).toHaveLength(1);
  });
});
