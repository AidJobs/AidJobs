import { addTranslation, dismissProposal, editSection, hireAgain, removeTranslation, startGuidedWalk, startJob, writeSections } from '@/components/employer-demo/actions';
import { applyAiTurn } from '@/components/employer-demo/aiActions';
import { readinessOf } from '@/components/employer-demo/flow';
import { getState, resetDemo, undo, update } from '@/components/employer-demo/store';
import { systemFor } from '@/lib/employerDemoAi/model';

beforeEach(() => {
  localStorage.clear();
  resetDemo('riverstone');
});

describe('Phase C — Instant Draft-First, Readiness, Calm Chat & Control Budget', () => {
  test('startJob(inWindow=true) creates an instant live draft without trapping the user in a 5-step setup', () => {
    const id = startJob('WASH Officer in Juba, South Sudan, 12-month fixed-term, closing 2026-12-20', undefined, [], true);
    const job = getState().jobs.find((j) => j.id === id)!;
    expect(job.setup).toBeUndefined();
    expect(job.walk).toBeUndefined();
    expect(job.sections.length).toBeGreaterThan(2);
    expect(job.chat.length).toBe(2);
  });

  test('readinessOf computes declarative completion without requiring a manual approval loop', () => {
    const id = startJob('Finance Officer in Nairobi, Kenya, fixed-term, closing 2026-12-20', undefined, [], true);
    const job = getState().jobs.find((j) => j.id === id)!;
    const r = readinessOf(job, getState());
    expect(r.missingEssentials).toEqual([]);
    expect(r.sectionsTotal).toBe(job.tags.length);
    expect(r.sectionsDone).toBeGreaterThan(0);
    expect(r.readyToPublish).toBe(true);
  });

  test('startGuidedWalk opts into section-by-section mode on demand, and dismissProposal persists dismissed Tier-3 proposals', () => {
    const id = startJob('Logistics Officer in Juba, South Sudan', undefined, [], true);
    expect(getState().jobs.find((j) => j.id === id)!.walk).toBeUndefined();

    startGuidedWalk(id);
    expect(getState().jobs.find((j) => j.id === id)!.walk).toBeDefined();

    dismissProposal(id, 'deadline');
    expect(getState().jobs.find((j) => j.id === id)!.dismissedProposals).toContain('deadline');
  });

  test('editSection silences routine manual-edit chat spam, tracks lastEditedByUser, and preserves approval on minor fixes', () => {
    const id = startJob('Programme Officer in Juba, fixed-term, closing 2026-12-20', undefined, [], true);
    update((st) => ({
      ...st,
      jobs: st.jobs.map((j) =>
        j.id === id
          ? {
              ...j,
              review: { state: 'approved', reviewers: [{ personId: 'p1', name: 'Nadia', email: 'nadia@example.org', state: 'approved', at: Date.now() }], due: '', round: 1, rule: 'any', remarks: [] },
            }
          : j,
      ),
    }));
    const beforeChatCount = getState().jobs.find((j) => j.id === id)!.chat.length;
    editSection(id, 'purpose', 'Lead the WASH programme in Juba.', true, { minor: true });
    const afterMinor = getState().jobs.find((j) => j.id === id)!;
    expect(afterMinor.chat.length).toBe(beforeChatCount);
    expect(afterMinor.lastEditedByUser).toBe('purpose');
    expect(afterMinor.review.state).toBe('approved');

    editSection(id, 'purpose', 'Lead all country programmes across South Sudan.', true, { minor: false });
    const afterMaterial = getState().jobs.find((j) => j.id === id)!;
    expect(afterMaterial.review.state).not.toBe('approved');
  });

  test('applyAiTurn enforces deterministic control budget: 0 buttons on routine edits, max 2 on decisions', () => {
    const id = startJob('WASH Officer in Juba, fixed-term, closing 2026-12-20', undefined, [], true);
    // Routine edit with stray quick buttons from model -> stripped to 0 buttons
    applyAiTurn(
      id,
      'Tighten the purpose section',
      {
        reply: 'Done — tightened the purpose section to two crisp sentences.',
        actions: [
          { type: 'write_section', section: 'purpose', lines: ['Lead WASH delivery in Juba across three partner clinics.'] },
          { type: 'ask', quick: ['Looks good', 'Make it shorter', 'Add bullets', 'Rewrite again'] },
        ],
      },
      () => {},
    );
    const afterRoutine = getState().jobs.find((j) => j.id === id)!;
    expect(afterRoutine.chat[afterRoutine.chat.length - 1].quick).toBeUndefined();

    // Real decision -> capped to max 2 controls
    applyAiTurn(
      id,
      'Should we make this a roster?',
      {
        reply: 'Would you like this to be an open roster or a single vacancy?',
        actions: [{ type: 'ask', quick: ['Make it a roster', 'Keep as single vacancy', 'Option 3', 'Option 4'] }],
      },
      () => {},
    );
    const afterDecision = getState().jobs.find((j) => j.id === id)!;
    expect(afterDecision.chat[afterDecision.chat.length - 1].quick).toEqual(['Make it a roster', 'Keep as single vacancy']);
  });

  test('systemFor includes worked example on first draft and omits it on follow-up turns', () => {
    const ctxWithSections = {
      org: { orgType: 'ingo' },
      job: { template: { key: 'ingo-role-profile' }, status: 'draft', sections: [{ key: 'purpose', lines: ['Existing draft text'] }] },
    };
    const firstPrompt = systemFor(ctxWithSections, true);
    const followUpPrompt = systemFor(ctxWithSections, false);
    expect(firstPrompt.length).toBeGreaterThan(followUpPrompt.length);
    expect(firstPrompt).toContain('A worked example in this template');
    expect(followUpPrompt).not.toContain('A worked example in this template');
  });

  test('hireAgain skips the section-by-section chat loop and opens calmly', () => {
    const src = getState().jobs[0];
    const nid = hireAgain(src.id)!;
    const copy = getState().jobs.find((j) => j.id === nid)!;
    expect(copy.walk).toBeUndefined();
    expect(copy.chat.length).toBe(1);
    expect(copy.chat[0].text).toMatch(/Copied from/i);
  });

  test('Phase D review fix: background AI tailoring never overwrites manually edited sections', () => {
    const id = startJob('WASH Officer in Nairobi, Kenya', undefined, [], true);
    editSection(id, 'purpose', 'My carefully written custom purpose.', true);
    writeSections(
      id,
      [
        { key: 'purpose', lines: ['AI overwritten text'] },
        { key: 'responsibilities', lines: ['- AI tailored duty'] },
      ],
      'AI tailored draft',
      true,
    );
    const updated = getState().jobs.find((j) => j.id === id)!;
    expect(updated.sections.find((s) => s.key === 'purpose')?.lines).toEqual(['My carefully written custom purpose.']);
    expect(updated.sections.find((s) => s.key === 'responsibilities')?.lines).toEqual(['- AI tailored duty']);
  });

  test('Phase D review fix: removeTranslation offers Undo and restores the language version cleanly', () => {
    const id = getState().jobs[0].id;
    addTranslation(id, 'fr');
    expect(getState().jobs.find((j) => j.id === id)?.translations?.fr).toBeDefined();
    removeTranslation(id, 'fr');
    expect(getState().jobs.find((j) => j.id === id)?.translations?.fr).toBeUndefined();
    expect(getState().notice?.undo).toBeDefined();
    undo();
    expect(getState().jobs.find((j) => j.id === id)?.translations?.fr).toBeDefined();
  });
});
