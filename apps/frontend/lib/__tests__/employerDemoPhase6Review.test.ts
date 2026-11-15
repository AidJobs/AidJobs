/**
 * Phase 6 review revision (15 November 2026): context first after the template, tone chips, one chat reply.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { advanceFromAbout, advanceFromProject, aiExchange, applyTemplate, chooseStyle, sendChat, setPace, startJob } from '../../components/employer-demo/actions';
import { nextStep, stepKey } from '../../components/employer-demo/flow';
import { STYLES, describeStyle, proposedStyle, styleFromReply, toneOf } from '../../components/employer-demo/setup';
import { getState, resetDemo, update } from '../../components/employer-demo/store';
import { STYLE_QUICK } from '../../components/employer-demo/walkChat';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;

beforeEach(() => {
  resetDemo();
  update((s) => ({ ...s, org: { ...s.org, styleKept: false }, pace: undefined, reviewerAs: undefined }));
});

describe('Phase 6 review revision: context before tone', () => {
  it('after the template, the next step is About us with the website card, then project, then style', () => {
    const id = startJob('We are hiring a Nutrition Officer', undefined, [], true);
    applyTemplate(id, job(id).format);
    expect(job(id).setup).toBe('about');
    expect(nextStep(job(id), getState())).toEqual({ kind: 'setup', stage: 'about' });
    expect(job(id).chat.at(-1)?.card).toBe('website');
    expect(job(id).chat.at(-1)?.text).toMatch(/About us/i);

    advanceFromAbout(id, 'Skip for now');
    expect(job(id).setup).toBe('project');
    expect(job(id).chat.at(-1)?.card).toBe('project');

    advanceFromProject(id, 'No project page');
    expect(job(id).setup).toBe('style');
    // Early facts (title may already be set from startJob) — style when title/place/contract/grade settled or asked.
    const step = nextStep(job(id), getState());
    expect(step?.kind === 'ask' || (step?.kind === 'setup' && step.stage === 'style')).toBe(true);
  });

  it('tone chips are Warm/Formal/we/you; Plain English and Short sentences are not offered', () => {
    expect(STYLES).toEqual(['Warm', 'Formal', 'Speaks as "we"', 'Uses "you"', 'Rights-based', 'Inclusive']);
    expect(STYLE_QUICK).toEqual(['Yes, write it that way', 'Warm', 'Formal', 'Speaks as "we"', 'Uses "you"']);
    expect(STYLE_QUICK.join(' ')).not.toMatch(/Shorter|Plain English|More formal/);
    expect(proposedStyle(getState()).every((x) => STYLES.includes(x))).toBe(true);
    expect(styleFromReply(['Warm'], 'more formal please')).toEqual(['Formal']);
    expect(styleFromReply(['Warm', 'Plain English' as string], 'keep it')).toEqual(['Warm']);
    expect(describeStyle(['Warm', 'Speaks as "we"', 'Uses "you"'])).toBe('warmly and speaking as "we" to "you"');
    expect(toneOf(['Formal'])).toBe('formal');
    expect(toneOf(['Warm'])).toBe('warm');
  });

  it('one AI reply tagged with the open step does not append a second rules bubble', () => {
    const id = startJob('We are hiring a Nutrition Officer', undefined, [], true);
    applyTemplate(id, job(id).format);
    advanceFromAbout(id);
    advanceFromProject(id);
    // Settle early facts so the open step is style.
    const j0 = job(id);
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) =>
        j.id === id
          ? {
              ...j,
              facts: { ...j.facts, title: j.facts.title || 'Nutrition Officer', location: 'Juba', contract: 'fixed-term', grade: 'n/a' },
              walk: { ...j.walk!, settled: Array.from(new Set([...(j.walk?.settled ?? []), 'title', 'place', 'contract', 'grade'])) },
            }
          : j,
      ),
    }));
    const before = job(id).chat.length;
    const want = stepKey(nextStep(job(id), getState()));
    expect(want).toBe('setup:style');
    aiExchange(id, job(id).chat, null, { text: 'How should it sound? Warm, speaking as we?', quick: STYLE_QUICK, step: want }, true);
    expect(job(id).chat.length).toBe(before + 1);
    expect(job(id).chat.filter((m) => m.from === 'ai' && m.step === 'setup:style').length).toBe(1);
  });
});

describe('Phase 6 review revision: skip path still reaches writing', () => {
  it('Skip for now on about and project, then style and pace, writes as before', () => {
    const id = startJob('We are hiring a Nutrition Officer in Juba, fixed-term', undefined, [], true);
    applyTemplate(id, job(id).format);
    sendChat(id, 'Skip for now');
    expect(job(id).setup).toBe('project');
    sendChat(id, 'No project page');
    expect(job(id).setup).toBe('style');
    chooseStyle(id, ['Warm', 'Speaks as "we"']);
    expect(job(id).setup).toBe('pace');
    setPace(id, 'step');
    expect(job(id).setup).toBeUndefined();
    expect(job(id).walk?.pace).toBe('step');
  });
});
