import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { addTranslation, applyTemplate, approveSection, chooseStyle, goOn, hireAgain, keepForAll, leavePoint, NEXT_QUESTION, publishBlock, sendChat, setJobLang, setPace, settleQuestion, startJob, unparkPart } from '../../components/employer-demo/actions';
import { applyAiTurn, type OpenTarget } from '../../components/employer-demo/aiActions';
import { contextFor, resetAi } from '../../components/employer-demo/ai';
import { inOutlineOrder, outlineOrder } from '../../components/employer-demo/engine';
import { nextStep, type Step } from '../../components/employer-demo/flow';
import { grouped, groupingFrom, moveAfter, moveBy, moveGroupBy, moveInReading } from '../../components/employer-demo/outline';
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
