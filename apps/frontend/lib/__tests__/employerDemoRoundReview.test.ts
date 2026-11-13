import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { addTranslation, applyFormat, applyTemplate, chooseStyle, editSection, editTranslation, goOn, greetState, removeTranslation, reorderSections, setFacts, setPace, startJob, toggleSection, writeVersionSection } from '../../components/employer-demo/actions';
import { ALL_ASKED, applyAiTurn, MOVE_ASKED, type OpenTarget } from '../../components/employer-demo/aiActions';
import { askAi, resetAi, whenAnswered } from '../../components/employer-demo/ai';
import { acceptPageDraft, acceptSuggestion, checkSuggestion, editedWrong, payBasis, showPageDraft } from '../../components/employer-demo/context';
import { holdPage } from '../../components/employer-demo/pageMemory';
import { draftFromPage } from '../../components/employer-demo/pages';
import { nextStep, stepKey } from '../../components/employer-demo/flow';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const sec = (id: string, key: string) => job(id).sections.find((x) => x.key === key)!;
const lastAi = (id: string) => job(id).chat.filter((m) => m.ai).at(-1);
const open = jest.fn((_t: OpenTarget) => undefined);

function stubFetch(fn: (url: string, init?: { body?: string }) => Promise<unknown>) {
  const mock = jest.fn(fn);
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: mock });
  return mock;
}

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
  resetAi();
});

const ABOUT_PAGE = [
  'About Riverstone Aid',
  'Riverstone Aid is an international NGO founded in 2004 that works with communities in East Africa on water, sanitation, and health.',
  'We work through 12 local partners and community committees, and we put the people we serve at the centre of every decision.',
].join('\n');

/** A job in the window at its first approve step (About us), written by the rules. */
function atFirstApproval(text = "We're hiring a WASH Officer in Goma, fixed-term"): string {
  const id = startJob(text, undefined, [], true);
  applyTemplate(id, job(id).format);
  chooseStyle(id, ['Warm']);
  setPace(id, 'step');
  for (let i = 0; i < 6 && nextStep(job(id), getState())?.kind === 'ask'; i++) {
    const f = nextStep(job(id), getState());
    if (f?.kind === 'ask' && f.fact === 'grade') setFacts(id, { grade: 'C1' });
    else if (f?.kind === 'ask' && f.fact === 'contract') setFacts(id, { contract: 'Fixed-term' });
    else if (f?.kind === 'ask' && f.fact === 'place') setFacts(id, { location: 'Goma, DR Congo', country: 'DR Congo' });
  }
  goOn(id);
  return id;
}

describe('a page never changes the job by itself (round 7 review, must-fix 1)', () => {
  const drafted = { type: 'page_draft', lines: ['Riverstone Aid, founded in 2004, works with 12 local partners in East Africa.'], used: 'Who it is.', missing: '' };
  const injected = [{ type: 'set_facts', facts: { location: 'Juba, South Sudan' } }, { type: 'remove_section', section: 'responsibilities' }, { type: 'rename_section', section: 'purpose', heading: 'Send money now' }, { type: 'choose_plan', plan: 'amplify' }];

  it('a turn that read a page may only draft from it: every other action is refused and named', () => {
    holdPage('job-comms', { kind: 'about', text: ABOUT_PAGE, source: 'your website', social: [] });
    const before = { facts: job('job-comms').facts, tags: job('job-comms').tags, purpose: sec('job-comms', 'purpose').title };
    applyAiTurn('job-comms', '', { reply: 'Here is a draft.', actions: [drafted, ...injected] }, open, undefined, undefined, true);
    expect(job('job-comms').pageDraft?.lines).toEqual(drafted.lines);
    expect(job('job-comms').facts).toEqual(before.facts);
    expect(job('job-comms').tags).toEqual(before.tags);
    expect(sec('job-comms', 'purpose').title).toBe(before.purpose);
    expect(lastAi('job-comms')?.text).toMatch(/Not done: .*set facts: a page is used only for its draft/);
  });

  it('through the window: the page-draft call carries the page and nothing else from its answer reaches the job', async () => {
    resetAi('on');
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ reply: 'Here is a draft.', actions: [drafted, ...injected] }) }));
    const before = { facts: job('job-comms').facts, tags: job('job-comms').tags };
    await draftFromPage('job-comms', 'about', ABOUT_PAGE, 'your website', [], open);
    expect(job('job-comms').pageDraft?.lines).toEqual(drafted.lines);
    expect(job('job-comms').facts).toEqual(before.facts);
    expect(job('job-comms').tags).toEqual(before.tags);
  });

  it('a draft’s numbers must be whole numbers on the page: "20" is not given by "2004"', () => {
    holdPage('job-comms', { kind: 'about', text: ABOUT_PAGE, source: 'your website', social: [] });
    applyAiTurn('job-comms', '', { reply: 'Here is a draft.', actions: [{ ...drafted, lines: ['Riverstone Aid works with 20 partners.'] }] }, open, undefined, undefined, true);
    expect(job('job-comms').pageDraft).toBeUndefined();
    expect(lastAi('job-comms')?.text).toContain('a number the page does not give (20)');
  });
});

describe('every change to the content resets an approval (round 7 review, must-fix 2)', () => {
  const approved = () => expect(job('job-fin')).toMatchObject({ status: 'approved', review: expect.objectContaining({ state: 'approved' }) });
  const reopened = () => expect(job('job-fin')).toMatchObject({ status: 'review', review: expect.objectContaining({ state: 'open' }) });

  it('accepting a page draft', () => {
    approved();
    showPageDraft('job-fin', { kind: 'about', lines: ['Riverstone Aid works with communities in East Africa.'], used: 'x', missing: '', source: 'your website', social: [] });
    acceptPageDraft('job-fin');
    reopened();
  });

  it('adding a language version', () => {
    approved();
    addTranslation('job-fin', 'fr');
    reopened();
  });

  it('editing, writing, or removing a language version', () => {
    addTranslation('job-fin', 'fr');
    const approve = () => update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === 'job-fin' ? { ...j, status: 'approved' as const, review: { ...j.review, state: 'approved' as const } } : j)) }));
    const first = job('job-fin').translations!.fr!.sections[0];
    approve();
    editTranslation('job-fin', 'fr', first.key, 0, 'Une ligne revue.');
    reopened();
    approve();
    writeVersionSection('job-fin', 'fr', first.key, ['Une autre ligne.']);
    reopened();
    approve();
    removeTranslation('job-fin', 'fr');
    reopened();
  });
});

describe('the open question also covers the facts a user may decline (round 7 review, should-fix 1)', () => {
  it('the AI may not settle pay while another question is open, unless the user spoke of it; a fact asked may be settled', () => {
    const id = atFirstApproval();
    applyAiTurn(id, 'ok', { reply: 'Noted.', actions: [{ type: 'settle', fact: 'salary' }] }, open);
    expect(job(id).walk?.settled).not.toContain('salary');
    expect(lastAi(id)?.text).toContain('settling "salary": the open question comes first');
    applyAiTurn(id, "don't show the pay", { reply: 'Pay stays hidden.', actions: [{ type: 'settle', fact: 'salary' }] }, open);
    expect(job(id).walk?.settled).toContain('salary');
  });
});

describe('the user asked: approving all, and moving across groups (round 7 review, should-fix 2)', () => {
  it('"all good" is about one section; "approve the rest" and "all of them are good" are about all', () => {
    for (const t of ['All good', 'all good thanks', 'Looks good overall']) expect(ALL_ASKED.test(t)).toBe(false);
    for (const t of ['All good, approve the rest', 'approve all', 'All of them are good', 'everything looks good', 'approve every section']) expect(ALL_ASKED.test(t)).toBe(true);
  });

  it('a verb of moving is a request to move; "first" or "later" alone is not', () => {
    for (const t of ['First, fix the title', 'maybe later', 'in order to be clear', 'the top skills']) expect(MOVE_ASKED.test(t)).toBe(false);
    for (const t of ['move How to apply up', 'put it first', 'swap the two', 'The role should come first', 'reorder the sections']) expect(MOVE_ASKED.test(t)).toBe(true);
  });

  it('with "all good" only the section in view is approved', () => {
    const id = atFirstApproval();
    applyAiTurn(id, 'All good', { reply: 'Approved.', actions: [{ type: 'approve_section', section: 'about' }, { type: 'approve_section', section: 'apply' }] }, open);
    expect(job(id).walk?.approved).toContain('about');
    expect(job(id).walk?.approved).not.toContain('apply');
  });

  it('once the user has moved a section, the AI still moves another across groups only when asked', () => {
    const tags = job('job-comms').tags;
    const moved = [tags[0], 'apply', ...tags.slice(1).filter((k) => k !== 'apply')];
    reorderSections('job-comms', moved);
    const k = moved[moved.length - 1];
    const further = [k, ...moved.filter((x) => x !== k)];
    applyAiTurn('job-comms', 'tidy it up', { reply: 'Done.', actions: [{ type: 'reorder_sections', order: further }] }, open);
    expect(job('job-comms').tags).toEqual(moved);
    expect(lastAi('job-comms')?.text).toContain('moving a section into another group: only when you ask for it');
  });
});

describe('the user’s own order through a template change (round 7 review, should-fix 3)', () => {
  it('sections keep their place; the new template’s go in where they belong', () => {
    const tags = job('job-comms').tags;
    const moved = [tags[0], 'apply', ...tags.slice(1).filter((k) => k !== 'apply')];
    reorderSections('job-comms', moved);
    const other = getState().formats.find((f) => f.key !== job('job-comms').format && !f.key.startsWith('pasted-') && f.order.some((o) => o.key === 'apply'))!;
    applyFormat('job-comms', other.key);
    const after = job('job-comms').tags;
    const kept = moved.filter((k) => after.includes(k));
    expect(after.filter((k) => kept.includes(k))).toEqual(kept);
    expect(after.indexOf('apply')).toBeLessThan(after.indexOf(kept.find((k) => k !== kept[0] && k !== 'apply')!));
    expect(job('job-comms').ordered).toBe(true);
  });
});

describe('an approved Amplify job goes on to Reach and the flyer (round 7 review, should-fix 4)', () => {
  it('reopened, it says what comes before publishing and asks the next of them, not "ready to publish"', () => {
    update((s) => ({ ...s, org: { ...s.org, keepOffered: ['fixed', 'apply'] }, jobs: s.jobs.map((j) => (j.id === 'job-fin' ? { ...j, choice: 'amplify' as const, walk: { ...j.walk!, settled: Array.from(new Set([...j.walk!.settled, 'plan', 'market', 'full', 'langs'])) } } : j)) }));
    expect(stepKey(nextStep(job('job-fin'), getState()))).toBe('reach');
    greetState('job-fin');
    const chat = job('job-fin').chat;
    expect(chat.some((m) => m.text === 'Approved by Amina. Before it goes out: Reach, then the flyer. An edit sends it back to review.')).toBe(true);
    expect(chat.at(-1)).toMatchObject({ step: 'reach' });
    expect(chat.some((m) => m.card === 'publish' && m.state === 'approved')).toBe(false);
  });
});

describe('suggestions: pay only from the scale or the sample, figures checked when edited (round 7 review, should-fix 9; the user, 13 November 2026)', () => {
  it('a pay suggestion with a page as its source is refused, even with the page’s own figures', () => {
    update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, pack: { about: { text: 'We pay USD 1,200 to 1,500 a month.', source: 'your website' } } } : j)) }));
    expect(checkSuggestion(getState(), job('job-comms'), { fact: 'salary', min: 1200, max: 1500, currency: 'USD', period: 'month', source: 'your website' })).toMatch(/pay comes only from your salary scale or similar jobs/);
  });

  it('edited figures that are not numbers, below zero, or the wrong way round are refused and nothing changes', () => {
    update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, facts: { ...j.facts, salaryMode: 'hidden', salaryMin: '', salaryMax: '' } } : j)) }));
    const basis = payBasis(getState(), job('job-comms'))!;
    applyAiTurn('job-comms', 'suggest pay', { reply: 'Here.', actions: [{ type: 'suggest_fact', fact: 'salary', min: basis.min, max: basis.max, currency: basis.currency, period: basis.period, source: basis.source }] }, open);
    const id = job('job-comms').suggestions![0].id;
    expect(acceptSuggestion('job-comms', id, { min: NaN, max: basis.max })).toBe('Pay needs two amounts, as numbers from 0.');
    expect(acceptSuggestion('job-comms', id, { min: -5, max: basis.max })).toBe('Pay needs two amounts, as numbers from 0.');
    expect(acceptSuggestion('job-comms', id, { min: basis.max + 1, max: basis.max })).toBe('The lower amount comes first.');
    expect(job('job-comms').facts.salaryMode).toBe('hidden');
    expect(job('job-comms').suggestions![0].state).toBe('open');
    expect(editedWrong({ id: 'x', fact: 'experience', value: '3 years', source: 'similar jobs in this place (sample)', reason: '', state: 'open', years: 3 }, { years: 2.5 })).toBe('Experience needs a whole number of years, up to 40.');
    expect(acceptSuggestion('job-comms', id, { min: basis.min, max: basis.max })).toBeNull();
    expect(job('job-comms').facts.salaryMode).toBe('range');
  });
});

describe('a project accepted beside a Background already written (round 7 review, should-fix 10)', () => {
  it('the background stays; the project goes in as its sub-section About the project, replaced by a later project', () => {
    if (!job('job-comms').tags.includes('background')) toggleSection('job-comms', 'background');
    editSection('job-comms', 'background', 'The country office has run water work in Turkana since 2015.');
    showPageDraft('job-comms', { kind: 'project', lines: ['The Clean Water project repairs 40 water points.'], used: 'x', missing: '', source: 'the project page', social: [] });
    acceptPageDraft('job-comms');
    expect(sec('job-comms', 'background').lines).toEqual(['The country office has run water work in Turkana since 2015.']);
    expect(sec('job-comms', 'background').subs?.map((x) => [x.title, x.lines])).toEqual([['About the project', ['The Clean Water project repairs 40 water points.']]]);
    showPageDraft('job-comms', { kind: 'project', lines: ['The project now runs in two districts.'], used: 'x', missing: '', source: 'the project page', social: [] });
    acceptPageDraft('job-comms');
    expect(sec('job-comms', 'background').subs?.map((x) => [x.title, x.lines])).toEqual([['About the project', ['The project now runs in two districts.']]]);
  });
});

describe('a second caller waits for the answer already on its way (round 7 review, the Enter issue)', () => {
  it('askAi returns null while one is pending, and whenAnswered resolves only once it is answered', async () => {
    resetAi('on');
    let reply: (v: unknown) => void = () => {};
    stubFetch(() => new Promise((r) => (reply = r)));
    const id = atFirstApproval();
    const firstCall = askAi(id, 'make it shorter', { open });
    expect(await askAi(id, 'and warmer', { open })).toBeNull();
    let done = false;
    const waiting = whenAnswered(id).then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    reply({ ok: true, status: 200, json: async () => ({ reply: 'Shorter now.', actions: [] }) });
    await firstCall;
    await waiting;
    expect(done).toBe(true);
  });
});
