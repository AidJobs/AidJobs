/** @jest-environment node */
import { describe, expect, it, jest } from '@jest/globals';
import { answerWithChecks, draftProblems, mergeRepair, repairMessages } from '../employerDemoAi/quality';
import type { ChatTurn, ModelResult } from '../employerDemoAi/model';

const sections = [
  { key: 'about', heading: 'About us', fixed: true },
  { key: 'purpose', heading: 'Role purpose' },
  { key: 'relationships', heading: 'Scope of role' },
  { key: 'responsibilities', heading: 'Key areas of accountability' },
  { key: 'competencies', heading: 'Behaviours' },
  { key: 'requirements', heading: 'Qualifications and experience' },
  { key: 'apply', heading: 'How to apply', fixed: true },
];
const ctx = (stage: string, first: string, extra: Record<string, unknown> = {}) => ({
  stage,
  job: { template: { key: 'ingo-role-profile' }, facts: { title: 'WASH Officer', location: 'Juba, South Sudan', grade: 'C1', deadline: '2026-12-15', ...extra }, sections },
  org: { orgType: 'ingo' },
  conversation: [{ from: 'user', text: first }],
});
const brief = 'We need a WASH Officer in Juba with two local partners; supervises 6 hygiene promoters; a degree in public health and 3 years of WASH experience.';
const words = (n: number, w = 'water') => Array(n).fill(w).join(' ');
const bullets = (n: number, text = 'Train hygiene promoters with the partners in Juba every month') => Array.from({ length: n }, () => `- ${text}`);
const write = (section: string, lines: string[]) => ({ type: 'write_section', section, lines });

function fullDraft(): ChatTurn {
  const groups = ['Programme quality:', 'Partnership:', 'Monitoring:', 'People:'].flatMap((g) => [g, ...bullets(5)]);
  return {
    reply: 'Here is the first draft.',
    actions: [
      { type: 'set_style', style: ['Formal'] },
      write('purpose', [`The post holder will lead hygiene promotion in Juba with two local partners and 6 hygiene promoters. ${words(60)}`]),
      write('relationships', ['Reports to: [Reports to]', 'Staff reporting to this post: 6 hygiene promoters', 'Budget responsibilities: [to confirm]', 'Location and travel: Juba', 'Contract: [to confirm]', 'Grade: C1', 'Child safeguarding level: [to confirm]']),
      write('responsibilities', groups),
      write('competencies', ['Accountability: keeps commitments', 'Collaboration: works with partners', 'Integrity: acts honestly', 'Ambition: seeks quality']),
      write('requirements', ['Essential:', '- A degree in public health', '- 3 years of WASH experience', '- Hygiene promotion experience', '- Training skills', '- Report writing', 'Desirable:', '- Juba Arabic', `- ${words(500, 'sanitation')}`]),
    ],
  };
}

describe('the checks on a first draft', () => {
  it('pass a complete draft that keeps the facts and invents nothing', () => {
    expect(draftProblems(fullDraft(), ctx('style', brief), 'Formal, please')).toEqual([]);
  });

  it('find missing sections, short sections, too few duties or groups, and an unused fact', () => {
    const turn: ChatTurn = { reply: 'Draft.', actions: [write('purpose', ['The post holder supports WASH work.']), write('responsibilities', ['- Train people', '- Repair water points'])] };
    const problems = draftProblems(turn, ctx('style', brief), 'Formal');
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('missing: Scope of role, Behaviours, Qualifications and experience'),
        expect.stringMatching(/^The draft has \d+ words; this template needs about 800 to 1300/),
        expect.stringContaining('Role purpose: 6 words; it needs at least 50'),
        expect.stringContaining('Key areas of accountability: 2 duties; it needs 18 to 28'),
        expect.stringContaining('Key areas of accountability: 0 groups; it needs 4 to 6'),
        expect.stringContaining('Use the duty station, Juba'),
        expect.stringMatching(/^Use the facts the user gave: "6 hygiene promoters", "3 years"/),
      ]),
    );
  });

  it('find invented numbers, a "new post", filler, raised education, and English labels in a French job', () => {
    const turn = fullDraft();
    turn.actions.push(write('conditions', ['This is a new post supporting 47 sites with relevant stakeholders.', 'A Master\'s degree in public health.']));
    const problems = draftProblems(turn, ctx('writing', brief), 'Add the conditions');
    expect(problems).toEqual(
      expect.arrayContaining([expect.stringContaining('Remove numbers that were not given: 47'), expect.stringContaining('Remove "new post"'), expect.stringContaining('"relevant stakeholders"'), expect.stringContaining("Keep the education exactly as the user gave it")]),
    );
    const fr = draftProblems(fullDraft(), ctx('writing', "Nous recrutons un chargé de protection à Goma pour le poste avec des partenaires, nous avons besoin d'un diplôme"), 'Formel');
    expect(fr).toEqual(expect.arrayContaining([expect.stringMatching(/^Write the labels in French: "Reports to:"/)]));
  });

  it('on an edit, never ask for more length: a shortened section is not a problem', () => {
    const turn: ChatTurn = { reply: 'Shortened.', actions: [write('responsibilities', ['- Run hygiene promotion in Juba', '- Supervise repairs'])] };
    expect(draftProblems(turn, ctx('writing', brief), 'Make the responsibilities shorter')).toEqual([]);
  });

  it('a turn that writes nothing is not checked', () => {
    expect(draftProblems({ reply: 'Which template?', actions: [{ type: 'ask' }] }, ctx('template', brief), 'hi')).toEqual([]);
  });
});

describe('the checks, one section at a time (round 7, phase 2)', () => {
  const stepCtx = (written: string[], next: Record<string, unknown> | null) => ({
    ...ctx('writing', brief),
    job: { ...ctx('writing', brief).job, sections: sections.map((s) => ({ ...s, text: written.includes(s.key) ? 'Some text.' : null })) },
    walk: { next },
  });

  it('holds a section written for the first time to its rules, but not an edit of one already written', () => {
    const turn: ChatTurn = { reply: 'Here it is.', actions: [write('responsibilities', ['- Run hygiene promotion in Juba', '- Supervise repairs'])] };
    const first = draftProblems(turn, stepCtx(['about', 'purpose'], { kind: 'write', sections: [{ key: 'responsibilities' }] }), 'Go on');
    expect(first).toEqual(expect.arrayContaining([expect.stringContaining('Key areas of accountability: 2 duties; it needs 18 to 28')]));
    expect(first.some((p) => p.startsWith('The draft has'))).toBe(false);
    expect(draftProblems(turn, stepCtx(['about', 'purpose', 'responsibilities'], { kind: 'approve', section: 'responsibilities' }), 'Shorter')).toEqual([]);
  });

  it('asks again for a section the window asked for and the answer left out', () => {
    const turn: ChatTurn = { reply: 'Shall I go on?', actions: [] };
    expect(draftProblems(turn, stepCtx(['about'], { kind: 'write', sections: [{ key: 'purpose' }] }), 'Go on')[0]).toBe('Write the section asked for now; missing: Role purpose.');
  });

  it('a whole draft asked for at once is held to its length and its sections', () => {
    const turn: ChatTurn = { reply: 'Draft.', actions: [write('purpose', ['The post holder supports WASH work in Juba.'])] };
    const problems = draftProblems(turn, stepCtx(['about', 'apply'], { kind: 'write', sections: ['purpose', 'relationships', 'responsibilities'].map((key) => ({ key })) }), 'Go on');
    expect(problems).toEqual(expect.arrayContaining([expect.stringContaining('missing: Scope of role, Key areas of accountability'), expect.stringMatching(/^The draft has \d+ words/)]));
  });
});

describe('one targeted repair', () => {
  it('asks with the model\'s own answer and the exact problems, then puts the repaired sections in place', () => {
    const msgs = repairMessages([{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }], '{"reply":"x"}', ['Fix A', 'Fix B']);
    expect(msgs.slice(2)).toEqual([{ role: 'assistant', content: '{"reply":"x"}' }, { role: 'user', content: expect.stringContaining('- Fix A\n- Fix B\nFix them.') }]);
    const merged = mergeRepair({ reply: 'First', actions: [{ type: 'set_style' }, write('purpose', ['old']), write('responsibilities', ['- keep'])] }, { reply: 'Fixed', actions: [write('purpose', ['new']), write('competencies', ['- added'])] });
    expect(merged).toEqual({ reply: 'First', actions: [{ type: 'set_style' }, write('purpose', ['new']), write('responsibilities', ['- keep']), write('competencies', ['- added'])] });
  });

  it('repairs once when the checks fail, and not at all when they pass', async () => {
    const short = JSON.stringify({ reply: 'Draft', actions: [write('purpose', ['Short.'])] });
    const fixed = JSON.stringify({ reply: 'Fixed', actions: fullDraft().actions.filter((a) => a.type === 'write_section') });
    const call = jest.fn(async (): Promise<ModelResult> => ({ ok: true, content: call.mock.calls.length === 1 ? short : fixed }));
    const out = await answerWithChecks(call, [{ role: 'user', content: 'x' }], ctx('style', brief), 'Formal');
    expect(call).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({ ok: true, repaired: true, left: [] });
    const good = jest.fn(async (): Promise<ModelResult> => ({ ok: true, content: JSON.stringify(fullDraft()) }));
    expect(await answerWithChecks(good, [], ctx('style', brief), 'Formal')).toMatchObject({ ok: true, repaired: false, problems: [] });
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('keeps the first answer when the repair fails, and passes on a failed first call', async () => {
    const short = JSON.stringify({ reply: 'Draft', actions: [write('purpose', ['Short.'])] });
    const call = jest.fn(async (): Promise<ModelResult> => (call.mock.calls.length === 1 ? { ok: true, content: short } : { ok: false, status: 0 }));
    const out = await answerWithChecks(call, [], ctx('style', brief), 'Formal');
    expect(out).toMatchObject({ ok: true, repaired: false, turn: { reply: 'Draft' } });
    expect(await answerWithChecks(async () => ({ ok: false, status: 403 }), [], ctx('style', brief), 'x')).toEqual({ ok: false, status: 403 });
    expect(await answerWithChecks(async () => ({ ok: true, content: 'no json' }), [], ctx('style', brief), 'x')).toEqual({ ok: false, status: 502, code: 'unreadable' });
  });

  it('starts no repair once the time budget is spent', async () => {
    const short = JSON.stringify({ reply: 'Draft', actions: [write('purpose', ['Short.'])] });
    const call = jest.fn(async (): Promise<ModelResult> => ({ ok: true, content: short }));
    const out = await answerWithChecks(call, [], ctx('style', brief), 'Formal', -1);
    expect(call).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ ok: true, repaired: false });
  });
});
