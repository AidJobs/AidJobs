import { beforeEach, describe, expect, it } from '@jest/globals';
import { changeWithUndo, getState, resetDemo, update } from '../../components/employer-demo/store';
import { chatNote, editSection, sendChat, setFacts, setPart, startJob } from '../../components/employer-demo/actions';
import { currentPart, partsOf, sectionOf, sectionPart } from '../../components/employer-demo/parts';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const lines = (id: string, key: string) => job(id).sections.find((x) => x.key === key)?.lines;

beforeEach(() => {
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
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

  it('a question waiting for an answer stays open after a note or a reply from the window', () => {
    const id = startJob('We are hiring a Nutrition Officer');
    expect(job(id).chat.at(-1)?.ask).toBe('place');
    editSection(id, job(id).tags[1], 'My own words', true);
    expect(job(id).chat.at(-1)?.ask).toBe('place');
    chatNote(id, 'show the preview', 'The preview is open.');
    expect(job(id).chat.at(-1)?.ask).toBe('place');
  });
});
