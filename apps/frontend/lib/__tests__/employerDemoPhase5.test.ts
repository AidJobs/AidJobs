import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { addTranslation, applyTemplate, changeSub, chooseStyle, createFormat, editSection, reorderSections, setFacts, setPace, startJob, toggleSection } from '../../components/employer-demo/actions';
import { applyAiTurn, type OpenTarget } from '../../components/employer-demo/aiActions';
import { basicAdvertCheck } from '../../components/employer-demo/market';
import { outlineOrder, titleSuggestions } from '../../components/employer-demo/engine';
import { FIXED_SECTIONS } from '../../components/employer-demo/flow';
import { getState, normalise, resetDemo, update } from '../../components/employer-demo/store';

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

  it('the AI adds and writes a sub-section only inside a written section, under the same checks as any text', () => {
    applyAiTurn('job-comms', 'add a sub-section on reporting', { reply: 'Added.', actions: [{ type: 'sub', section: 'responsibilities', op: 'add', heading: 'Reporting' }] }, open);
    const sub = sec('job-comms', 'responsibilities').subs?.[0];
    expect(sub?.title).toBe('Reporting');
    applyAiTurn('job-comms', 'write it', { reply: 'Written.', actions: [{ type: 'sub', section: 'responsibilities', op: 'write', sub: 'Reporting', lines: ['- Salary: USD 9,000 a month'] }] }, open);
    expect(job('job-comms').chat.filter((m) => m.ai).at(-1)?.text).toMatch(/it named pay that was not given/);
    applyAiTurn('job-comms', 'write it', { reply: 'Written.', actions: [{ type: 'sub', section: 'responsibilities', op: 'write', sub: 'Reporting', lines: ['- Send a short report to your manager each month'] }] }, open);
    expect(sec('job-comms', 'responsibilities').subs?.[0].lines).toEqual(['- Send a short report to your manager each month']);
  });
});
