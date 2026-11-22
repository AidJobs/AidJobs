/**
 * R1-18 (22 November 2026): Free-first plan chrome — Free leads; Amplify secondary; no language tease on Free.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { advanceFromAbout, advanceFromProject, applyTemplate, chooseStyle, goOn, sendChat, setPace, startJob } from '../../components/employer-demo/actions';
import { checkSummary } from '../../components/employer-demo/Checks';
import { ASKS, checkPoints, LEFT } from '../../components/employer-demo/flow';
import { partsOf } from '../../components/employer-demo/parts';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const root = join(__dirname, '../../components/employer-demo');
const walkSrc = readFileSync(join(root, 'walkChat.ts'), 'utf8');
const planSrc = readFileSync(join(root, 'PublishSteps.tsx'), 'utf8');
const createSrc = readFileSync(join(root, 'Create.tsx'), 'utf8');
const winSrc = readFileSync(join(root, 'Window.tsx'), 'utf8');
const partsSrc = readFileSync(join(root, 'parts.ts'), 'utf8');

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const last = (id: string) => job(id).chat.at(-1);

/** A job started in the window, written and checked: the next step is free or Amplify. */
function toPlan(text = "We're hiring a Logistics Officer in Goma, fixed-term, closing 30 December 2026"): string {
  const id = startJob(text, undefined, [], true);
  applyTemplate(id, job(id).format);
  if (job(id).setup === 'about') advanceFromAbout(id);
  if (job(id).setup === 'project') advanceFromProject(id);
  chooseStyle(id, ['Warm']);
  setPace(id, 'all');
  update((s) => ({
    ...s,
    org: { ...s.org, keepOffered: ['fixed', 'apply'] },
    jobs: s.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, approved: [...j.tags], settled: [...ASKS, ...LEFT] } } : j)),
  }));
  const points = checkPoints(job(id), getState())
    .map((p) => p.key)
    .filter((k) => !k.startsWith('outline-gap-'));
  update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, skipped: points } } : j)) }));
  goOn(id);
  return id;
}

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
});

describe('R1-18: Free-first plan chrome', () => {
  it('plan chat leads with Free and shortens Amplify when Free is available', () => {
    expect(walkSrc).toMatch(/R1-18:[\s\S]*?Free is available[\s\S]*?shortened and secondary/);
    const id = toPlan();
    const text = last(id)?.text ?? '';
    expect(last(id)?.step).toBe('plan');
    expect(text).toContain('**Free**: your one free standard listing, once for your organisation');
    expect(text).toContain('**Amplify** (free once for your organisation; after this, US$28.40 a job or part of a package)');
    expect(text).toContain('What Amplify adds');
    expect(text).toContain('Free is the usual start');
    expect(text).not.toContain('1 language version besides its own (more at US$5 each)');
    expect(text.indexOf('**Free**')).toBeLessThan(text.indexOf('**Amplify**'));
    expect(last(id)?.quick).toEqual(['Publish free', 'Amplify']);
  });

  it('Free path progress has no market / langs / reach / flyer parts', () => {
    const id = toPlan();
    sendChat(id, 'Publish free');
    const keys = partsOf(job(id), getState()).map((p) => p.key);
    expect(keys).not.toContain('market');
    expect(keys).not.toContain('full');
    expect(keys).not.toContain('langs');
    expect(keys).not.toContain('reach');
    expect(keys).not.toContain('flyer');
    expect(keys).toContain('plan');
    expect(keys).toContain('review');
    expect(keys).toContain('publish');
  });

  it('Amplify path labels langs as Language versions', () => {
    expect(partsSrc).toMatch(/key: 'langs', label: 'Language versions'/);
    const id = toPlan();
    sendChat(id, 'Amplify');
    expect(partsOf(job(id), getState()).find((p) => p.key === 'langs')?.label).toBe('Language versions');
  });

  it('checkSummary omits language tease on Free; includes versions on Amplify', () => {
    const id = toPlan();
    sendChat(id, 'Publish free');
    const freeSum = checkSummary(job(id), getState(), false);
    expect(freeSum.some((r) => r.key === 'languages')).toBe(false);
    expect(freeSum.some((r) => /language versions with Amplify/i.test(r.text))).toBe(false);

    const ampId = toPlan("We're hiring a Driver in Goma, fixed-term, closing 30 December 2026");
    sendChat(ampId, 'Amplify');
    const ampSum = checkSummary(job(ampId), getState(), true);
    expect(ampSum.some((r) => r.key === 'languages')).toBe(true);
    expect(ampSum.find((r) => r.key === 'languages')?.text).toMatch(/no language versions|language version/);
  });

  it('PlanChoice collapses Amplify detail behind What Amplify adds; Check/Create gate language hints', () => {
    expect(planSrc).toMatch(/What Amplify adds/);
    expect(planSrc).toMatch(/amplifyDetailOpen/);
    expect(createSrc).toMatch(/amplifyLangHint/);
    expect(createSrc).toMatch(/add language versions/);
    expect(winSrc).toMatch(/R1-18:[\s\S]*?canGoFree/);
  });
});
