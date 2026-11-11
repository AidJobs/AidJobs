import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getState, resetDemo, update } from '../../components/employer-demo/store';
import { setFacts, startJob } from '../../components/employer-demo/actions';
import { applyAiTurn, checkFacts, checkLines, type OpenTarget } from '../../components/employer-demo/aiActions';
import { AI_ROUTE, aiOn, aiState, askAi, chooseAiModel, probeAi, resetAi } from '../../components/employer-demo/ai';
import { addDays } from '../../components/employer-demo/engine';
import { nextStep } from '../../components/employer-demo/flow';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const lastAi = (id: string) => job(id).chat.filter((m) => m.ai).at(-1);
const open = jest.fn((_t: OpenTarget) => undefined);

function stubFetch(fn: (url: string, init?: { body?: string }) => Promise<unknown>) {
  const mock = jest.fn(fn);
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: mock });
  return mock;
}
const answer = (status: number, body: unknown) => stubFetch(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));

beforeEach(() => {
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
  resetAi();
  open.mockClear();
});

describe('the AI chat: facts are checked before they are set', () => {
  it('takes the facts it can check, completes the place from the rules, and names the ones it refuses', () => {
    const id = startJob('We are hiring a Nutrition Officer', undefined, [], true);
    const today = getState().today;
    const { patch, refused } = checkFacts(
      { title: 'Nutrition Officer', location: 'Juba, South Sudan', deadline: addDays(today, 20), salaryMin: '2,500', currency: 'USD', period: 'month', contract: 'temporary', languages: ['english', 'Arabic'], bonus: 'yes' },
      job(id),
      today,
    );
    expect(patch).toMatchObject({ title: 'Nutrition Officer', location: 'Juba, South Sudan', country: 'South Sudan', iso: 'SS', deadline: addDays(today, 20), salaryMin: '2,500', salaryMode: 'exact', currency: 'USD', period: 'month', contract: 'Temporary (under a year)', languages: ['English', 'Arabic'] });
    expect(refused).toEqual(['"bonus"']);
  });

  it('refuses a closing date in the past, more than a year away, or not on the calendar; a contract the job type does not have; and pay without a currency', () => {
    const id = startJob('We are hiring a Nutrition Officer', undefined, [], true);
    const today = getState().today;
    for (const deadline of [addDays(today, -1), addDays(today, 400), '2027-02-30', '30 December']) expect(checkFacts({ deadline }, job(id), today)).toEqual({ patch: {}, refused: ['the closing date'] });
    expect(checkFacts({ contract: 'Zero-hours' }, job(id), today).refused).toEqual(['the contract']);
    const pay = checkFacts({ salaryMin: '3000' }, job(id), today);
    expect(pay.patch.salaryMin).toBeUndefined();
    expect(pay.refused).toEqual(['the salary, without its currency']);
    expect(checkFacts('nonsense', job(id), today).refused).toEqual(['the facts']);
  });

  it('a change of job type brings that type\'s first contract unless one is given', () => {
    const id = startJob('We are hiring a Nutrition Officer, fixed-term', undefined, [], true);
    expect(checkFacts({ engagement: 'consultancy' }, job(id), getState().today).patch).toEqual({ engagement: 'consultancy', contract: 'Consultant' });
    expect(checkFacts({ engagement: 'consultancy', contract: 'Individual contractor' }, job(id), getState().today).patch.contract).toBe('Individual contractor');
  });
});

describe('the AI chat: written text is checked', () => {
  it('cleans the bullets and drops a repeated heading', () => {
    const s = getState();
    const title = job('job-comms').sections.find((x) => x.key === 'responsibilities')!.title;
    for (const heading of [title, 'Responsibilities:', `**${title}**`]) {
      const out = checkLines([heading, '• Lead the team', '* Plan the budget', '  – Report every month'], 'responsibilities', s, job('job-comms'));
      expect(out).toEqual({ lines: ['- Lead the team', '- Plan the budget', '- Report every month'] });
    }
    expect(checkLines('text', 'responsibilities', s, job('job-comms'))).toEqual({ refused: expect.stringContaining('no text') });
    expect(checkLines(Array(61).fill('- A line'), 'responsibilities', s, job('job-comms'))).toEqual({ refused: expect.stringContaining('not usable text') });
    expect(checkLines(['x'.repeat(2001)], 'responsibilities', s, job('job-comms'))).toEqual({ refused: expect.stringContaining('not usable text') });
  });

  it('refuses pay and contacts that were not given, and accepts the ones that were', () => {
    setFacts('job-comms', { salaryMode: 'exact', salaryMin: '2,500', currency: 'USD', period: 'month' });
    const s = getState();
    const j = job('job-comms');
    expect(checkLines(['Salary: USD 2500 a month.'], 'offer', s, j)).toEqual({ lines: ['Salary: USD 2500 a month.'] });
    expect(checkLines(['Salary: USD 3,000 a month.'], 'offer', s, j)).toEqual({ refused: expect.stringContaining('pay that was not given (USD 3,000') });
    expect(checkLines(['A stipend of $400 a month.'], 'offer', s, j)).toEqual({ refused: expect.stringContaining('pay that was not given') });
    expect(checkLines(['Questions to hr@made-up.example.'], 'purpose', s, j)).toEqual({ refused: expect.stringContaining('a contact that was not given (hr@made-up.example') });
    expect(checkLines(['See https://riverstone.example.org/careers for more.'], 'purpose', s, j)).toEqual({ lines: ['See https://riverstone.example.org/careers for more.'] });
  });
});

describe('the AI chat: the demo carries out the actions', () => {
  it('chooses the template, then the style and the pace; nothing is written before them; the AI replies take the place of the rules\' own', () => {
    resetAi('on');
    const id = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    applyAiTurn(id, 'Yes', { reply: 'Done. Warm and plain, as usual?', actions: [{ type: 'use_template', template: job(id).format }] }, open);
    expect(job(id).setup).toBe('style');
    expect(job(id).chat.slice(-2)).toEqual([expect.objectContaining({ from: 'user', text: 'Yes' }), expect.objectContaining({ from: 'ai', text: 'Done. Warm and plain, as usual?', ai: true, step: 'setup:style' })]);
    expect(job(id).chat.some((m) => m.text.includes('How should it sound?'))).toBe(false);
    const keys = job(id).tags.filter((k) => k !== 'about' && k !== 'apply');
    applyAiTurn(id, 'warm', { reply: 'Warm it is. One section at a time, or all of it first?', actions: [{ type: 'write_section', section: keys[0], lines: ['Too early'] }, { type: 'set_style', style: ['warm'] }] }, open);
    expect(job(id)).toMatchObject({ setup: 'pace', style: ['Warm'], sections: [] });
    expect(lastAi(id)?.text).toContain('Not done: The role: written before the template and style are chosen');
    applyAiTurn(id, 'one at a time', { reply: 'One at a time.', actions: [{ type: 'set_pace', pace: 'step' }] }, open);
    expect(job(id).setup).toBeUndefined();
    expect(job(id).walk?.pace).toBe('step');
    expect(getState().pace).toBe('step');
    expect(job(id).sections.map((x) => x.key)).toEqual(['about', 'apply']);
    expect(nextStep(job(id), getState())).toEqual({ kind: 'ask', fact: 'contract', section: 'about' });
  });

  it('a template applied without a question: the rules give the overview and ask the style, and ask again after a reply that leaves it unasked', () => {
    const id = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    applyAiTurn(id, 'Yes', { reply: "I'll use your format.", actions: [{ type: 'use_template', template: job(id).format }] }, open);
    expect(job(id).chat.at(-1)).toMatchObject({ step: 'setup:style', text: expect.stringContaining('How should it sound?') });
    applyAiTurn(id, 'hm', { reply: 'Take your time.', actions: [] }, open);
    expect(job(id).chat.filter((m) => m.step === 'setup:style' && !m.ai)).toHaveLength(2);
  });

  it('answers each question, approves a section, and writes the next in the same answer; text it wrote keeps its words when facts change', () => {
    resetAi('on');
    const id = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    applyAiTurn(id, 'Yes', { reply: 'Done.', actions: [{ type: 'use_template', template: job(id).format }, { type: 'set_style', style: ['Warm'] }, { type: 'set_pace', pace: 'step' }] }, open);
    applyAiTurn(id, 'fixed-term, and there is no grade', { reply: 'Got it. About us comes from your profile: good as it is?', actions: [{ type: 'set_facts', facts: { contract: 'fixed-term' } }, { type: 'settle', fact: 'grade' }] }, open);
    expect(nextStep(job(id), getState())).toEqual({ kind: 'approve', section: 'about' });
    expect(lastAi(id)?.step).toBe('approve:about');
    applyAiTurn(id, 'yes', { reply: 'Here is The role. Good, or change something?', actions: [{ type: 'approve_section', section: 'about' }, { type: 'write_section', section: 'purpose', lines: ['The post holder runs nutrition screening in Juba.'] }] }, open);
    expect(job(id).walk?.approved).toEqual(['about']);
    expect(job(id).sections.find((x) => x.key === 'purpose')).toMatchObject({ lines: ['The post holder runs nutrition screening in Juba.'], ai: true });
    expect(nextStep(job(id), getState())).toEqual({ kind: 'approve', section: 'purpose' });
    applyAiTurn(id, 'good', { reply: 'Next.', actions: [{ type: 'approve_section', section: 'responsibilities' }, { type: 'approve_section', section: 'purpose' }] }, open);
    expect(job(id).walk?.approved).toEqual(['about', 'purpose']);
    expect(lastAi(id)?.text).toContain('Not done: approving What you will do: it is not written yet');
    setFacts(id, { deadline: addDays(getState().today, 30) });
    expect(job(id).sections.find((x) => x.key === 'purpose')?.lines).toEqual(['The post holder runs nutrition screening in Juba.']);
  });

  it('refuses settling a fact that needs a value, an address nobody gave, and wording kept without a reason', () => {
    resetAi('on');
    const id = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    applyAiTurn(id, 'Yes', { reply: 'Done.', actions: [{ type: 'use_template', template: job(id).format }, { type: 'set_style', style: ['Warm'] }, { type: 'set_pace', pace: 'all' }] }, open);
    applyAiTurn(id, 'x', { reply: 'Hm.', actions: [{ type: 'settle', fact: 'deadline' }, { type: 'set_apply', method: 'email', address: 'hr@invented.example' }, { type: 'accept_point', point: 'nope', reason: 'ok' }, { type: 'set_pace', pace: 'sometimes' }] }, open);
    expect(job(id).walk?.settled).toEqual([]);
    expect(job(id).apply.method).not.toBe('email');
    expect(lastAi(id)?.text).toMatch(/Not done: an application address that was not given; settling "deadline"; the pace\.$/);
    applyAiTurn(id, 'by email to jobs@riverstone.example.org', { reply: 'Done.', actions: [{ type: 'set_apply', method: 'email', address: 'jobs@riverstone.example.org' }] }, open);
    expect(job(id).apply).toMatchObject({ method: 'email', address: 'jobs@riverstone.example.org' });
    expect(job(id).walk?.settled).toContain('method');
  });

  it('refuses unknown and unsafe actions, changes nothing for them, and says what was not done', () => {
    const before = job('job-comms');
    applyAiTurn(
      'job-comms',
      'do things',
      {
        reply: 'All done.',
        actions: [{ type: 'publish_now' }, 'junk', { type: 'use_template', template: 'nope' }, { type: 'write_section', section: 'apply', lines: ['x'] }, { type: 'remove_section', section: 'nope' }, { type: 'set_facts', facts: { deadline: '2001-01-01' } }, { type: 'open', target: 'billing' }],
      },
      open,
    );
    const after = job('job-comms');
    expect([after.sections, after.facts, after.format, after.tags]).toEqual([before.sections, before.facts, before.format, before.tags]);
    expect(open).not.toHaveBeenCalled();
    expect(lastAi('job-comms')?.text).toMatch(/^All done\.\n\nNot done: an action the demo does not have \("publish_now"\); the closing date; a template the demo does not have\.$/);
    expect(after.chat.at(-1)).toMatchObject({ text: 'When do applications close?', ask: 'deadline' });
    expect(after.chat.at(-1)?.ai).toBeUndefined();
  });

  it("a reply that asks a question of its own is not followed by the rules' question", () => {
    applyAiTurn('job-comms', 'hm', { reply: 'Shall I also add a closing date?', actions: [] }, open);
    expect(job('job-comms').chat.at(-1)).toMatchObject({ text: 'Shall I also add a closing date?', ai: true });
  });

  it('shows a picker only for a fact still missing, and opens one thing at most', () => {
    const id = startJob('We are hiring a Nutrition Officer');
    applyAiTurn(id, 'next?', { reply: 'Where is it based?', actions: [{ type: 'ask', fact: 'place', quick: ['Juba', 'Remote', 'x'.repeat(61)] }, { type: 'open', target: 'details' }, { type: 'open', target: 'preview' }] }, open);
    expect(job(id).chat.at(-1)).toMatchObject({ text: 'Where is it based?', ask: 'place', quick: ['Juba', 'Remote'], ai: true });
    expect(open.mock.calls).toEqual([['details']]);
    applyAiTurn(id, 'and?', { reply: 'And the title?', actions: [{ type: 'ask', fact: 'title' }] }, open);
    expect(job(id).chat.find((m) => m.text === 'And the title?')?.ask).toBeUndefined();
  });

  it('renames, adds, removes, and reorders sections; a renamed heading stays when the rules rewrite the section; undo puts the text back', () => {
    const tags = job('job-comms').tags;
    applyAiTurn('job-comms', 'rename', { reply: 'Renamed.', actions: [{ type: 'rename_section', section: 'responsibilities', heading: 'What you will do' }, { type: 'add_section', section: 'firstweeks' }] }, open);
    expect(job('job-comms').sections.find((x) => x.key === 'responsibilities')?.title).toBe('What you will do');
    expect(job('job-comms').tags).toContain('firstweeks');
    setFacts('job-comms', { duration: '9 months' });
    expect(job('job-comms').sections.find((x) => x.key === 'responsibilities')?.title).toBe('What you will do');
    const removable = tags.find((k) => k !== 'responsibilities' && k !== 'apply')!;
    applyAiTurn('job-comms', 'remove', { reply: 'Removed.', actions: [{ type: 'remove_section', section: removable }] }, open);
    expect(job('job-comms').tags).not.toContain(removable);
    const before = job('job-comms').sections.find((x) => x.key === 'responsibilities')?.lines;
    applyAiTurn('job-comms', 'rewrite', { reply: 'Rewritten.', actions: [{ type: 'write_section', section: 'responsibilities', lines: ['- New duty'] }] }, open);
    expect(job('job-comms').sections.find((x) => x.key === 'responsibilities')?.lines).toEqual(['- New duty']);
    applyAiTurn('job-comms', 'undo', { reply: 'Undone.', actions: [{ type: 'undo' }] }, open);
    expect(job('job-comms').sections.find((x) => x.key === 'responsibilities')?.lines).toEqual(before);
  });
});

describe('the AI chat: one message through the route, and the fallback', () => {
  it('sends nothing while the AI is off or not yet known', async () => {
    const f = answer(200, { reply: 'x', actions: [] });
    for (const status of ['off', 'unknown'] as const) {
      resetAi(status);
      expect(await askAi('job-comms', 'hi', { open })).toBeNull();
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('sends the message with the job and the part in view to its own route only, and applies the answer', async () => {
    resetAi('on');
    const f = answer(200, { reply: 'Shortened.', actions: [{ type: 'write_section', section: 'responsibilities', lines: ['- One', '- Two'] }] });
    const done = await askAi('job-comms', 'make it shorter', { focus: 'responsibilities', open });
    expect(done?.refused).toEqual([]);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(AI_ROUTE);
    const sent = JSON.parse(init?.body ?? '{}');
    expect(sent).toMatchObject({ message: 'make it shorter', first: false, context: { stage: 'writing', job: { inView: 'responsibilities', template: { key: 'house' } } } });
    expect(sent.context.job.sections.find((x: { key: string }) => x.key === 'apply')).toMatchObject({ fixed: true });
    expect(job('job-comms').sections.find((x) => x.key === 'responsibilities')).toMatchObject({ lines: ['- One', '- Two'], ai: true });
    expect(lastAi('job-comms')).toMatchObject({ text: 'Shortened.', ai: true });
  });

  it('without keys the route says the AI is off: it stays off, and the caller answers with the rules', async () => {
    resetAi('on');
    answer(503, { error: 'off' });
    const chat = job('job-comms').chat.length;
    expect(await askAi('job-comms', 'hello', { open })).toBeNull();
    expect(aiOn()).toBe(false);
    expect(job('job-comms').chat).toHaveLength(chat);
  });

  it('a failed, unreadable, or lost answer leaves the job as it was, says so quietly, and keeps the AI on for the next message', async () => {
    const before = job('job-comms');
    for (const f of [() => answer(502, { error: 'failed' }), () => answer(200, { nonsense: true }), () => stubFetch(async () => Promise.reject(new Error('offline')))]) {
      resetAi('on');
      f();
      expect(await askAi('job-comms', 'hello', { open })).toBeNull();
      expect(aiOn()).toBe(true);
      expect(job('job-comms')).toBe(before);
    }
    expect(aiState().fallback['job-comms']).toBe("The AI could not answer just now, so the demo's own rules did.");
    expect(aiState().pending).toEqual({});
  });

  it('sends the model chosen in the demo, for this visit only, and labels the reply with the model that answered', async () => {
    resetAi('on', [{ key: 'terra', label: 'GPT-6.1 Terra' }, { key: 'sonnet', label: 'Claude Sonnet 5.5' }]);
    chooseAiModel('gpt-99');
    expect(aiState().model).toBe('terra');
    chooseAiModel('sonnet');
    expect(aiState().model).toBe('sonnet');
    expect(localStorage.getItem('aidjobs.employerDemo.aiModel')).toBeNull();
    const f = answer(200, { reply: 'Hello.', actions: [], model: 'sonnet' });
    await askAi('job-comms', 'hi', { open });
    expect(JSON.parse(f.mock.calls[0][1]?.body ?? '{}').model).toBe('sonnet');
    expect(lastAi('job-comms')).toMatchObject({ text: 'Hello.', by: 'Claude Sonnet 5.5' });
  });

  it("every visit starts on the route's default, and a choice an earlier version saved is forgotten", async () => {
    localStorage.setItem('aidjobs.employerDemo.aiModel', 'sonnet');
    answer(200, { ai: true, models: [{ key: 'terra', label: 'GPT-6.1 Terra' }, { key: 'sonnet', label: 'Claude Sonnet 5.5' }], default: 'terra', provider: 'OpenRouter, with zero data retention' });
    expect(await probeAi()).toBe(true);
    expect(aiState()).toMatchObject({ model: 'terra', provider: 'OpenRouter, with zero data retention' });
    expect(localStorage.getItem('aidjobs.employerDemo.aiModel')).toBeNull();
  });

  it('one message at a time per job', async () => {
    resetAi('on');
    let release: (v: unknown) => void = () => {};
    stubFetch(() => new Promise((r) => (release = r)));
    const first = askAi('job-comms', 'one', { open });
    expect(await askAi('job-comms', 'two', { open })).toBeNull();
    release({ ok: true, status: 200, json: async () => ({ reply: 'One done.', actions: [] }) });
    expect((await first)?.refused).toEqual([]);
    expect(lastAi('job-comms')?.text).toBe('One done.');
  });
});
