import { beforeEach, describe, expect, it } from '@jest/globals';
import { changeWithUndo, getState, resetDemo, update } from '../../components/employer-demo/store';
import { applyOrgSdgs, applyTemplate, chatNote, chooseStyle, editSection, formatOf, sendChat, setFacts, setPart, setSdgs, settleAsk, startJob } from '../../components/employer-demo/actions';
import { currentPart, lineFit, onLine, partsOf, sectionOf, sectionPart } from '../../components/employer-demo/parts';
import { COMMITMENTS, commitmentText } from '../../components/employer-demo/engine';
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

  it('the style is taken from any reply; the first draft is written in it, the facts are asked, and keeping it fills in the organisation', () => {
    const id = startJob('We are hiring a Nutrition Officer', undefined, [], true);
    applyTemplate(id, job(id).format);
    sendChat(id, 'more formal please, and short sentences');
    expect(job(id).setup).toBeUndefined();
    expect(job(id).style).toContain('Formal');
    expect(job(id).style).toContain('Short sentences');
    expect(job(id).style).not.toContain('Warm');
    expect(job(id).tone).toBe('formal');
    expect(job(id).sections.length).toBeGreaterThan(2);
    expect(job(id).chat.at(-1)?.ask).toBe('place');
    expect(job(id).chat.at(-2)?.quick).toEqual(['Keep it for all jobs', 'Just this job']);
    sendChat(id, 'Keep it for all jobs');
    expect(getState().org.voice).toEqual(job(id).style);
    expect(getState().org.styleKept).toBe(true);
    const next = startJob('We are hiring a Health Officer', undefined, [], true);
    applyTemplate(next, job(next).format);
    chooseStyle(next, proposedStyle(getState()));
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
