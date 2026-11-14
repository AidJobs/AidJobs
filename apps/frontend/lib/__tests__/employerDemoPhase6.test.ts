import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { addTranslation, alsoIn, applyFormat, applyTemplate, approveFixed, approveSection, bringBackFixed, chooseStyle, editFixed, editSection, editVersionSection, goOn, hireAgain, keepForAll, keepWordingForAll, leaveOutFixed, leavePoint, moveFixed, NEXT_QUESTION, outlineOp, publish, publishBlock, removeVersionSection, resetFixed, restoreVersion, reviewTranslation, sendChat, setApply, setFacts, setJobLang, setLinked, setPace, settleQuestion, startJob, toggleCommitment, toggleSection, translateFixed, undoStep, unparkPart, USE_WORDINGS, versionOp } from '../../components/employer-demo/actions';
import { fixedShown } from '../../components/employer-demo/fixed';
import { differences } from '../../components/employer-demo/langs';
import { stale, untranslated } from '../../components/employer-demo/translate';
import { applyAiTurn, type OpenTarget } from '../../components/employer-demo/aiActions';
import { contextFor, resetAi } from '../../components/employer-demo/ai';
import { inOutlineOrder, outlineOrder, SECTION_BY_KEY } from '../../components/employer-demo/engine';
import { checkPoints, nextStep, type Step } from '../../components/employer-demo/flow';
import { grouped, groupingFrom, groupOrderOf, moveAfter, moveBy, moveGroupBy, moveInReading } from '../../components/employer-demo/outline';
import { partsOf } from '../../components/employer-demo/parts';
import { getState, normalise, resetDemo, update } from '../../components/employer-demo/store';
import { readAnswer } from '../../components/employer-demo/walkChat';
import type { DemoJob, Format } from '../../components/employer-demo/types';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const step = (id: string) => nextStep(job(id), getState());
const open = jest.fn((_t: OpenTarget) => undefined);

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  resetAi('off');
  update((s) => ({ ...s, signedIn: true }));
});

/** A job in the window, past its template, style, and pace, at its first question. */
function started(text = "We're hiring a WASH Officer in Goma, fixed-term", pace: 'step' | 'all' = 'step'): string {
  const id = startJob(text, undefined, [], true);
  applyTemplate(id, job(id).format);
  chooseStyle(id, ['Warm']);
  setPace(id, pace);
  return id;
}

/** Answers each step by the shortest route until `until` holds. */
function advance(id: string, until: (st: Step) => boolean): Step | null {
  for (let i = 0; i < 80; i++) {
    const st = step(id);
    if (!st || until(st)) return st;
    if (st.kind === 'approve') approveSection(id, st.section);
    else if (st.kind === 'ask') settleQuestion(id, st.fact);
    else if (st.kind === 'write') goOn(id);
    else if (['details', 'sdgs', 'fixed', 'suggest'].includes(st.kind)) settleQuestion(id, st.kind);
    else if (st.kind === 'keep') keepForAll(id, st.what, false);
    else if (st.kind === 'check') leavePoint(id, st.point.key);
    else return st;
    goOn(id);
  }
  return step(id);
}

/** A job as phase 5 saved it: its own flat order across groups, marked `ordered`. */
function phase5(id: string, tags: string[]): void {
  update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? ({ ...j, tags, ordered: true, sections: inOutlineOrder(j.sections, tags), groupOrder: undefined, groupOf: undefined } as DemoJob) : j)) }));
}

describe('saved data, and older saves brought forward (section 19, phase 6, step 1)', () => {
  it('a phase 5 save in its own order reads exactly as before, now grouped: groups in the order they first appear, a section that came back to an earlier group joining the one it sat in', () => {
    const base = job('job-comms').tags;
    const rest = base.filter((k) => !['about', 'purpose', 'responsibilities', 'apply'].includes(k));
    // purpose (the job), about (the employer), responsibilities (the job again, after the employer), then the rest, How to apply second last.
    const saved = ['purpose', 'about', 'responsibilities', ...rest.slice(0, -1), 'apply', ...rest.slice(-1)];
    phase5('job-comms', saved);
    const back = normalise({ ...getState() }).jobs.find((j) => j.id === 'job-comms')!;
    expect(back.tags).toEqual(saved);
    expect(back.sections.map((x) => x.key)).toEqual(saved.filter((k) => back.sections.some((x) => x.key === k)));
    expect(back.ordered).toBeUndefined();
    expect(back.groupOrder?.slice(0, 2)).toEqual(['job', 'employer']);
    expect(back.groupOf?.responsibilities).toBe('employer');
    expect(grouped(back.tags, back)).toEqual(back.tags);
  });

  it('the rule, on its own: walking the order, each new group starts where it first appears', () => {
    expect(groupingFrom(['purpose', 'about', 'responsibilities', 'requirements'])).toEqual({ groupOrder: ['job', 'employer', 'person', 'offer', 'apply'], groupOf: { responsibilities: 'employer' } });
    expect(groupingFrom(['about', 'purpose', 'responsibilities'])).toEqual({ groupOrder: undefined, groupOf: undefined });
    expect(groupingFrom(['about', 'apply', 'purpose'])).toEqual({ groupOrder: ['employer', 'apply', 'job', 'person', 'offer'], groupOf: undefined });
  });

  it('a job that followed the group order is left as it was', () => {
    const before = job('job-comms');
    const back = normalise({ ...getState() }).jobs.find((j) => j.id === 'job-comms')!;
    expect(back.tags).toEqual(outlineOrder(before.tags));
    expect(back.groupOrder).toBeUndefined();
    expect(back.groupOf).toBeUndefined();
  });

  it('a template saved by phase 5 across groups is brought forward the same way, its sub-sections kept inside their section', () => {
    const f: Format = { key: 'f5', label: 'Phase 5 template', family: 'Your organisation', usedBy: 'x', tone: 'warm', commitments: [], order: [
      { key: 'purpose', heading: 'The role' },
      { key: 'about', heading: 'Who we are' },
      { key: 'responsibilities', heading: 'What you do', subs: [{ id: 'sub-a', heading: 'In the field' }] },
      { key: 'apply', heading: 'How to apply' },
    ] };
    update((s) => ({ ...s, formats: [...s.formats, f] }));
    const back = normalise({ ...getState() }).formats.find((x) => x.key === 'f5')!;
    expect(back.order.map((o) => o.key)).toEqual(['purpose', 'about', 'responsibilities', 'apply']);
    expect(back.groupOrder?.filter((g) => ['job', 'employer', 'apply'].includes(g))).toEqual(['job', 'employer', 'apply']);
    expect(back.order.find((o) => o.key === 'responsibilities')).toMatchObject({ group: 'employer', subs: [{ id: 'sub-a', heading: 'In the field' }] });
  });

  it('a version saved in its own order is brought forward the same way; one in the group order is left alone', () => {
    addTranslation('job-comms', 'fr');
    const fr = job('job-comms').translations!.fr!;
    const keys = fr.sections.map((x) => x.key);
    const moved = [keys[1], keys[0], ...keys.slice(2)];
    update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, translations: { fr: { ...fr, groupOrder: undefined, groupOf: undefined, sections: inOutlineOrder(fr.sections, moved) } } } : j)) }));
    const back = normalise({ ...getState() }).jobs.find((j) => j.id === 'job-comms')!.translations!.fr!;
    expect(back.sections.map((x) => x.key)).toEqual(moved);
    expect(back.groupOrder?.[0]).toBe('job');
  });

  it('the languages "confirmed" by phase 5 are dropped: Settings now holds the organisation’s wording per language', () => {
    update((s) => ({ ...s, org: { ...s.org, fixedLangs: ['fr'] } }));
    expect(normalise({ ...getState() }).org.fixedLangs).toBeUndefined();
  });

  it('Hire again copies the grouping and the fixed texts’ wording for the job, never the link between languages', () => {
    update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, groupOrder: ['job', 'employer', 'person', 'offer', 'apply'], fixed: { equal: { text: 'Our own words for this job.' } }, linked: ['en', 'fr'] } : j)) }));
    const copy = job(hireAgain('job-comms')!);
    expect(copy.groupOrder).toEqual(['job', 'employer', 'person', 'offer', 'apply']);
    expect(copy.fixed).toEqual({ equal: { text: 'Our own words for this job.' } });
    expect(copy.linked).toBeUndefined();
  });

  it('changing the job’s own language to one it has a version in: the two change places, and nothing written is lost', () => {
    addTranslation('job-comms', 'fr');
    const fr = job('job-comms').translations!.fr!;
    const own = job('job-comms').sections;
    update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, fixed: { equal: { text: 'English wording for this job.' } }, translations: { fr: { ...fr, fixed: { equal: { text: 'Formulation française.' } } } } } : j)) }));
    setJobLang('job-comms', 'fr');
    const j = job('job-comms');
    expect(j.lang).toBe('fr');
    expect(j.sections).toEqual(fr.sections);
    expect(j.fixed).toEqual({ equal: { text: 'Formulation française.' } });
    expect(j.translations?.en?.sections).toEqual(own);
    expect(j.translations?.en?.fixed).toEqual({ equal: { text: 'English wording for this job.' } });
    expect(j.translations?.fr).toBeUndefined();
  });
});

describe('when none of the offered answers fits (section 19, phase 6, A)', () => {
  it('a question is asked again once after a request about something else, then parked with its “to do” mark, and the next waits until the user replies to the flow', () => {
    const id = started();
    expect(step(id)).toMatchObject({ kind: 'ask', fact: 'grade' });
    sendChat(id, 'More formal');
    expect(job(id).chat.at(-1)).toMatchObject({ step: 'ask:grade' });
    sendChat(id, 'Shorter');
    expect(job(id).walk?.parked).toEqual(['grade']);
    expect(job(id).walk?.hold).toBe('grade');
    expect(job(id).chat.at(-1)).toMatchObject({ from: 'ai', quick: [NEXT_QUESTION] });
    expect(partsOf(job(id), getState()).find((p) => p.key === 'details')?.done).toBe(false);
    // Another request: done, and the next question still waits; "Next question" stays offered.
    sendChat(id, 'More formal');
    expect(job(id).sections.filter((x) => x.key !== 'apply')).toHaveLength(0);
    expect(job(id).chat.at(-1)?.quick).toContain(NEXT_QUESTION);
    sendChat(id, 'ok');
    expect(job(id).walk?.hold).toBeUndefined();
    expect(step(id)).toMatchObject({ kind: 'approve', section: job(id).tags[0] });
    expect(job(id).chat.at(-1)?.step).toBe(`approve:${job(id).tags[0]}`);
  });

  it('a reply the rules cannot read counts as none fitting: asked once more, then parked', () => {
    const id = started();
    sendChat(id, 'hmm');
    expect(job(id).chat.at(-1)?.text).toMatch(/^I couldn't read that\./);
    sendChat(id, 'erm, well');
    expect(job(id).walk?.parked).toEqual(['grade']);
  });

  it('the parked question is answered at any time: typed while the next waits, it is taken and the flow goes on', () => {
    const id = started();
    sendChat(id, 'hmm');
    sendChat(id, 'erm, well');
    expect(job(id).walk?.parked).toEqual(['grade']);
    sendChat(id, 'P3');
    expect(job(id).facts.grade).toBe('P3');
    expect(job(id).walk?.parked ?? []).not.toContain('grade');
    expect(job(id).walk?.hold).toBeUndefined();
  });

  it('“skip”, “later”, “not now”, and “leave it” park the question at every question, and the next is asked at once; “no” still declines', () => {
    const id = started();
    sendChat(id, 'later');
    expect(job(id).walk?.parked).toEqual(['grade']);
    expect(job(id).walk?.hold).toBeUndefined();
    const at = step(id);
    expect(at?.kind).toBe('approve');
    sendChat(id, 'skip');
    expect(job(id).walk?.parked).toContain(`approve:${(at as { section: string }).section}`);
    advance(id, (st) => st.kind === 'details');
    sendChat(id, 'not now');
    expect(job(id).walk?.parked).toContain('details');
    expect(job(id).walk?.settled).not.toContain('details');
    advance(id, (st) => st.kind === 'check' || st.kind === 'plan' || st.kind === 'ask');
  });

  it('skip is not none: “skip” at pay parks it and leaves the pay as it is; “none” hides it', () => {
    const s = getState();
    const j = job('job-comms');
    expect(readAnswer('salary', 'skip', s, j)).toBeNull();
    expect(readAnswer('salary', 'none', s, j)).toEqual({ patch: { salaryMode: 'hidden' } });
    expect(readAnswer('grade', 'skip', s, j)).toBeNull();
    expect(readAnswer('grade', 'no grade', s, j)).toEqual({ patch: { grade: '' } });
  });

  it('what waits instead of parking: the setup, and Free or Amplify', () => {
    const id = startJob("We're hiring a WASH Officer in Goma, fixed-term", undefined, [], true);
    applyTemplate(id, job(id).format);
    sendChat(id, 'later');
    expect(job(id).walk?.parked).toBeUndefined();
    const id2 = started("We're hiring a WASH Officer in Goma, fixed-term, closing 30 December 2026", 'all');
    expect(advance(id2, (st) => st.kind === 'plan')?.kind).toBe('plan');
    sendChat(id2, 'later');
    expect(job(id2).walk?.parked ?? []).not.toContain('plan');
    expect(step(id2)?.kind).toBe('plan');
  });

  it('only the essentials come back before Free or Amplify, and an essential missing blocks publishing by every route', () => {
    const id = started("We're hiring a WASH Officer in Goma, fixed-term", 'all');
    const back = advance(id, (st) => st.kind === 'plan' || (st.kind === 'ask' && Boolean(st.essential)));
    expect(back).toEqual({ kind: 'ask', fact: 'deadline', essential: true });
    expect(publishBlock(getState(), id, { plan: 'free', schedule: null })).toBe('Missing: the closing date');
    expect(publishBlock(getState(), id, { plan: 'free', schedule: '2026-12-20' })).toBe('Missing: the closing date');
    sendChat(id, 'later');
    expect(step(id)).toEqual({ kind: 'ask', fact: 'deadline', essential: true });
    update((st) => ({ ...st, jobs: st.jobs.map((j) => (j.id === id ? { ...j, facts: { ...j.facts, deadline: '2026-12-30' }, apply: { ...j.apply, method: 'email', address: '' } } : j)) }));
    expect(step(id)).toEqual({ kind: 'ask', fact: 'method', essential: true });
    expect(publishBlock(getState(), id, { plan: 'free', schedule: null })).toBe('Missing: an email address to apply to');
  });

  it('parked questions survive a reload; opening their part from the line un-parks them, their count starting again', () => {
    const id = started();
    sendChat(id, 'hmm');
    sendChat(id, 'erm, well');
    const back = normalise({ ...getState() }).jobs.find((j) => j.id === id)!;
    expect(back.walk).toMatchObject({ parked: ['grade'], askedAgain: { grade: 1 } });
    unparkPart(id, 'details');
    expect(job(id).walk?.parked).toBeUndefined();
    expect(step(id)).toMatchObject({ kind: 'ask', fact: 'grade' });
    expect(job(id).chat.at(-1)?.step).toBe('ask:grade');
    // Its count started again: one more request about something else, and it is asked once more rather than parked.
    sendChat(id, 'More formal');
    expect(job(id).walk?.parked).toBeUndefined();
    expect(job(id).chat.at(-1)?.step).toBe('ask:grade');
  });

  it('the AI is told what is parked, and a parked section is still approved by name', () => {
    const id = started();
    sendChat(id, 'later');
    const at = step(id) as { kind: 'approve'; section: string };
    sendChat(id, 'skip');
    const ctx = contextFor(getState(), job(id), undefined, false) as { walk: { parked: string[] } };
    expect(ctx.walk.parked).toEqual(['grade', `approve:${at.section}`]);
    applyAiTurn(id, `${job(id).sections.find((x) => x.key === at.section)?.title} is good now`, { reply: 'Approved.', actions: [{ type: 'approve_section', section: at.section }] }, open);
    expect(job(id).walk?.approved).toContain(at.section);
  });
});

describe('the outline and the draft: structure from anywhere, one Undo step (section 19, phase 6, B, C, and D)', () => {
  it('a section added from the draft goes where it was opened, in that group, and stays through a reload and a template rebuild', () => {
    outlineOp('job-comms', { op: 'add', key: 'team', after: 'purpose' });
    const j = job('job-comms');
    expect(j.tags.indexOf('team')).toBe(j.tags.indexOf('purpose') + 1);
    expect(j.groupOf).toEqual({ team: 'job' });
    expect(j.sections.find((x) => x.key === 'team')?.lines.length).toBeGreaterThan(0);
    const back = normalise({ ...getState() }).jobs.find((x) => x.id === 'job-comms')!;
    expect(back.tags).toEqual(j.tags);
    setFacts('job-comms', { location: 'Gulu, Uganda' });
    expect(job('job-comms').tags).toEqual(j.tags);
    const other = getState().formats.find((f) => f.key !== j.format && !f.key.startsWith('pasted-'))!;
    applyFormat('job-comms', other.key);
    expect(job('job-comms').tags).toContain('team');
    expect(job('job-comms').groupOf?.team).toBe('job');
  });

  it('from the last +, a section goes at the end of its own group', () => {
    outlineOp('job-comms', { op: 'add', key: 'competencies' });
    const t = job('job-comms').tags;
    expect(t.indexOf('competencies')).toBe(Math.max(...t.filter((k) => ['requirements', 'competencies'].includes(k)).map((k) => t.indexOf(k))));
  });

  it('groups reordered and a section moved into another group: the outline and the job description read the same', () => {
    outlineOp('job-comms', { op: 'groupBefore', group: 'offer', before: 'job' });
    outlineOp('job-comms', { op: 'toGroup', key: 'requirements', group: 'employer' });
    const j = job('job-comms');
    expect(groupOrderOf(j).slice(0, 2)).toEqual(['employer', 'offer']);
    expect(j.sections.map((x) => x.key)).toEqual(j.tags);
    expect(grouped(j.tags, j)).toEqual(j.tags);
    expect(j.tags.indexOf('requirements')).toBeLessThan(j.tags.indexOf('offer'));
  });

  it('a moved section keeps its own facts, and the walk follows the reading order', () => {
    const id = started();
    outlineOp(id, { op: 'groupBefore', group: 'person', before: 'employer' });
    expect(job(id).tags[0]).toBe(job(id).tags.find((k) => SECTION_BY_KEY[k]?.group === 'person'));
    // The person group now comes first, so its facts are asked first; the job's grade is asked before the first job section, wherever it is.
    expect(step(id)).toMatchObject({ kind: 'ask', fact: 'eligibility', section: job(id).tags[0] });
    outlineOp(id, { op: 'toGroup', key: 'purpose', group: 'person' });
    settleQuestion(id, 'eligibility');
    settleQuestion(id, 'languages');
    settleQuestion(id, 'safeguarding');
    goOn(id);
    const st = advance(id, (x) => x.kind === 'ask' && x.fact === 'grade');
    expect(st).toMatchObject({ kind: 'ask', fact: 'grade' });
  });

  it('a section removed is noted where it was and brought back with Undo, in every language; also from Earlier versions', () => {
    addTranslation('job-comms', 'fr');
    const before = job('job-comms');
    outlineOp('job-comms', { op: 'remove', key: 'offer' });
    expect(job('job-comms').tags).not.toContain('offer');
    expect(job('job-comms').undoStep).toMatchObject({ tab: 'doc', removed: { key: 'offer', after: before.tags[before.tags.indexOf('offer') - 1] } });
    undoStep('job-comms');
    expect(job('job-comms').tags).toEqual(before.tags);
    expect(job('job-comms').sections).toEqual(before.sections);
    expect(job('job-comms').translations).toEqual(before.translations);
    outlineOp('job-comms', { op: 'remove', key: 'offer' });
    const earlier = job('job-comms').versions.filter((v) => v.sections.some((x) => x.key === 'offer')).at(-1)!;
    restoreVersion('job-comms', earlier.n);
    expect(job('job-comms').tags).toContain('offer');
  });

  it('moves by the grip’s menu and the arrow keys: Move up and down in the outline cross group boundaries; in the draft a move is always seen', () => {
    const t = job('job-comms').tags;
    const firstJob = t.find((k) => SECTION_BY_KEY[k]?.group === 'job')!;
    outlineOp('job-comms', { op: 'by', key: firstJob, by: -1 });
    expect(job('job-comms').groupOf?.[firstJob]).toBe('employer');
    expect(job('job-comms').tags).toEqual(t);
    outlineOp('job-comms', { op: 'by', key: firstJob, by: -1, reading: true });
    expect(job('job-comms').tags.indexOf(firstJob)).toBe(t.indexOf(firstJob) - 1);
  });

  it('How to apply is never removed: not from the outline, the draft, the chat, the AI, or a version', () => {
    outlineOp('job-comms', { op: 'remove', key: 'apply' });
    toggleSection('job-comms', 'apply');
    sendChat('job-comms', 'remove How to apply');
    applyAiTurn('job-comms', 'remove how to apply', { reply: 'Removed.', actions: [{ type: 'remove_section', section: 'apply' }] }, open);
    expect(job('job-comms').tags).toContain('apply');
    expect(job('job-comms').chat.filter((m) => m.ai).at(-1)?.text).toContain('Not done: removing How to apply');
    addTranslation('job-comms', 'fr');
    removeVersionSection('job-comms', 'fr', 'apply');
    expect(job('job-comms').translations?.fr?.sections.some((x) => x.key === 'apply')).toBe(true);
  });

  it('a heading renamed in place is one Undo step; Undo puts the job’s content back, not its facts', () => {
    const was = job('job-comms').sections.find((x) => x.key === 'purpose')!.title;
    outlineOp('job-comms', { op: 'rename', key: 'purpose', heading: 'Your role' });
    setFacts('job-comms', { positions: '3' });
    expect(job('job-comms').sections.find((x) => x.key === 'purpose')?.title).toBe('Your role');
    undoStep('job-comms');
    expect(job('job-comms').sections.find((x) => x.key === 'purpose')?.title).toBe(was);
    expect(job('job-comms').facts.positions).toBe('3');
  });

  it('headings inside a section are added, renamed, and removed in the pencil’s editor; never in the outline', () => {
    const r = job('job-comms').sections.find((x) => x.key === 'responsibilities')!;
    editSection('job-comms', 'responsibilities', r.lines.join('\n'), false, { subs: [{ id: 'sub-x', title: 'In the field', text: '- Visit partner sites' }] });
    expect(job('job-comms').sections.find((x) => x.key === 'responsibilities')?.subs).toEqual([{ id: 'sub-x', title: 'In the field', lines: ['- Visit partner sites'] }]);
    editSection('job-comms', 'responsibilities', r.lines.join('\n'), false, { subs: [{ id: 'sub-x', title: 'Field work', text: '- Visit partner sites' }] });
    expect(job('job-comms').sections.find((x) => x.key === 'responsibilities')?.subs?.[0].title).toBe('Field work');
    editSection('job-comms', 'responsibilities', r.lines.join('\n'), false, { subs: [] });
    expect(job('job-comms').sections.find((x) => x.key === 'responsibilities')?.subs).toBeUndefined();
  });

  it('the AI moves a group or a section into a group only when asked to move something', () => {
    applyAiTurn('job-comms', 'tidy it', { reply: 'Done.', actions: [{ type: 'move_group', group: 'offer', before: 'job' }] }, open);
    expect(job('job-comms').groupOrder).toBeUndefined();
    applyAiTurn('job-comms', 'put the offer before the job', { reply: 'Done.', actions: [{ type: 'move_group', group: 'offer', before: 'job' }] }, open);
    expect(groupOrderOf(job('job-comms')).slice(0, 2)).toEqual(['employer', 'offer']);
  });
});

describe('fixed texts from the draft (section 19, phase 6, D)', () => {
  const unlocked = () => job('job-comms').commitments.find((k) => !getState().org.standard.find((c) => c.key === k)?.locked)!;
  const locked = () => job('job-comms').commitments.find((k) => getState().org.standard.find((c) => c.key === k)?.locked)!;

  it('a text not locked is worded for this job and set back; the owner is offered, quietly, to use it for every job', () => {
    const k = unlocked();
    editFixed('job-comms', k, 'Our own words for this job.');
    expect(fixedShown(job('job-comms'), getState(), k)).toMatchObject({ text: 'Our own words for this job.', own: true });
    expect(job('job-comms').wordingOffer).toEqual({ key: k, lang: 'en', left: 2 });
    expect(getState().org.standard.find((c) => c.key === k)?.text).not.toBe('Our own words for this job.');
    resetFixed('job-comms', k);
    expect(fixedShown(job('job-comms'), getState(), k).own).toBe(false);
  });

  it('“Yes” to the wording for every job changes Organisation settings, which Undo leaves; “Not now” changes nothing; passed by twice, it goes', () => {
    const k = unlocked();
    editFixed('job-comms', k, 'Our wording, for every job.');
    keepWordingForAll('job-comms', true);
    expect(getState().org.standard.find((c) => c.key === k)?.text).toBe('Our wording, for every job.');
    expect(job('job-comms').undoStep?.settings).toBe(true);
    undoStep('job-comms');
    expect(getState().org.standard.find((c) => c.key === k)?.text).toBe('Our wording, for every job.');
    editFixed('job-comms', k, 'Another wording.');
    keepWordingForAll('job-comms', false);
    expect(getState().org.standard.find((c) => c.key === k)?.text).toBe('Our wording, for every job.');
    editFixed('job-comms', k, 'A third wording.');
    outlineOp('job-comms', { op: 'rename', key: 'purpose', heading: 'Role' });
    expect(job('job-comms').wordingOffer?.left).toBe(1);
    outlineOp('job-comms', { op: 'rename', key: 'purpose', heading: 'The role' });
    expect(job('job-comms').wordingOffer).toBeUndefined();
  });

  it('a locked text cannot be worded for the job or left out, by the draft, the line, the chat, or the AI', () => {
    const k = locked();
    editFixed('job-comms', k, 'Changed.');
    leaveOutFixed('job-comms', k);
    toggleCommitment('job-comms', k);
    applyAiTurn('job-comms', 'drop it', { reply: 'Done.', actions: [{ type: 'fixed_text', remove: [k] }] }, open);
    applyAiTurn('job-comms', 'say "Changed."', { reply: 'Done.', actions: [{ type: 'fixed_text', word: { [k]: 'Changed.' } }] }, open);
    expect(job('job-comms').commitments).toContain(k);
    expect(fixedShown(job('job-comms'), getState(), k).text).not.toBe('Changed.');
    expect(job('job-comms').chat.filter((m) => m.ai).at(-1)?.text).toMatch(/locked/);
  });

  it('a text left out comes back from + at the end of the block; texts move within the block only', () => {
    const k = unlocked();
    leaveOutFixed('job-comms', k);
    expect(job('job-comms').commitments).not.toContain(k);
    expect(job('job-comms').undoStep?.text).toMatch(/^Left out /);
    bringBackFixed('job-comms', k);
    expect(job('job-comms').commitments.at(-1)).toBe(k);
    moveFixed('job-comms', k, -1);
    expect(job('job-comms').commitments.at(-2)).toBe(k);
  });

  it('the AI words a text for the job only with the words the user typed', () => {
    const k = unlocked();
    applyAiTurn('job-comms', 'make it warmer', { reply: 'Done.', actions: [{ type: 'fixed_text', word: { [k]: 'A warmer wording the AI made up.' } }] }, open);
    expect(fixedShown(job('job-comms'), getState(), k).own).toBe(false);
    applyAiTurn('job-comms', 'Use this: We welcome everyone.', { reply: 'Done.', actions: [{ type: 'fixed_text', word: { [k]: 'We welcome everyone.' } }] }, open);
    expect(fixedShown(job('job-comms'), getState(), k).text).toBe('We welcome everyone.');
  });

  it('a published job keeps its fixed texts’ wording when Settings change; drafts take the new wording', () => {
    const k = job('job-cps').commitments[0];
    const was = fixedShown(job('job-cps'), getState(), k).text;
    update((s) => ({ ...s, org: { ...s.org, standard: s.org.standard.map((c) => (c.key === k ? { ...c, text: 'New wording in Settings.' } : c)) } }));
    expect(job('job-cps').status).toBe('live');
    expect(fixedShown(job('job-cps'), getState(), k).text).toBe(was);
    const draft = getState().jobs.find((j) => j.status === 'draft' && j.commitments.includes(k));
    if (draft) expect(fixedShown(draft, getState(), k).text).toBe('New wording in Settings.');
    setFacts('job-comms', { deadline: '2026-12-30' });
    expect(publish('job-comms', { plan: 'free', schedule: null })).toBe(true);
    expect(job('job-comms').fixedPublished?.en).toBeDefined();
  });

  it('a phase 5 published job takes its fixed texts’ wording from the settings on load', () => {
    update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === 'job-cps' ? { ...j, fixedPublished: undefined } : j)) }));
    const back = normalise({ ...getState() }).jobs.find((j) => j.id === 'job-cps')!;
    expect(Object.keys(back.fixedPublished?.en ?? {})).toEqual(back.commitments);
  });
});

describe('languages, each independent (section 19, phase 6, E)', () => {
  const fr = () => job('job-comms').translations!.fr!;
  const own = (k: string) => job('job-comms').sections.find((x) => x.key === k)!;
  beforeEach(() => {
    addTranslation('job-comms', 'fr');
    addTranslation('job-comms', 'es');
  });

  it('an edit by the user reaches no other language unless linked, and marks none behind; the change note offers the others once', () => {
    const before = fr().sections.find((x) => x.key === 'responsibilities')!.lines;
    editSection('job-comms', 'responsibilities', '- A new duty written by hand', true);
    expect(fr().sections.find((x) => x.key === 'responsibilities')!.lines).toEqual(before);
    expect(stale(job('job-comms'), fr())).toBe(false);
    expect(job('job-comms').undoStep?.also).toEqual({ langs: ['fr', 'es'], from: 'en' });
    alsoIn('job-comms', ['fr']);
    expect(fr().sections.find((x) => x.key === 'responsibilities')!.lines).toEqual(['- A new duty written by hand']);
    expect(fr().reviewed).toBe(false);
    expect(job('job-comms').undoStep?.also).toEqual({ langs: ['es'], from: 'en' });
    expect(job('job-comms').translations?.es?.sections.find((x) => x.key === 'responsibilities')!.lines).not.toEqual(['- A new duty written by hand']);
  });

  it('a change by the rules or the facts still marks a version behind, with its banner', () => {
    setApply('job-comms', { method: 'email', address: 'jobs@riverstone.example.org' });
    expect(stale(job('job-comms'), fr())).toBe(true);
  });

  it('linked, every change follows: structure copied, text drafted by the table and marked for review; the note names the languages', () => {
    setLinked('job-comms', ['en', 'fr']);
    outlineOp('job-comms', { op: 'add', key: 'firstweeks' });
    expect(fr().sections.some((x) => x.key === 'firstweeks')).toBe(true);
    expect(fr().sections.find((x) => x.key === 'firstweeks')?.title).toBe('Vos premières semaines');
    expect(job('job-comms').translations?.es?.sections.some((x) => x.key === 'firstweeks')).toBe(false);
    expect(job('job-comms').undoStep?.text).toMatch(/also in French$/);
    outlineOp('job-comms', { op: 'groupBefore', group: 'offer', before: 'job' });
    expect(fr().groupOrder).toEqual(job('job-comms').groupOrder);
    editSection('job-comms', 'offer', '- Annual leave, medical insurance, and a learning budget\n- A brand new line only English has', true);
    const offer = fr().sections.find((x) => x.key === 'offer')!.lines;
    expect(offer[0]).toBe('- Congés annuels, assurance médicale et budget de formation');
    expect(offer[1]).toBe('- A brand new line only English has');
    expect(untranslated(job('job-comms'), fr())).toBeGreaterThan(0);
    expect(fr().reviewed).toBe(false);
  });

  it('a linked edit from a version into the job’s own language, with the AI off, marks the section “to update”, with where it came from', () => {
    setLinked('job-comms', ['en', 'fr']);
    editVersionSection('job-comms', 'fr', 'responsibilities', '- Une nouvelle tâche');
    expect(job('job-comms').toUpdate).toEqual({ responsibilities: 'fr' });
    expect(checkPoints(job('job-comms'), getState()).some((p) => p.key === 'to-update-responsibilities')).toBe(true);
    editSection('job-comms', 'responsibilities', own('responsibilities').lines.join('\n'), false);
    expect(job('job-comms').toUpdate).toBeUndefined();
  });

  it('a linked language that lacks the section is skipped', () => {
    removeVersionSection('job-comms', 'fr', 'offer');
    setLinked('job-comms', ['en', 'fr']);
    editSection('job-comms', 'offer', '- Something new', true);
    expect(fr().sections.some((x) => x.key === 'offer')).toBe(false);
  });

  it('Undo puts every language back, with the links', () => {
    setLinked('job-comms', ['en', 'fr']);
    const before = { tags: job('job-comms').tags, fr: fr() };
    outlineOp('job-comms', { op: 'remove', key: 'offer' });
    expect(fr().sections.some((x) => x.key === 'offer')).toBe(false);
    undoStep('job-comms');
    expect(job('job-comms').tags).toEqual(before.tags);
    expect(fr()).toEqual(before.fr);
    expect(job('job-comms').linked).toEqual(['en', 'fr']);
  });

  it('a version is edited with the same editor: as many lines as it needs, the lines still in the job’s language counted by their text', () => {
    const src = own('responsibilities').lines;
    editVersionSection('job-comms', 'fr', 'responsibilities', [src[2], 'Une ligne de plus', src[0]].join('\n'));
    expect(fr().sections.find((x) => x.key === 'responsibilities')!.lines).toHaveLength(3);
    expect(untranslated(job('job-comms'), { ...fr(), sections: fr().sections.filter((x) => x.key === 'responsibilities') })).toBe(2);
    expect(job('job-comms').undoStep).toMatchObject({ tab: 'fr', keys: ['responsibilities'] });
  });

  it('a version’s own structure: a section only French has, and one not in Spanish, are marked in the outline', () => {
    versionOp('job-comms', 'fr', { op: 'add', key: 'conditions' });
    versionOp('job-comms', 'es', { op: 'remove', key: 'offer' });
    expect(differences(job('job-comms'), 'fr')).toEqual({ conditions: 'French only' });
    expect(differences(job('job-comms')).offer).toBe('Not in Spanish');
  });

  it('a template change reaches every language; This job’s sections only the language in view and the linked ones', () => {
    const other = getState().formats.find((f) => f.key !== job('job-comms').format && !f.key.startsWith('pasted-') && f.order.some((o) => o.key === 'background'))!;
    applyFormat('job-comms', other.key);
    expect(fr().sections.map((x) => x.key).sort()).toEqual([...job('job-comms').tags].sort());
    versionOp('job-comms', 'fr', { op: 'remove', key: 'background' });
    expect(job('job-comms').tags).toContain('background');
    expect(job('job-comms').translations?.es?.sections.some((x) => x.key === 'background')).toBe(true);
  });

  it('fixed texts per language: the organisation’s wording word for word; else, with the AI off, its text marked to translate; a machine translation marked until the version is approved, then offered for every job', () => {
    const k = job('job-comms').commitments.find((x) => !getState().org.standard.find((c) => c.key === x)?.locked)!;
    expect(fixedShown(job('job-comms'), getState(), k, 'fr')).toMatchObject({ toTranslate: true, textLang: 'en' });
    update((s) => ({ ...s, org: { ...s.org, fixedWording: { fr: { [k]: 'Notre formulation.' } } } }));
    expect(fixedShown(job('job-comms'), getState(), k, 'fr')).toMatchObject({ text: 'Notre formulation.', toTranslate: false, machine: false });
    const locked = job('job-comms').commitments.find((x) => getState().org.standard.find((c) => c.key === x)?.locked)!;
    translateFixed('job-comms', locked, 'Traduction automatique.', 'fr');
    expect(fixedShown(job('job-comms'), getState(), locked, 'fr')).toMatchObject({ text: 'Traduction automatique.', machine: true });
    reviewTranslation('job-comms', 'fr');
    expect(fixedShown(job('job-comms'), getState(), locked, 'fr').machine).toBe(false);
    expect(job('job-comms').wordingAsk).toBe('fr');
    sendChat('job-comms', USE_WORDINGS);
    expect(getState().org.fixedWording?.fr?.[locked]).toBe('Traduction automatique.');
    expect(job('job-comms').wordingAsk).toBeUndefined();
  });

  it('in a job whose own language is not the organisation’s, the fixed texts are shown, marked, and approved there with a check point', () => {
    const id = startJob('Nous recherchons un chargé de logistique à Goma, CDD de 12 mois', undefined, [], true);
    const k = job(id).commitments[0];
    expect(fixedShown(job(id), getState(), k)).toMatchObject({ toTranslate: true });
    translateFixed(id, k, 'Texte traduit.', 'fr');
    expect(checkPoints(job(id), getState()).some((p) => p.key === 'fixed-machine')).toBe(true);
    approveFixed(id, k);
    expect(checkPoints(job(id), getState()).some((p) => p.key === 'fixed-machine')).toBe(false);
  });

  it('the AI never changes the link, and its changes in a language follow the linked ones', () => {
    applyAiTurn('job-comms', 'link French and Spanish', { reply: 'Linked.', actions: [{ type: 'set_link', languages: ['fr', 'es'] }] }, open);
    expect(job('job-comms').linked).toBeUndefined();
    expect(job('job-comms').chat.filter((m) => m.ai).at(-1)?.text).toContain('an action the demo does not have');
    setLinked('job-comms', ['en', 'fr']);
    applyAiTurn('job-comms', 'add First weeks', { reply: 'Added.', actions: [{ type: 'add_section', section: 'firstweeks' }] }, open);
    expect(fr().sections.some((x) => x.key === 'firstweeks')).toBe(true);
  });

  it('the context of a full job with versions and per-language data stays within 80,000 characters', () => {
    setLinked('job-comms', ['en', 'fr', 'es']);
    for (const k of ['team', 'background', 'setting', 'deliverables', 'relationships', 'firstweeks', 'competencies', 'languages', 'practical', 'conditions', 'funding', 'assessment']) outlineOp('job-comms', { op: 'add', key: k });
    for (const k of job('job-comms').commitments) translateFixed('job-comms', k, 'Une traduction assez longue du texte de cet engagement, pour la taille. '.repeat(4), 'fr');
    const body = JSON.stringify({ message: 'x', first: false, context: contextFor(getState(), job('job-comms'), 'responsibilities', false, 'fr', undefined, { from: 'en', keys: job('job-comms').tags, fixed: job('job-comms').commitments, langs: ['fr', 'es'] }) });
    expect(body.length).toBeLessThan(80_000);
  });
});

describe('moving within and across groups, always read grouped (section 19, phase 6, B)', () => {
  const keys = ['about', 'team', 'purpose', 'responsibilities', 'requirements', 'offer', 'apply'];
  it('dropped after another section, it joins that section’s group; dropped at the top, the first group', () => {
    const a = moveAfter(keys, {}, 'offer', 'purpose');
    expect(a.keys).toEqual(['about', 'team', 'purpose', 'offer', 'responsibilities', 'requirements', 'apply']);
    expect(a.grouping.groupOf).toEqual({ offer: 'job' });
    const b = moveAfter(keys, {}, 'apply', null);
    expect(b.keys[0]).toBe('apply');
    expect(b.grouping.groupOf).toEqual({ apply: 'employer' });
  });

  it('the arrow keys go across group boundaries: the first of a group up to the end of the one before, the last down to the start of the next', () => {
    const up = moveBy(keys, {}, 'purpose', -1);
    expect(up.keys).toEqual(['about', 'team', 'purpose', 'responsibilities', 'requirements', 'offer', 'apply']);
    expect(up.grouping.groupOf).toEqual({ purpose: 'employer' });
    const down = moveBy(keys, {}, 'responsibilities', 1);
    expect(down.grouping.groupOf).toEqual({ responsibilities: 'person' });
    expect(down.keys.indexOf('responsibilities')).toBe(down.keys.indexOf('requirements') - 1);
  });

  it('in the job description, which has no group titles, a move is always seen: it changes places with the section next to it', () => {
    const m = moveInReading(keys, {}, 'purpose', -1);
    expect(m.keys).toEqual(['about', 'purpose', 'team', 'responsibilities', 'requirements', 'offer', 'apply']);
    expect(m.grouping.groupOf).toEqual({ purpose: 'employer' });
  });

  it('a group moves as a whole', () => {
    const g = moveGroupBy({}, 'offer', -1);
    expect(grouped(keys, g)).toEqual(['about', 'team', 'purpose', 'responsibilities', 'offer', 'requirements', 'apply']);
  });
});
