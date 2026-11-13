import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { addTranslation, applyTemplate, approveSection, changeSub, chooseStyle, createFormat, editSection, reorderSections, setFacts, setPace, startJob, toggleSection, writeSections } from '../../components/employer-demo/actions';
import { applyAiTurn, checkLines, type OpenTarget } from '../../components/employer-demo/aiActions';
import { contextFor, resetAi } from '../../components/employer-demo/ai';
import { acceptPageDraft, acceptSuggestion, checkSuggestion, extractDraft, payBasis, rejectPageDraft, rejectSuggestion, saveAboutForOrg, surveyCard, yearsBasis } from '../../components/employer-demo/context';
import { holdPage, pageFor } from '../../components/employer-demo/pageMemory';
import { draftFromPage } from '../../components/employer-demo/pages';
import { basicAdvertCheck } from '../../components/employer-demo/market';
import { outlineOrder, titleSuggestions } from '../../components/employer-demo/engine';
import { FIXED_SECTIONS, nextStep } from '../../components/employer-demo/flow';
import { getState, normalise, resetDemo, STORAGE_KEY, update } from '../../components/employer-demo/store';
import { draftProblems } from '../employerDemoAi/quality';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const sec = (id: string, key: string) => job(id).sections.find((x) => x.key === key)!;
const open = jest.fn((_t: OpenTarget) => undefined);

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
});

describe('the outline: About us, headings, sub-sections, and moving sections (section 19, phase 5, B)', () => {
  it('About us is a normal section: edited by hand and kept when facts change; only How to apply stays fixed', () => {
    expect(FIXED_SECTIONS).toEqual(['apply']);
    editSection('job-comms', 'about', 'Our own words about Riverstone Aid.');
    setFacts('job-comms', { location: 'Gulu, Uganda' });
    expect(sec('job-comms', 'about')).toMatchObject({ lines: ['Our own words about Riverstone Aid.'], edited: true });
  });

  it('a language version translates the job’s own About us, and uses the organisation’s only when the job has none', () => {
    editSection('job-comms', 'about', 'Our own words about Riverstone Aid.');
    addTranslation('job-comms', 'fr');
    expect(job('job-comms').translations?.fr?.sections.find((x) => x.key === 'about')?.lines).toEqual(['Our own words about Riverstone Aid.']);
    toggleSection('job-health', 'about');
    expect(job('job-health').sections.some((x) => x.key === 'about')).toBe(false);
    addTranslation('job-health', 'fr');
    const about = job('job-health').translations?.fr?.sections.find((x) => x.key === 'about');
    expect(about?.title).toBe('À propos de nous');
    expect(about?.lines[0]).toBeTruthy();
    expect(about?.lines[0]).not.toBe(getState().org.about);
  });

  it('two or three other titles for a section, never the one in use; one applies only when chosen and saved', () => {
    const current = sec('job-comms', 'responsibilities').title;
    const others = titleSuggestions(getState().formats, 'responsibilities', current);
    expect(others.length).toBeGreaterThanOrEqual(2);
    expect(others.length).toBeLessThanOrEqual(3);
    expect(others.map((t) => t.toLowerCase())).not.toContain(current.toLowerCase());
    expect(sec('job-comms', 'responsibilities').title).toBe(current);
    editSection('job-comms', 'responsibilities', sec('job-comms', 'responsibilities').lines.join('\n'), false, { title: others[0] });
    expect(sec('job-comms', 'responsibilities').title).toBe(others[0]);
    expect(job('job-comms').renamed?.responsibilities).toBe(others[0]);
  });

  it('a sub-section: added, written, renamed, moved within its section, and removed; kept when the rules rebuild the section, and checked with it', () => {
    const k = 'responsibilities';
    changeSub('job-comms', k, { add: 'Field visits' });
    changeSub('job-comms', k, { add: 'Reporting' });
    expect(sec('job-comms', k).subs?.map((x) => [x.title, x.lines])).toEqual([
      ['Field visits', ['[Field visits]']],
      ['Reporting', ['[Reporting]']],
    ]);
    expect(basicAdvertCheck(job('job-comms'), getState()).some((p) => !p.ok && p.section === k)).toBe(true);
    const [visits, reporting] = sec('job-comms', k).subs!;
    changeSub('job-comms', k, { write: visits.id, lines: ['- Visit two partner sites each month'] });
    changeSub('job-comms', k, { remove: reporting.id });
    setFacts('job-comms', { location: 'Gulu, Uganda' });
    expect(sec('job-comms', k).edited).toBeFalsy();
    expect(sec('job-comms', k).subs).toEqual([{ id: visits.id, title: 'Field visits', lines: ['- Visit two partner sites each month'] }]);
    changeSub('job-comms', k, { add: 'Budget' });
    changeSub('job-comms', k, { rename: visits.id, title: 'Site visits' });
    const budget = sec('job-comms', k).subs!.find((x) => x.title === 'Budget')!;
    changeSub('job-comms', k, { move: budget.id, by: -1 });
    expect(sec('job-comms', k).subs?.map((x) => x.title)).toEqual(['Budget', 'Site visits']);
  });

  it('a template the organisation saves keeps its sub-sections, and a job written from it starts its sections with them', () => {
    const key = createFormat('Field roles', [
      { key: 'about', heading: 'About us' },
      { key: 'purpose', heading: 'The role' },
      { key: 'responsibilities', heading: 'What you will do', subs: [{ id: 'sub-a', heading: 'In the field' }, { id: 'sub-b', heading: 'In the office' }] },
      { key: 'apply', heading: 'How to apply' },
    ], 'warm');
    expect(getState().formats.find((f) => f.key === key)?.order[2].subs?.map((x) => x.heading)).toEqual(['In the field', 'In the office']);
    const id = startJob("We're hiring a WASH Officer in Goma, fixed-term", undefined, [], true);
    applyTemplate(id, key);
    chooseStyle(id, ['Warm']);
    setPace(id, 'all');
    expect(sec(id, 'responsibilities').subs?.map((x) => [x.title, x.lines])).toEqual([
      ['In the field', ['[In the field]']],
      ['In the office', ['[In the office]']],
    ]);
  });

  it('a section moved across groups keeps its place through a reload; one added without a place goes in at its group', () => {
    const tags = job('job-comms').tags;
    const moved = [tags[0], 'apply', ...tags.slice(1).filter((k) => k !== 'apply')];
    reorderSections('job-comms', moved);
    expect(job('job-comms')).toMatchObject({ tags: moved, ordered: true });
    expect(job('job-comms').sections.map((x) => x.key)).toEqual(moved);
    const reloaded = normalise({ ...getState() }).jobs.find((j) => j.id === 'job-comms')!;
    expect(reloaded.tags).toEqual(moved);
    expect(reloaded.sections.map((x) => x.key)).toEqual(moved);
    const extra = ['languages', 'competencies'].find((k) => !moved.includes(k))!;
    toggleSection('job-comms', extra);
    const after = job('job-comms').tags;
    expect(after[1]).toBe('apply');
    expect(after.indexOf(extra)).toBeGreaterThan(after.indexOf('requirements') === -1 ? 0 : after.indexOf('requirements') - 1);
    expect(outlineOrder(after)).not.toEqual(after);
  });

  it('a job that follows the group order still does after a reload', () => {
    const before = job('job-comms').tags;
    expect(job('job-comms').ordered).toBeUndefined();
    expect(normalise({ ...getState() }).jobs.find((j) => j.id === 'job-comms')?.tags).toEqual(outlineOrder(before));
  });

  it('the AI moves a section into another group only when the user asked; within its group it may reorder', () => {
    const tags = job('job-comms').tags;
    const moved = [tags[0], 'apply', ...tags.slice(1).filter((k) => k !== 'apply')];
    applyAiTurn('job-comms', 'tidy it up', { reply: 'Done.', actions: [{ type: 'reorder_sections', order: moved }] }, open);
    expect(job('job-comms').tags).toEqual(tags);
    expect(job('job-comms').chat.filter((m) => m.ai).at(-1)?.text).toContain('Not done: moving a section into another group: only when you ask for it');
    applyAiTurn('job-comms', 'move How to apply up, right after About us', { reply: 'Moved.', actions: [{ type: 'reorder_sections', order: moved }] }, open);
    expect(job('job-comms').tags).toEqual(moved);
  });

  it('the AI adds and writes a sub-section only inside a written section, under the same checks as any text (kept here)', () => {
    applyAiTurn('job-comms', 'add a sub-section on reporting', { reply: 'Added.', actions: [{ type: 'sub', section: 'responsibilities', op: 'add', heading: 'Reporting' }] }, open);
    const sub = sec('job-comms', 'responsibilities').subs?.[0];
    expect(sub?.title).toBe('Reporting');
    applyAiTurn('job-comms', 'write it', { reply: 'Written.', actions: [{ type: 'sub', section: 'responsibilities', op: 'write', sub: 'Reporting', lines: ['- Salary: USD 9,000 a month'] }] }, open);
    expect(job('job-comms').chat.filter((m) => m.ai).at(-1)?.text).toMatch(/it named pay that was not given/);
    applyAiTurn('job-comms', 'write it', { reply: 'Written.', actions: [{ type: 'sub', section: 'responsibilities', op: 'write', sub: 'Reporting', lines: ['- Send a short report to your manager each month'] }] }, open);
    expect(sec('job-comms', 'responsibilities').subs?.[0].lines).toEqual(['- Send a short report to your manager each month']);
  });
});

const ABOUT_PAGE = [
  'About Riverstone Aid',
  'Riverstone Aid is an international NGO founded in 2004 that works with communities in East Africa on water, sanitation, and health.',
  'We work through 12 local partners and community committees, and we put the people we serve at the centre of every decision.',
].join('\n');
const PROJECT_PAGE = 'The Clean Water for Gulu project runs from 2026 to 2028 in Gulu, Uganda, funded by the Lake Fund. It repairs 40 water points and trains 80 community caretakers so that repairs continue after the project ends.';

describe('context for the AI: pages, the context pack, suggestions, and the survey card (section 19, phase 5, A)', () => {
  it('without the AI, a draft is the page’s first sentences word for word; nothing is on the job until it is accepted', async () => {
    resetAi('off');
    const page = `${ABOUT_PAGE}\nIts board meets four times a year in Nairobi to review the work.\nIts annual report lists every partner by name.\nThe sentence about zebra crossings is never kept, being past the draft's limit.`;
    await draftFromPage('job-comms', 'about', page, 'your website', ['https://x.com/riverstoneaid'], open);
    const d = job('job-comms').pageDraft!;
    expect(d.lines[0].startsWith(`${ABOUT_PAGE.split('\n')[1]} ${ABOUT_PAGE.split('\n')[2]}`)).toBe(true);
    expect(d).toMatchObject({ kind: 'about', source: 'your website', social: ['https://x.com/riverstoneaid'] });
    expect(sec('job-comms', 'about').lines).not.toEqual(d.lines);
    expect(job('job-comms').chat.find((m) => m.card === 'page')).toBeDefined();
    expect(pageFor('job-comms')).toBeUndefined();
    expect(JSON.stringify(job('job-comms').chat)).not.toContain('12 local partners');
    expect(localStorage.getItem(STORAGE_KEY) ?? '').not.toContain('zebra crossings');
    acceptPageDraft('job-comms');
    expect(sec('job-comms', 'about')).toMatchObject({ lines: d.lines, ai: true });
    expect(job('job-comms').pack?.about).toEqual({ text: d.lines.join('\n'), source: 'your website' });
    expect(job('job-comms').pageDraft).toBeUndefined();
    expect(getState().org.websiteAsked).toBe(true);
  });

  it('a draft rejected changes nothing; an edited one is the user’s own; the job’s About us can become the organisation’s', async () => {
    resetAi('off');
    const before = sec('job-comms', 'about').lines;
    await draftFromPage('job-comms', 'about', ABOUT_PAGE, 'your website', [], open);
    rejectPageDraft('job-comms');
    expect(sec('job-comms', 'about').lines).toEqual(before);
    await draftFromPage('job-comms', 'about', ABOUT_PAGE, 'your website', [], open);
    acceptPageDraft('job-comms', ['Riverstone Aid works with communities in East Africa.']);
    expect(job('job-comms').pack?.about?.source).toBe('you told us');
    saveAboutForOrg('job-comms');
    expect(getState().org.about).toBe('Riverstone Aid works with communities in East Africa.');
    expect(extractDraft('Too short.\nNo sentences here')).toEqual([]);
  });

  it('the AI drafts only from the page being read: refused without one, or with a number the page does not give', () => {
    applyAiTurn('job-comms', '', { reply: 'Here is a draft.', actions: [{ type: 'page_draft', lines: ['Riverstone Aid works in East Africa.'], used: 'The first paragraph.', missing: '' }] }, open);
    const lastAi = () => job('job-comms').chat.filter((m) => m.ai).at(-1);
    expect(job('job-comms').pageDraft).toBeUndefined();
    expect(lastAi()?.text).toContain('Not done: a draft from a page: no page is being read');
    holdPage('job-comms', { kind: 'about', text: ABOUT_PAGE, source: 'your website', social: [] });
    applyAiTurn('job-comms', '', { reply: 'Here is a draft.', actions: [{ type: 'page_draft', lines: ['Riverstone Aid, founded in 2004, reaches 300,000 people with 12 partners.'], used: 'The page.', missing: 'How many people it reaches.' }] }, open);
    expect(job('job-comms').pageDraft).toBeUndefined();
    expect(lastAi()?.text).toContain('a number the page does not give (300000)');
    applyAiTurn('job-comms', '', { reply: 'Here is a draft from your page.', actions: [{ type: 'page_draft', lines: ['Riverstone Aid, founded in 2004, works with 12 local partners in East Africa on water, sanitation, and health.'], used: 'Who it is and where it works.', missing: 'It does not name its donors.' }] }, open);
    expect(job('job-comms').pageDraft).toMatchObject({ kind: 'about', missing: 'It does not name its donors.', source: 'your website' });
    expect(lastAi()).toMatchObject({ card: 'page' });
  });

  it('the raw page is sent only while its draft is written; the context pack goes with every request', () => {
    const plain = contextFor(getState(), job('job-comms'), undefined, false) as Record<string, unknown>;
    expect(plain.page).toBeUndefined();
    expect(plain.pack).toEqual({ about: null, project: null, facts: [] });
    const drafting = contextFor(getState(), job('job-comms'), undefined, false, undefined, { kind: 'about', text: ABOUT_PAGE }) as Record<string, unknown>;
    expect(drafting.page).toEqual({ kind: 'about', text: ABOUT_PAGE });
    update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, pack: { about: { text: 'Riverstone Aid works in East Africa.', source: 'your website' } } } : j)) }));
    expect((contextFor(getState(), job('job-comms'), undefined, false) as { pack: { about: unknown } }).pack.about).toEqual({ text: 'Riverstone Aid works in East Africa.', source: 'your website' });
  });

  it('the project: About the project is added from it, conflicts with the job’s facts are asked, and a later project offers to update the sections that used it', async () => {
    resetAi('off');
    setFacts('job-comms', { donor: 'Northfield Trust' });
    await draftFromPage('job-comms', 'project', PROJECT_PAGE, 'the project page', [], open);
    acceptPageDraft('job-comms');
    expect(job('job-comms').tags).toContain('background');
    expect(sec('job-comms', 'background')).toMatchObject({ title: 'About the project', ai: true });
    expect(job('job-comms').pack?.project).toMatchObject({ source: 'the project page', usedBy: [] });
    expect(job('job-comms').chat.some((m) => /gives the country as Uganda; the job says Kenya|gives the donor as Lake Fund; the job says Northfield Trust/.test(m.text))).toBe(true);
    writeSections('job-comms', [{ key: 'responsibilities', lines: ['- Repair the 40 water points with the community caretakers'] }], 'Used the project');
    expect(job('job-comms').pack?.project?.usedBy).toEqual(['responsibilities']);
    await draftFromPage('job-comms', 'project', 'The Clean Water for Gulu project now runs in two districts, with community committees taking over repairs after each visit.', 'the project page', [], open);
    acceptPageDraft('job-comms');
    const offer = job('job-comms').chat.find((m) => m.text.includes('The project changed:'));
    expect(offer).toMatchObject({ quick: ['Update them', 'Keep them as they are'] });
  });

  it('numbers in the accepted About us, project text, and suggestions count as given, in the demo’s checks and on the server; the rest are still refused', () => {
    update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, pack: { project: { text: PROJECT_PAGE, source: 'the project page', at: 1 }, facts: [{ fact: 'pay', value: 'USD 1,200 to 1,500 a month', source: 'your salary scale' }] } } : j)) }));
    expect(checkLines(['Salary: USD 1,200 to 1,500 a month.'], 'offer', getState(), job('job-comms'))).toEqual({ lines: ['Salary: USD 1,200 to 1,500 a month.'] });
    expect(checkLines(['Salary: USD 9,900 a month.'], 'offer', getState(), job('job-comms'))).toEqual({ refused: expect.stringContaining('it named pay that was not given') });
    const ctx = { job: { template: { key: 'ingo-role-profile' }, facts: {}, sections: [{ key: 'responsibilities', heading: 'Responsibilities', text: 'x' }] }, pack: contextFor(getState(), job('job-comms'), undefined, false).pack };
    const write = (line: string) => ({ reply: 'Done.', actions: [{ type: 'write_section', section: 'responsibilities', lines: [line] }] });
    expect(draftProblems(write('- Repair the 40 water points and train 80 caretakers'), ctx, 'make it concrete').join(' ')).not.toMatch(/numbers that were not given/);
    expect(draftProblems(write('- Repair the 55 water points'), ctx, 'make it concrete').join(' ')).toMatch(/Remove numbers that were not given: 55/);
  });

  it('suggest_fact: refused without a source, or with a figure that differs from the scale or the sample; a rejected one is not offered again', () => {
    update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, facts: { ...j.facts, salaryMode: 'hidden', salaryMin: '', salaryMax: '' } } : j)) }));
    const basis = payBasis(getState(), job('job-comms'))!;
    expect(basis).toMatchObject({ source: 'similar jobs in this place (sample)', currency: 'KES' });
    const pay = { fact: 'salary', min: basis.min, max: basis.max, currency: basis.currency, period: basis.period };
    expect(checkSuggestion(getState(), job('job-comms'), { ...pay })).toMatch(/without a source/);
    expect(checkSuggestion(getState(), job('job-comms'), { ...pay, source: 'you told us' })).toMatch(/without a source/);
    expect(checkSuggestion(getState(), job('job-comms'), { ...pay, source: basis.source, max: basis.max + 1000 })).toMatch(/differs from the scale or the sample/);
    expect(checkSuggestion(getState(), job('job-comms'), { ...pay, source: 'your salary scale' })).toMatch(/differs from the scale or the sample/);
    applyAiTurn('job-comms', 'what should we pay?', { reply: 'Here is a suggestion.', actions: [{ type: 'suggest_fact', ...pay, source: basis.source, reason: 'x' }] }, open);
    const sg = job('job-comms').suggestions?.[0];
    expect(sg).toMatchObject({ fact: 'salary', source: 'similar jobs in this place (sample)', state: 'open' });
    expect(sg?.reason).toMatch(/applications/);
    expect(job('job-comms').facts.salaryMode).toBe('hidden');
    expect(job('job-comms').chat.at(-1)).toMatchObject({ card: 'suggest' });
    rejectSuggestion('job-comms', sg!.id);
    expect(checkSuggestion(getState(), job('job-comms'), { ...pay, source: basis.source })).toMatch(/you rejected it on this job/);
  });

  it('a suggestion accepted becomes a fact the user gave: pay set on the job, in the pack with its source; edited, it is the user’s own', () => {
    update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, facts: { ...j.facts, salaryMode: 'hidden', salaryMin: '', salaryMax: '' } } : j)) }));
    const basis = payBasis(getState(), job('job-comms'))!;
    applyAiTurn('job-comms', 'suggest pay', { reply: 'Here.', actions: [{ type: 'suggest_fact', fact: 'salary', min: basis.min, max: basis.max, currency: basis.currency, period: basis.period, source: basis.source }] }, open);
    acceptSuggestion('job-comms', job('job-comms').suggestions![0].id, { min: basis.min, max: basis.max + 20000 });
    expect(job('job-comms').facts).toMatchObject({ salaryMode: 'range', salaryMin: basis.min.toLocaleString('en-US'), salaryMax: (basis.max + 20000).toLocaleString('en-US'), currency: 'KES' });
    expect(job('job-comms').pack?.facts?.[0]).toMatchObject({ fact: 'pay', source: 'you told us' });
  });

  it('experience is suggested only from the sample of similar jobs, with that number exactly', () => {
    const y = yearsBasis(getState(), job('job-fin'));
    if (!y) return expect(checkSuggestion(getState(), job('job-fin'), { fact: 'experience', years: 3, source: 'similar jobs in this place (sample)' })).toMatch(/differs from the sample/);
    expect(checkSuggestion(getState(), job('job-fin'), { fact: 'experience', years: y.years + 2, source: y.source })).toMatch(/differs from the sample/);
    expect(checkSuggestion(getState(), job('job-fin'), { fact: 'experience', years: y.years, source: y.source })).toMatchObject({ fact: 'experience', years: y.years });
  });

  it('the survey card holds only what the demo has: its questions, labelled figures, its checks, the length band, and the profile first', () => {
    const card = surveyCard(getState(), job('job-comms'));
    expect(card).toMatchObject({ sector: expect.any(String), pay: { source: 'similar jobs in this place (sample)' }, profileFirst: null });
    expect(card.questions).toContain('salary');
    expect(card.checks).toHaveLength(2);
    expect(card.length).toMatch(/^about \d[\d,]* words for \d+ sections in /);
    expect(JSON.stringify(card)).not.toMatch(/master|results at|typical week/i);
  });

  it('About us approved as it is: the website field is offered once, with it, and not again', () => {
    const id = startJob("We're hiring a WASH Officer in Goma, fixed-term", undefined, [], true);
    applyTemplate(id, job(id).format);
    chooseStyle(id, ['Warm']);
    setPace(id, 'step');
    for (let i = 0; i < 6 && nextStep(job(id), getState())?.kind === 'ask'; i++) setFacts(id, { grade: 'C1' });
    if (nextStep(job(id), getState())?.kind === 'approve') expect(job(id).chat.at(-1)).toMatchObject({ card: 'website' });
    approveSection(id, 'about');
    expect(getState().org.websiteAsked).toBe(true);
  });
});
