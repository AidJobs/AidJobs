/**
 * R2-P0-3 (21 November 2026): About/Project setup leftovers after U-3 —
 * Use-as-is → pack (R1-03), About yes+paste, Tumaini local-concise path to style.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { applyTemplate, sendChat, startJob } from '../../components/employer-demo/actions';
import { resetAi } from '../../components/employer-demo/ai';
import { KEEP_PROFILE_ABOUT, keepProfileAbout, setPageIntake } from '../../components/employer-demo/context';
import { ABOUT_QUICK, PROJECT_QUICK } from '../../components/employer-demo/walkChat';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  resetAi('off');
  update((s) => ({ ...s, signedIn: true }));
});

describe('R2-P0-3: About/Project setup leftovers', () => {
  it('Use our About us as it is sets pack.about; Local NGO concise gets no orphan About section', () => {
    resetDemo('tumaini');
    update((s) => ({ ...s, signedIn: true }));
    const id = startJob('WASH Coordinator in Kisumu, Kenya', undefined, [], true);
    applyTemplate(id, 'local-concise');
    expect(job(id).setup).toBe('about');
    expect(job(id).tags.includes('about')).toBe(false);
    sendChat(id, ABOUT_QUICK[0]);
    expect(job(id).pack?.about?.text).toMatch(/Tumaini/i);
    expect(job(id).pack?.about?.source).toBe('your website');
    expect(job(id).sections.some((x) => x.key === 'about')).toBe(false);
    expect(job(id).setup).toBe('project');
    expect(job(id).chat.some((m) => m.from === 'ai' && /not a separate section/i.test(m.text))).toBe(true);
  });

  it('Tumaini Use as it is then No project page reaches style once', () => {
    resetDemo('tumaini');
    update((s) => ({ ...s, signedIn: true }));
    const id = startJob('WASH Coordinator in Kisumu', undefined, [], true);
    applyTemplate(id, 'local-concise');
    sendChat(id, ABOUT_QUICK[0]);
    expect(job(id).setup).toBe('project');
    sendChat(id, PROJECT_QUICK[0]);
    expect(job(id).setup).toBe('style');
    const aboutPrompts = job(id).chat.filter((m) => m.from === 'ai' && m.step === 'setup:about');
    const projectPrompts = job(id).chat.filter((m) => m.from === 'ai' && m.step === 'setup:project');
    expect(aboutPrompts.length).toBeLessThanOrEqual(1);
    expect(projectPrompts.length).toBeLessThanOrEqual(1);
  });

  it('About-stage yes with paste does not advance or clear intake; Skip still does', () => {
    update((s) => ({ ...s, org: { ...s.org, about: 'Riverstone Aid works with communities across East Africa.' } }));
    const id = startJob('Nutrition Officer', undefined, [], true);
    applyTemplate(id, job(id).format);
    expect(job(id).setup).toBe('about');
    setPageIntake(id, 'about', 'Paste that must stay while yes is ignored');
    sendChat(id, 'yes');
    expect(job(id).setup).toBe('about');
    expect(job(id).pageIntake?.about).toBe('Paste that must stay while yes is ignored');
    sendChat(id, 'Skip for now');
    expect(job(id).setup).toBe('project');
    expect(job(id).pageIntake?.about).toBeUndefined();
  });

  it('yes on About with org About and empty intake still keeps pack and reaches project', () => {
    update((s) => ({ ...s, org: { ...s.org, about: 'Riverstone Aid works with communities across East Africa.' } }));
    const id = startJob('Nutrition Officer', undefined, [], true);
    applyTemplate(id, job(id).format);
    sendChat(id, 'yes');
    expect(job(id).setup).toBe('project');
    expect(job(id).pack?.about?.text).toMatch(/Riverstone Aid/);
  });

  it('keepProfileAbout on a template with about writes the section', () => {
    update((s) => ({ ...s, org: { ...s.org, about: 'We are a sample employer for the demo.' } }));
    const id = startJob('Communications Intern', undefined, [], true);
    applyTemplate(id, 'about-you');
    expect(job(id).tags.includes('about')).toBe(true);
    keepProfileAbout(id, KEEP_PROFILE_ABOUT);
    expect(job(id).pack?.about?.text).toMatch(/sample employer/);
    expect(job(id).sections.find((x) => x.key === 'about')?.lines.join('\n')).toMatch(/sample employer/);
    expect(job(id).setup).toBe('project');
  });

  it('project yes still does not skip when paste is present (U-3 regression)', () => {
    update((s) => ({ ...s, org: { ...s.org, about: 'Org about.' } }));
    const id = startJob('Nutrition Officer', undefined, [], true);
    applyTemplate(id, job(id).format);
    sendChat(id, ABOUT_QUICK[0]);
    setPageIntake(id, 'project', 'Project paste must stay');
    sendChat(id, 'yes');
    expect(job(id).setup).toBe('project');
    expect(job(id).pageIntake?.project).toBe('Project paste must stay');
  });
});
