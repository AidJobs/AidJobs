import { saveJobProfile, startJob } from '@/components/employer-demo/actions';
import { stageFromPart, stageSummary } from '@/components/employer-demo/StagePanels';
import { getState, resetDemo, update } from '@/components/employer-demo/store';

beforeEach(() => {
  localStorage.clear();
  resetDemo('riverstone');
});

describe('Phase B — Unified 4-Stage Workspace, Stage Mapping & Profiles', () => {
  test('stageFromPart maps legacy and AI part keys cleanly into the 4 unified stages', () => {
    expect(stageFromPart('details')).toBe('draft');
    expect(stageFromPart('s:purpose')).toBe('draft');
    expect(stageFromPart('langs')).toBe('draft');
    expect(stageFromPart('check')).toBe('check');
    expect(stageFromPart('market')).toBe('check');
    expect(stageFromPart('full')).toBe('check');
    expect(stageFromPart('review')).toBe('review');
    expect(stageFromPart('publish')).toBe('publish');
    expect(stageFromPart('plan')).toBe('publish');
    expect(stageFromPart('flyer')).toBe('publish');
    expect(stageFromPart('reach')).toBe('publish');
  });

  test('stageSummary computes live missing essentials, check issues, and review requirements', () => {
    const id = startJob('WASH Officer');
    const job = getState().jobs.find((j) => j.id === id)!;
    const sum = stageSummary(job, getState());
    // Missing place, deadline, contract at minimum
    expect(sum.draftMissing).toBeGreaterThanOrEqual(2);
    expect(sum.missing).toContain('place');
    expect(sum.missing).toContain('deadline');

    // Fill all required facts -> draftMissing becomes 0
    update((st) => ({
      ...st,
      jobs: st.jobs.map((j) =>
        j.id === id
          ? {
              ...j,
              facts: { ...j.facts, location: 'Juba, South Sudan', country: 'South Sudan', iso: 'SS', contract: 'Fixed-term', deadline: '2026-12-20' },
            }
          : j,
      ),
    }));
    const sum2 = stageSummary(getState().jobs.find((j) => j.id === id)!, getState());
    expect(sum2.draftMissing).toBe(0);
  });

  test('saveJobProfile saves the current draft as a reusable job profile on demand', () => {
    const id = startJob('Logistics Coordinator in Nairobi, Kenya, fixed-term, closing 2026-12-20');
    const before = (getState().profiles ?? []).length;
    saveJobProfile(id);
    const after = getState().profiles ?? [];
    expect(after.length).toBeGreaterThanOrEqual(before);
    expect(after[0].title).toMatch(/Logistics/i);
  });
});
