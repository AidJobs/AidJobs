/**
 * U-3 Step A (20 November 2026): About us / Project display, intake-only Save, project yes, paste draft.
 * Accept Undo / auto-approve is Step B — not covered here.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { applyTemplate, editSection, sendChat, startJob, toggleSection } from '../../components/employer-demo/actions';
import { resetAi } from '../../components/employer-demo/ai';
import { acceptPageDraft, extractDraft, savePageFieldText, setPageIntake, showPageDraft } from '../../components/employer-demo/context';
import { draftFromPage } from '../../components/employer-demo/pages';
import { getState, resetDemo, update } from '../../components/employer-demo/store';
import type { OpenTarget } from '../../components/employer-demo/aiActions';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const sec = (id: string, key: string) => job(id).sections.find((x) => x.key === key)!;
const open = jest.fn((_t: OpenTarget) => undefined);

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  resetAi('off');
  update((s) => ({ ...s, signedIn: true }));
});

describe('U-3 Step A: About us / Project Save and paste', () => {
  it('Background keeps parent lines and the project sub; intake stays empty after Accept (not a second body copy)', () => {
    if (!job('job-comms').tags.includes('background')) toggleSection('job-comms', 'background');
    editSection('job-comms', 'background', 'The country office has run water work in Turkana since 2015.');
    setPageIntake('job-comms', 'project', 'Dirty intake that must not mirror the body.');
    showPageDraft('job-comms', { kind: 'project', lines: ['The Clean Water project repairs 40 water points.'], used: 'x', missing: '', source: 'the project page', social: [] });
    acceptPageDraft('job-comms');
    expect(sec('job-comms', 'background').lines).toEqual(['The country office has run water work in Turkana since 2015.']);
    expect(sec('job-comms', 'background').subs?.map((x) => [x.title, x.lines])).toEqual([['About the project', ['The Clean Water project repairs 40 water points.']]]);
    expect(job('job-comms').pageIntake?.project).toBeUndefined();
  });

  it('Project Save on a renamed brief does not rename and does not replace parent lines', () => {
    if (!job('job-comms').tags.includes('background')) toggleSection('job-comms', 'background');
    editSection('job-comms', 'background', 'Office background stays.', false, { title: 'Project brief' });
    expect(sec('job-comms', 'background').title).toBe('Project brief');
    savePageFieldText('job-comms', 'project', '• Clean water points\n• Two districts');
    expect(sec('job-comms', 'background').title).toBe('Project brief');
    expect(sec('job-comms', 'background').lines).toEqual(['Office background stays.']);
    expect(sec('job-comms', 'background').subs?.map((x) => [x.title, x.lines])).toEqual([
      [
        'About the project',
        ['- Clean water points', '- Two districts'],
      ],
    ]);
    expect(job('job-comms').pageIntake?.project).toBeUndefined();
  });

  it('yes on About with an organisation About still reaches project; yes on project does not skip; Skip for now still does', () => {
    update((s) => ({ ...s, org: { ...s.org, about: 'Riverstone Aid works with communities across East Africa.' } }));
    const id = startJob('We are hiring a Nutrition Officer', undefined, [], true);
    applyTemplate(id, job(id).format);
    expect(job(id).setup).toBe('about');
    sendChat(id, 'yes');
    expect(job(id).setup).toBe('project');
    setPageIntake(id, 'project', 'Paste that must stay while yes is ignored');
    sendChat(id, 'yes');
    expect(job(id).setup).toBe('project');
    expect(job(id).pageIntake?.project).toBe('Paste that must stay while yes is ignored');
    sendChat(id, 'Skip for now');
    expect(job(id).setup).toBe('style');
    expect(job(id).pageIntake?.project).toBeUndefined();
  });

  it('extractDraft stays strict; a bullet paste still drafts via you told us', async () => {
    expect(extractDraft('Too short.\nNo sentences here')).toEqual([]);
    await draftFromPage('job-comms', 'about', '• First point\n• Second point', 'you told us', [], open);
    expect(job('job-comms').pageDraft?.lines).toEqual(['- First point', '- Second point']);
    expect(job('job-comms').pageDraft?.used).toMatch(/as you wrote it/i);
  });

  it('a dirty intake is cleared on Accept so it cannot overwrite the accepted draft on a later Save', () => {
    setPageIntake('job-comms', 'about', 'Stale typing that must not land on Save after Accept');
    showPageDraft('job-comms', { kind: 'about', lines: ['Accepted About us from the page.'], used: 'x', missing: '', source: 'your website', social: [] });
    acceptPageDraft('job-comms');
    expect(sec('job-comms', 'about').lines).toEqual(['Accepted About us from the page.']);
    expect(job('job-comms').pageIntake?.about).toBeUndefined();
  });
});
