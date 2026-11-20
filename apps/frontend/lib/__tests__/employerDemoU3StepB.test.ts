/**
 * U-3 Step B (20 November 2026): Accept does not auto-approve; Undo restores pack and the draft card (not naive stepped/afterChange).
 * Sub-insert beside Background stays (round-review test).
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { editSection, toggleSection, undoStep } from '../../components/employer-demo/actions';
import { acceptPageDraft, showPageDraft } from '../../components/employer-demo/context';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const sec = (id: string, key: string) => job(id).sections.find((x) => x.key === key)!;

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
});

describe('U-3 Step B: Accept Undo and no auto-approve', () => {
  it('Accept does not mark the section approved; Undo restores pack, body, and the draft card', () => {
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) =>
        j.id === 'job-comms'
          ? {
              ...j,
              walk: { pace: 'step', settled: [], approved: [], asked: {} },
              pack: { about: { text: 'Old about.', source: 'you told us' } },
            }
          : j,
      ),
    }));
    const draft = { kind: 'about' as const, lines: ['Accepted About us from the page.'], used: 'x', missing: '', source: 'your website' as const, social: [] as string[] };
    showPageDraft('job-comms', draft);
    acceptPageDraft('job-comms');
    expect(job('job-comms').walk?.approved).not.toContain('about');
    expect(job('job-comms').pack?.about).toMatchObject({ text: 'Accepted About us from the page.', source: 'your website' });
    expect(sec('job-comms', 'about').lines).toEqual(['Accepted About us from the page.']);
    expect(job('job-comms').pageDraft).toBeUndefined();
    expect(job('job-comms').undoStep).toMatchObject({ text: 'About us from your website', tab: 'doc', keys: ['about'] });
    expect(job('job-comms').undoStep?.pageDraft).toMatchObject(draft);
    expect(job('job-comms').undoStep?.before.pack?.about).toMatchObject({ text: 'Old about.' });

    undoStep('job-comms');
    expect(job('job-comms').pack?.about).toMatchObject({ text: 'Old about.', source: 'you told us' });
    expect(sec('job-comms', 'about').lines.join('\n')).not.toContain('Accepted About us from the page.');
    expect(job('job-comms').pageDraft).toMatchObject(draft);
    expect(job('job-comms').undoStep).toBeUndefined();
  });

  it('Accept beside Background still inserts About the project as a sub; Undo restores parent-only Background and clears pack.project', () => {
    if (!job('job-comms').tags.includes('background')) toggleSection('job-comms', 'background');
    editSection('job-comms', 'background', 'The country office has run water work in Turkana since 2015.');
    showPageDraft('job-comms', { kind: 'project', lines: ['The Clean Water project repairs 40 water points.'], used: 'x', missing: '', source: 'the project page', social: [] });
    acceptPageDraft('job-comms');
    expect(job('job-comms').walk?.approved ?? []).not.toContain('background');
    expect(sec('job-comms', 'background').lines).toEqual(['The country office has run water work in Turkana since 2015.']);
    expect(sec('job-comms', 'background').subs?.map((x) => [x.title, x.lines])).toEqual([['About the project', ['The Clean Water project repairs 40 water points.']]]);
    expect(job('job-comms').pack?.project?.text).toBe('The Clean Water project repairs 40 water points.');

    undoStep('job-comms');
    expect(sec('job-comms', 'background').lines).toEqual(['The country office has run water work in Turkana since 2015.']);
    expect(sec('job-comms', 'background').subs).toBeUndefined();
    expect(job('job-comms').pack?.project).toBeUndefined();
    expect(job('job-comms').pageDraft?.kind).toBe('project');
  });
});
