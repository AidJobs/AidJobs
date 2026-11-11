import { beforeEach, describe, expect, it } from '@jest/globals';
import { changeWithUndo, getState, normalise, resetDemo, update } from '../../components/employer-demo/store';
import {
  answerFact,
  applyOrgSdgs,
  applyTemplate,
  approveSection,
  chatNote,
  chooseStyle,
  DOC_QUICK,
  editSection,
  formatOf,
  LINK_REPLY,
  sendChat,
  setFacts,
  setPace,
  setPart,
  setSdgs,
  settleAsk,
  startFromDocument,
  startJob,
  writeSections,
} from '../../components/employer-demo/actions';
import { currentPart, lineFit, onLine, partsOf, sectionOf, sectionPart } from '../../components/employer-demo/parts';
import { addDays, COMMITMENTS, commitmentText } from '../../components/employer-demo/engine';
import { nextStep } from '../../components/employer-demo/flow';
import { workingDay } from '../../components/employer-demo/market';
import { PACE_QUICK } from '../../components/employer-demo/walkChat';
import { describeStyle, inferSdgs, proposedStyle, sdgLead, sdgsOf, styleFromReply, toneOf } from '../../components/employer-demo/setup';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const lines = (id: string, key: string) => job(id).sections.find((x) => x.key === key)?.lines;

beforeEach(() => {
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
});

describe("SDGs when no goal is clear (the user's decision, 11 November 2026)", () => {
  it('shows none, never falls back silently, and uses the organisation\'s goals only when chosen, saying so on the job page', () => {
    const id = startJob('We are hiring a Finance Officer in Juba, South Sudan');
    expect(sdgsOf(job(id))).toEqual([]);
    expect(sdgLead(job(id), getState().org.name)).toBe('This role contributes to');
    applyOrgSdgs(id);
    expect(job(id)).toMatchObject({ sdgs: [3, 6, 16], sdgsFrom: 'org' });
    expect(sdgLead(job(id), getState().org.name)).toBe('Riverstone Aid works towards');
    setSdgs(id, [8]);
    expect(job(id).sdgsFrom).toBeUndefined();
    expect(sdgLead(job(id), getState().org.name)).toBe('This role contributes to');
  });

  it('goals read from the role are introduced as the role\'s', () => {
    const id = startJob('We are hiring a WASH Officer in Juba');
    expect(sdgsOf(job(id)).length).toBeGreaterThan(0);
    expect(sdgLead(job(id), getState().org.name)).toBe('This role contributes to');
  });
});

describe('the window: the chat follows the part in view', () => {
  it('a request that names no section changes only the section in view', () => {
    const long = job('job-comms').sections.filter((x) => x.lines.filter((l) => l.startsWith('- ')).length > 3);
    expect(long.length).toBeGreaterThan(1);
    const [focus, other] = long;
    const otherBefore = lines('job-comms', other.key);
    sendChat('job-comms', 'shorter', focus.key);
    expect(lines('job-comms', focus.key)!.filter((l) => l.startsWith('- ')).length).toBe(3);
    expect(lines('job-comms', other.key)).toEqual(otherBefore);
  });

  it('without a section in view, the same request still shortens every longer section, as before', () => {
    const long = job('job-comms').sections.filter((x) => x.lines.filter((l) => l.startsWith('- ')).length > 3).map((x) => x.key);
    sendChat('job-comms', 'shorter');
    for (const k of long) expect(lines('job-comms', k)!.filter((l) => l.startsWith('- ')).length).toBe(3);
  });

  it('a section named in the message wins over the one in view', () => {
    const tags = job('job-comms').tags;
    const focus = tags.find((k) => k !== 'responsibilities')!;
    const before = lines('job-comms', focus);
    sendChat('job-comms', 'make the responsibilities longer', focus);
    expect(job('job-comms').lastChange?.keys).toEqual(['responsibilities']);
    expect(lines('job-comms', focus)).toEqual(before);
  });

  it('a sentence is added to the section in view', () => {
    const focus = job('job-comms').tags.find((k) => k !== 'purpose' && k !== 'apply')!;
    sendChat('job-comms', 'The post holder travels to field sites twice a month', focus);
    expect(lines('job-comms', focus)?.at(-1)).toBe('The post holder travels to field sites twice a month.');
  });
});

describe('the window: the progress line', () => {
  it('lists the JD outline, the sections in the outline order, then details, fixed text, check, and publish', () => {
    const j = job('job-comms');
    const keys = partsOf(j, getState()).map((p) => p.key);
    expect(keys).toEqual(['outline', ...j.tags.map(sectionPart), 'details', 'fixed', 'check', 'publish']);
    expect(sectionOf('s:apply')).toBe('apply');
    expect(sectionOf('details')).toBeNull();
  });

  it('marks a section with a placeholder, and the details, as still to do until the fact is given', () => {
    const id = startJob('We are hiring a Nutrition Officer');
    const parts = () => partsOf(job(id), getState());
    expect(parts().find((p) => p.key === 'details')?.done).toBe(false);
    expect(parts().some((p) => p.section && !p.done)).toBe(true);
    expect(currentPart(job(id), getState())).toBe('details');
    setFacts(id, { location: 'Juba, South Sudan', country: 'South Sudan', deadline: '2026-12-30', contract: 'Fixed-term' });
    expect(parts().filter((p) => p.section).every((p) => p.done)).toBe(true);
    expect(parts().find((p) => p.key === 'details')?.done).toBe(true);
  });

  it('the part opened last is kept with the job, and moving around leaves an offered undo in place', () => {
    changeWithUndo('Changed', (s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, facts: { ...j.facts, positions: '2' } } : j)) }));
    setPart('job-comms', 'fixed');
    expect(job('job-comms').part).toBe('fixed');
    expect(getState().notice?.undo).toBeTruthy();
    expect(currentPart(job('job-comms'), getState())).toBe('fixed');
    expect(localStorage.getItem('aidjobs.employerDemo.v4')).toContain('"part":"fixed"');
  });
});

describe('the window: hand edits and its own replies', () => {
  it('the chat notices a hand edit made in the window, and the edited section becomes the part in view', () => {
    const key = job('job-comms').tags[1];
    editSection('job-comms', key, 'My own words', true);
    expect(job('job-comms').part).toBe(sectionPart(key));
    expect(job('job-comms').chat.some((m) => m.from === 'ai' && m.text.includes('by hand'))).toBe(true);
  });

  it('a hand edit in the earlier workspace adds nothing to the chat', () => {
    const before = job('job-comms').chat.length;
    editSection('job-comms', job('job-comms').tags[1], 'My own words');
    expect(job('job-comms').chat.length).toBe(before);
    expect(job('job-comms').part).toBeUndefined();
  });

  it('a fact the chat asked for and then set by hand: the chat says so and asks the next question', () => {
    const id = startJob('We are hiring a Nutrition Officer');
    expect(job(id).chat.at(-1)?.ask).toBe('place');
    settleAsk(id);
    expect(job(id).chat.at(-1)?.ask).toBe('place');
    setFacts(id, { location: 'Juba, South Sudan', country: 'South Sudan' });
    settleAsk(id);
    expect(job(id).chat.at(-2)?.text).toBe('You set the duty station by hand.');
    expect(job(id).chat.at(-1)?.ask).toBe('deadline');
  });

  it('a question waiting for an answer stays open after a note or a reply from the window', () => {
    const id = startJob('We are hiring a Nutrition Officer');
    expect(job(id).chat.at(-1)?.ask).toBe('place');
    editSection(id, job(id).tags[1], 'My own words', true);
    expect(job(id).chat.at(-1)?.ask).toBe('place');
    chatNote(id, 'show the preview', 'The preview is open.');
    expect(job(id).chat.at(-1)?.ask).toBe('place');
  });
});

describe('the window, revised: the template comes first, then the style, then the writing', () => {
  it('a job started in the window waits for its template: nothing is written and no fact is asked yet', () => {
    const id = startJob('We are hiring a Nutrition Officer, 12-month fixed-term', undefined, [], true);
    expect(job(id).setup).toBe('template');
    expect(job(id).sections).toEqual([]);
    expect(job(id).chat.at(-1)?.text).toContain('First, the template');
    expect(job(id).chat.at(-1)?.quick?.[0]).toMatch(/^Use /);
    expect(job(id).chat.some((m) => m.ask)).toBe(false);
    expect(currentPart(job(id), getState())).toBe('outline');
    expect(partsOf(job(id), getState())[0].label).toBe(formatOf(getState(), job(id).format).label);
    sendChat(id, 'it is based in Juba');
    expect(job(id).setup).toBe('template');
    expect(job(id).chat.some((m) => m.ask)).toBe(false);
  });

  it('the template is named in plain words, offered with others, or accepted with a yes; then the style is asked', () => {
    const others = startJob('We are hiring a Nutrition Officer', undefined, [], true);
    sendChat(others, 'show me some others');
    expect(job(others).setup).toBe('template');
    expect(job(others).chat.at(-1)?.quick?.length).toBe(3);
    const un = getState().formats.find((f) => f.label.startsWith('UN Secretariat'))!;
    sendChat(others, 'use the UN Secretariat one');
    expect(job(others).format).toBe(un.key);
    expect(job(others).setup).toBe('style');
    expect(job(others).chat.at(-1)?.text).toContain('How should it sound?');
    const yes = startJob('We are hiring a Nutrition Officer', undefined, [], true);
    sendChat(yes, 'yes please');
    expect(job(yes).setup).toBe('style');
  });

  it('the overview, then the style from any reply; then the pace, remembered for the next job; keeping the style fills in the organisation', () => {
    const id = startJob('We are hiring a Nutrition Officer', undefined, [], true);
    applyTemplate(id, job(id).format);
    expect(job(id).chat.at(-1)?.text).toMatch(/^\*\*Riverstone format\*\* it is: \d+ sections, about \d+ words, your own headings in your order, each written to the depth of an INGO's job descriptions\. How should it sound\?/);
    sendChat(id, 'more formal please, and short sentences');
    expect(job(id).setup).toBe('pace');
    expect(job(id).style).toContain('Formal');
    expect(job(id).style).toContain('Short sentences');
    expect(job(id).style).not.toContain('Warm');
    expect(job(id).tone).toBe('formal');
    expect(job(id).sections).toEqual([]);
    expect(job(id).chat.at(-2)?.quick).toEqual(['Keep it for all jobs', 'Just this job']);
    expect(job(id).chat.at(-1)?.quick).toEqual(PACE_QUICK);
    sendChat(id, 'Keep it for all jobs');
    expect(getState().org.voice).toEqual(job(id).style);
    expect(getState().org.styleKept).toBe(true);
    expect(job(id).chat.at(-1)?.quick).toEqual(PACE_QUICK);
    sendChat(id, 'One section at a time');
    expect(job(id).setup).toBeUndefined();
    expect(getState().pace).toBe('step');
    expect(job(id).sections.map((x) => x.key)).toEqual(['about', 'apply']);
    expect(job(id).chat.at(-1)).toMatchObject({ text: 'Before I write **About us**: Where is the job based?', ask: 'place', step: 'ask:place' });
    const next = startJob('We are hiring a Health Officer', undefined, [], true);
    applyTemplate(next, job(next).format);
    chooseStyle(next, proposedStyle(getState()));
    expect(job(next).setup).toBeUndefined();
    expect(job(next).walk?.pace).toBe('step');
    expect(job(next).chat.some((m) => m.text.includes('One section at a time, as last time'))).toBe(true);
    expect(job(next).chat.some((m) => m.quick?.includes('Keep it for all jobs'))).toBe(false);
  });

  it('a template the user built is applied with exactly its sections', () => {
    const id = startJob('We are hiring a Nutrition Officer', undefined, [], true);
    applyTemplate(id, job(id).format, undefined, ['apply', 'about', 'responsibilities']);
    expect(job(id).tags).toEqual(['about', 'responsibilities', 'apply']);
  });

  it('reads the style in words, and turns it into the writer’s tone', () => {
    expect(describeStyle(['Warm', 'Plain English', 'Speaks as "we"', 'Uses "you"'])).toBe('warmly, in plain English and speaking as "we" to "you"');
    expect(styleFromReply(['Warm', 'Plain English'], 'make it more professional')).toEqual(['Formal', 'Plain English']);
    expect(toneOf(['Plain English'])).toBe('plain');
    expect(toneOf(['Warm', 'Formal'])).toBe('formal');
  });
});

describe('a new employer, in order (round 7, phase 2): the rules walk steps 3 to 7', () => {
  const ask = (id: string) => job(id).chat.at(-1)?.ask;
  const step = (id: string) => nextStep(job(id), getState());
  const ready = (text: string, pace: 'step' | 'all') => {
    const id = startJob(text, undefined, [], true);
    applyTemplate(id, job(id).format);
    chooseStyle(id, ['Warm']);
    setPace(id, pace);
    return id;
  };

  it('one section at a time: each fact just before its section, then the section written and approved, in order', () => {
    const id = ready("We're hiring a Nutrition Officer in Juba, fixed-term", 'step');
    const offer = job(id).chat.find((m) => m.step === 'setup:template');
    expect(offer?.text).toContain('7 sections for this job, with **Conditions** (the duty station has security conditions), about 900 words');
    expect(offer?.text).toContain('similar nutrition roles are on AidJobs');
    expect(offer?.quick).toEqual(['Use Riverstone format', 'Use UN Secretariat format', 'Use UN agency format', 'See all formats', 'Create my own', 'Use one of my job descriptions']);
    expect(job(id).tags).toEqual(['about', 'purpose', 'responsibilities', 'requirements', 'offer', 'conditions', 'apply']);
    expect(ask(id)).toBe('grade');
    sendChat(id, 'no grade');
    expect(step(id)).toEqual({ kind: 'approve', section: 'about' });
    expect(job(id).chat.at(-1)?.text).toBe('**About us** comes from your organisation profile, word for word. Good as it is?');
    sendChat(id, 'Good, next');
    expect(job(id).sections.map((x) => x.key)).toEqual(['about', 'purpose', 'apply']);
    expect(job(id).chat.at(-1)?.text).toBe('Here is **The role**. Good, or change something?');
    expect(partsOf(job(id), getState()).find((p) => p.key === 's:purpose')?.done).toBe(false);
    sendChat(id, 'The post holder travels to field sites twice a month', 'purpose');
    expect(job(id).chat.at(-1)?.text).toBe('**The role**: good now, or change something else?');
    approveSection(id, 'purpose');
    expect(partsOf(job(id), getState()).find((p) => p.key === 's:purpose')?.done).toBe(true);
    expect(job(id).chat.at(-1)?.text).toBe('Here is **What you will do**. Good, or change something?');
    sendChat(id, 'looks good');
    expect(ask(id)).toBe('eligibility');
    expect(job(id).chat.at(-1)?.text).toMatch(/^Before I write \*\*What you will bring\*\*: Who can apply/);
    sendChat(id, 'nationals only');
    expect(job(id).facts.eligibility).toBe('nationals');
    expect(ask(id)).toBe('languages');
    answerFact(id, { languages: ['English', 'Arabic'] }, 'English and Arabic', 'languages');
    expect(ask(id)).toBe('safeguarding');
    sendChat(id, 'medium');
    expect(step(id)).toEqual({ kind: 'approve', section: 'requirements' });
    sendChat(id, 'ok');
    expect(ask(id)).toBe('salary');
    sendChat(id, "don't show it");
    expect(job(id).facts.salaryMode).toBe('hidden');
    sendChat(id, 'Good, next');
    sendChat(id, 'Good, next');
    expect(ask(id)).toBe('deadline');
    answerFact(id, { deadline: addDays(getState().today, 30) }, 'in a month', 'deadline');
    expect(ask(id)).toBe('method');
    sendChat(id, 'by email');
    expect(job(id).apply.method).toBe('email');
    expect(step(id)).toEqual({ kind: 'approve', section: 'apply' });
    sendChat(id, 'Good, next');
    expect(step(id)).toEqual({ kind: 'details' });
    sendChat(id, '2 positions, starting in January');
    expect(job(id).facts).toMatchObject({ positions: '2', startDate: 'January' });
    expect(step(id)).toEqual({ kind: 'fixed' });
    expect(job(id).chat.at(-1)?.text).toMatch(/^Then your organisation's fixed text, added word for word from your settings: Safeguarding, PSEA/);
    sendChat(id, 'leave out the misconduct disclosure scheme');
    expect(job(id).commitments).not.toContain('mds');
    expect(step(id)?.kind).toBe('suggest');
    sendChat(id, 'No, thanks');
    for (let i = 0; i < 10 && step(id)?.kind === 'check'; i++) sendChat(id, 'Leave it');
    expect(step(id)).toEqual({ kind: 'done' });
    expect(job(id).chat.at(-1)?.step).toBe('done');
    expect(partsOf(job(id), getState()).filter((p) => p.key !== 'publish').every((p) => p.done)).toBe(true);
    sendChat(id, 'thanks');
    expect(job(id).chat.filter((m) => m.step === 'done')).toHaveLength(1);
  });

  it('write it all: the whole draft at once with placeholders, then each fact just before its section is approved; "approve the rest"', () => {
    const id = ready("We're hiring a Nutrition Officer, fixed-term", 'all');
    expect(job(id).tags.every((k) => job(id).sections.some((x) => x.key === k))).toBe(true);
    expect(JSON.stringify(job(id).sections)).toContain('[Duty station]');
    expect(job(id).chat.at(-1)).toMatchObject({ ask: 'place' });
    expect(job(id).chat.at(-1)?.text).toMatch(/^Here is the whole draft, written warmly\. Let's go through it\. Before you approve \*\*About us\*\*: Where is the job based\?/);
    sendChat(id, 'Goma');
    expect(JSON.stringify(job(id).sections)).not.toContain('[Duty station]');
    sendChat(id, 'no grade');
    expect(job(id).chat.at(-1)?.text).toBe('**About us** comes from your organisation profile, word for word. Good as it is?');
    expect(job(id).chat.at(-1)?.quick).toEqual(['Good, next', 'All good, approve the rest']);
    sendChat(id, 'All good, approve the rest');
    expect(job(id).walk?.approved).toEqual(job(id).tags);
    expect(ask(id)).toBe('eligibility');
    expect(job(id).chat.at(-1)?.text).toMatch(/^For the listing: Who can apply/);
  });

  it('a fact changed after its section was approved: the changed lines are shown, and go in only with a yes', () => {
    const id = ready("We're hiring a Nutrition Officer in Juba, fixed-term, no grade", 'step');
    sendChat(id, 'no grade');
    sendChat(id, 'Good, next');
    sendChat(id, 'Good, next');
    expect(job(id).walk?.approved).toEqual(['about', 'purpose']);
    const before = job(id).sections.find((x) => x.key === 'purpose')!.lines;
    expect(before.join(' ')).toContain('Juba');
    setFacts(id, { location: 'Goma, DR Congo', country: 'DR Congo', iso: 'CD' });
    expect(job(id).sections.find((x) => x.key === 'purpose')!.lines).toEqual(before);
    expect(step(id)).toEqual({ kind: 'change' });
    expect(job(id).chat.at(-1)?.text).toMatch(/^You changed the duty station, and a section you approved mentions it\.\nIn \*\*The role\*\*: “.*Juba.*” becomes “.*Goma.*”\.\nChange it there too\?$/);
    sendChat(id, 'Yes, change it');
    expect(job(id).sections.find((x) => x.key === 'purpose')!.lines.join(' ')).toContain('Goma');
    expect(step(id)).toEqual({ kind: 'approve', section: 'responsibilities' });
  });

  it('text written by the AI or by hand takes the new fact in place of the old', () => {
    const id = ready("We're hiring a Nutrition Officer in Juba, fixed-term", 'step');
    writeSections(id, [{ key: 'purpose', lines: ['Based in Juba, the post holder runs screening.'] }], 'AI');
    setFacts(id, { location: 'Goma, DR Congo', country: 'DR Congo', iso: 'CD' });
    expect(job(id).sections.find((x) => x.key === 'purpose')!.lines).toEqual(['Based in Goma, the post holder runs screening.']);
  });

  it('the basic check, point by point: a genuine requirement with its reason, new wording, or left as it is', () => {
    const id = ready("We're hiring a Nutrition Officer in Juba, fixed-term", 'all');
    editSection(id, 'requirements', 'Essential:\n- A young graduate in nutrition\n- Fluent in Arabic, a native speaker preferred');
    setFacts(id, { deadline: workingDay(addDays(getState().today, 30), job(id).facts.iso) });
    update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, approved: [...j.tags], settled: ['grade', 'eligibility', 'languages', 'safeguarding', 'salary', 'method', 'details', 'fixed', 'suggest'] } } : j)) }));
    chatNote(id, 'show the preview', 'The preview is open.');
    const first = step(id);
    expect(first?.kind).toBe('check');
    expect(job(id).chat.at(-1)?.text).toMatch(/^From the basic check: \*\*“young” in What you will bring\*\*\./);
    expect(job(id).chat.at(-1)?.quick).toEqual(["It's a genuine requirement", 'Leave it']);
    sendChat(id, "It's a genuine requirement");
    expect(job(id).chat.at(-1)?.text).toBe('In a line, why is “young” a genuine requirement of this job?');
    sendChat(id, 'A graduate scheme for people under 25');
    expect(Object.values(job(id).genuine)).toEqual(['A graduate scheme for people under 25']);
    expect(job(id).chat.at(-1)?.text).toMatch(/^From the basic check: \*\*“native speaker”/);
    sendChat(id, 'Fluent in Arabic');
    expect(job(id).sections.find((x) => x.key === 'requirements')?.lines).toContain('- Fluent in Arabic');
    for (let i = 0; i < 10 && step(id)?.kind === 'check'; i++) sendChat(id, 'Leave it');
    expect(step(id)).toEqual({ kind: 'done' });
  });

  it("a role with no clear goal: step 6 offers the organisation's goals, none, or the dialog, so they need not be found in Details", () => {
    const toSdgs = (id: string) => {
      setFacts(id, { deadline: workingDay(addDays(getState().today, 30), job(id).facts.iso) });
      update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, approved: [...j.tags], settled: ['grade', 'eligibility', 'languages', 'safeguarding', 'salary', 'method', 'details'] } } : j)) }));
      chatNote(id, 'show the preview', 'The preview is open.');
    };
    const id = ready("We're hiring a Communications Intern in Kampala", 'all');
    expect(inferSdgs(job(id))).toEqual([]);
    toSdgs(id);
    expect(step(id)).toEqual({ kind: 'sdgs' });
    expect(job(id).chat.at(-1)).toMatchObject({
      text: "No SDG is clear from this role. Shall I use your organisation's goals (SDG 3, 6, 16)? The job page then says Riverstone Aid works towards them.",
      quick: ["Use your organisation's goals (SDG 3, 6, 16)", 'Choose them myself', 'No SDGs'],
    });
    sendChat(id, "Use your organisation's goals (SDG 3, 6, 16)");
    expect(job(id)).toMatchObject({ sdgs: [3, 6, 16], sdgsFrom: 'org' });
    expect(step(id)).toEqual({ kind: 'fixed' });

    const none = ready("We're hiring a Communications Intern in Kampala", 'all');
    toSdgs(none);
    sendChat(none, 'No SDGs');
    expect(sdgsOf(job(none))).toEqual([]);
    expect(step(none)).toEqual({ kind: 'fixed' });

    const own = ready("We're hiring a Communications Intern in Kampala", 'all');
    toSdgs(own);
    sendChat(own, 'Choose them myself');
    expect(step(own)).toEqual({ kind: 'sdgs' });
    expect(job(own).chat.at(-1)?.step).toBe('sdgs');
    setSdgs(own, [17]);
    expect(step(own)).toEqual({ kind: 'fixed' });

    const clear = ready("We're hiring a WASH Officer in Kampala", 'all');
    toSdgs(clear);
    expect(step(clear)?.kind).not.toBe('sdgs');
  });

  it('a placeholder left by the AI is a check point, filled with the value from the answer', () => {
    const id = ready("We're hiring a Nutrition Officer in Juba, fixed-term", 'all');
    writeSections(id, [{ key: 'purpose', lines: ['The post holder runs screening in Juba and reports to [Reports to].'] }], 'AI');
    setFacts(id, { deadline: workingDay(addDays(getState().today, 30), job(id).facts.iso) });
    update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, approved: [...j.tags], settled: ['grade', 'eligibility', 'languages', 'safeguarding', 'salary', 'method', 'details', 'fixed', 'suggest'] } } : j)) }));
    chatNote(id, 'show the preview', 'The preview is open.');
    expect(step(id)).toMatchObject({ kind: 'check', point: { key: 'fill-purpose' } });
    sendChat(id, 'It reports to the Nutrition Programme Manager.');
    expect(job(id).sections.find((x) => x.key === 'purpose')?.lines).toEqual(['The post holder runs screening in Juba and reports to the Nutrition Programme Manager.']);
  });

  it('a link is not read; a pasted job description is used by its headings or with its wording', () => {
    const id = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    sendChat(id, 'https://careers.example.org/jobs/123');
    expect(job(id).chat.at(-1)?.text).toBe(LINK_REPLY);
    const doc = `ABOUT THE ROLE\nThe officer leads nutrition screening in Juba with two partners and community volunteers across the county.\n\nRESPONSIBILITIES\n- Lead screening\n- Train volunteers\n- Report monthly\n\nHOW TO APPLY\nApply online with a CV and a letter before the closing date, through the careers page.`;
    sendChat(id, doc);
    expect(job(id).chat.at(-1)?.quick).toEqual(DOC_QUICK);
    sendChat(id, 'Its wording too');
    expect(job(id).setup).toBe('style');
    expect(job(id).sections.find((x) => x.key === 'responsibilities')).toMatchObject({ lines: ['- Lead screening', '- Train volunteers', '- Report monthly'], edited: true });
    chooseStyle(id, ['Warm']);
    expect(job(id).setup).toBeUndefined();
    expect(job(id).walk?.pace).toBe('all');
    const fromDoc = startFromDocument(doc)!;
    expect(job(fromDoc).chat.at(-1)?.text).toMatch(/^I read 3 sections from your job description/);
    sendChat(fromDoc, 'Only its headings and order');
    expect(job(fromDoc).sections).toEqual([]);
    expect(formatOf(getState(), job(fromDoc).format).order.map((o) => o.key)).toEqual(['purpose', 'responsibilities', 'apply']);
  });

  it('a job saved by an earlier version while choosing its template is brought forward; jobs already written are left as they are', () => {
    const s = getState();
    const old = { ...s.jobs[0], id: 'old-window', setup: 'style' as const, walk: undefined };
    const out = normalise({ ...s, jobs: [old, ...s.jobs] });
    expect(out.jobs[0].walk).toEqual({ approved: [], settled: [] });
    expect(out.jobs.slice(1).every((j) => !j.walk)).toBe(true);
  });
});

describe('the window, revised: SDGs on every job where they can be identified', () => {
  it('reads one main goal and at most two more from the title or the sector, and none when no goal is clear', () => {
    const wash = startJob('We are hiring a WASH Officer in Juba');
    expect(inferSdgs(job(wash))).toEqual([6, 3]);
    const edu = startJob('We are hiring an Education Specialist in Kampala');
    expect(inferSdgs(job(edu))).toEqual([4]);
    const fin = startJob('We are hiring a Finance Officer in Kampala');
    expect(inferSdgs(job(fin))).toEqual([]);
    setSdgs(fin, [17, 1, 2, 3]);
    expect(sdgsOf(job(fin))).toEqual([17, 1, 2]);
    setSdgs(fin, null);
    expect(sdgsOf(job(fin))).toEqual([]);
  });
});

describe('the window, revised: "+N" keeps every part within reach', () => {
  it('shows the parts that fit, keeps room for +N, and keeps the part in view on the line', () => {
    const parts = partsOf(job('job-comms'), getState());
    expect(lineFit(parts.map(() => 100), 10_000)).toBe(parts.length);
    const fit = lineFit(parts.map(() => 100), 452);
    expect(fit).toBe(4);
    const last = parts[parts.length - 1].key;
    const { shown, more } = onLine(parts, fit, last);
    expect(shown).toHaveLength(4);
    expect(shown.at(-1)?.key).toBe(last);
    expect(shown.length + more.length).toBe(parts.length);
  });
});

describe("ESG: a sector and role family, and a fixed text (the user's decision, 9 November 2026)", () => {
  it('reads an ESG or safeguards role, with its sector and goals, and offers the environmental and social responsibility text', () => {
    const id = startJob('We are hiring an Environmental and Social Safeguards Specialist in Nairobi');
    expect(job(id).family).toBe('esg');
    expect(sdgsOf(job(id))).toEqual([12, 13, 16]);
    expect(job(id).sections.find((x) => x.key === 'responsibilities')?.lines.join(' ')).toContain('environmental and social');
    expect(COMMITMENTS.some((c) => c.key === 'esr')).toBe(true);
    expect(commitmentText('esr', getState().org, job(id).facts).text).toContain('environmental and social impact');
  });
});
