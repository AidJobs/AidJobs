/**
 * FW-2 (22 Nov 2026): No project page must not leave a Project brief `[to confirm]` that blocks Check.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { applyTemplate, sendChat, setPace, startJob, chooseStyle } from '../../components/employer-demo/actions';
import { resetAi } from '../../components/employer-demo/ai';
import { sectionOutlineGaps, sectionPublishBlock } from '../../components/employer-demo/flow';
import { ABOUT_QUICK, PROJECT_QUICK } from '../../components/employer-demo/walkChat';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo('tumaini');
  resetAi('off');
  update((s) => ({ ...s, signedIn: true }));
});

describe('FW-2: No project drops Project brief', () => {
  it('No project page removes background from the outline and sets walk.noProject', () => {
    const id = startJob('Community Health Officer in Kisumu', undefined, [], true);
    applyTemplate(id, 'local-concise');
    expect(job(id).tags.includes('background')).toBe(true);
    sendChat(id, ABOUT_QUICK[0]);
    expect(job(id).setup).toBe('project');
    sendChat(id, PROJECT_QUICK[0]);
    expect(job(id).setup).toBe('style');
    expect(job(id).walk?.noProject).toBe(true);
    expect(job(id).tags.includes('background')).toBe(false);
    expect(job(id).sections.some((x) => x.key === 'background')).toBe(false);
  });

  it('Skip for now keeps Project brief on the outline', () => {
    const id = startJob('Community Health Officer in Kisumu', undefined, [], true);
    applyTemplate(id, 'local-concise');
    sendChat(id, ABOUT_QUICK[0]);
    sendChat(id, PROJECT_QUICK[1]);
    expect(job(id).setup).toBe('style');
    expect(job(id).walk?.noProject).toBeFalsy();
    expect(job(id).tags.includes('background')).toBe(true);
  });

  it('after No project, outline gaps never include Project brief / background', () => {
    const id = startJob('Community Health Officer in Kisumu, fixed-term', undefined, [], true);
    applyTemplate(id, 'local-concise');
    sendChat(id, ABOUT_QUICK[0]);
    sendChat(id, PROJECT_QUICK[0]);
    chooseStyle(id, ['warm', 'we', 'you'], 'Yes, write it that way');
    setPace(id, 'all', 'Write it all, then I\'ll review');
    const j = job(id);
    expect(j.tags.includes('background')).toBe(false);
    expect(sectionOutlineGaps(j).some((g) => g.key === 'background')).toBe(false);
    expect(sectionPublishBlock(j) ?? '').not.toMatch(/Project brief/i);
  });
});
