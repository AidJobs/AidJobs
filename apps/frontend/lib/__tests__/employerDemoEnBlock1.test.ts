/**
 * EN-BLOCK #1 (22 November 2026): language version steps can park (`version:${lang}`),
 * so Amplify walk can reach review / Reach / flyer / publish without marking every draft reviewed.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  advanceFromAbout,
  advanceFromProject,
  applyTemplate,
  chooseStyle,
  goOn,
  NEXT_QUESTION,
  reviewTranslation,
  sendChat,
  setPace,
  startJob,
  unparkPart,
} from '../../components/employer-demo/actions';
import { ASKS, checkPoints, LEFT, nextStep, parkKey, parkedIn } from '../../components/employer-demo/flow';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const step = (id: string) => nextStep(job(id), getState());

/** Written and checked: next step is Free or Amplify. */
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

/** Amplify through market/full to langs, add French (+ optional Spanish), settle langs. */
function toVersion(langs = 'French'): string {
  const id = toPlan();
  sendChat(id, 'Amplify');
  for (let i = 0; i < 10 && ['market', 'full'].includes(step(id)?.kind ?? ''); i++) sendChat(id, 'Leave it as it is');
  expect(step(id)).toEqual({ kind: 'langs' });
  sendChat(id, langs);
  sendChat(id, 'No other languages');
  return id;
}

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
});

describe('EN-BLOCK #1: version park', () => {
  it('parkKey for a version step is version:${lang}', () => {
    expect(parkKey({ kind: 'version', lang: 'fr' })).toBe('version:fr');
    expect(parkKey({ kind: 'langs' })).toBe('langs');
  });

  it('skip parks the version; after Next question the walk proceeds to review', () => {
    const id = toVersion();
    expect(step(id)).toEqual({ kind: 'version', lang: 'fr' });
    sendChat(id, 'skip');
    expect(job(id).walk?.parked).toEqual(['version:fr']);
    expect(job(id).walk?.hold).toBe('version:fr');
    sendChat(id, NEXT_QUESTION);
    expect(job(id).walk?.hold).toBeUndefined();
    expect(step(id)).toEqual({ kind: 'review' });
  });

  it('parking one version still asks the next unreviewed language', () => {
    const id = toVersion('French and Spanish');
    expect(step(id)).toEqual({ kind: 'version', lang: 'fr' });
    sendChat(id, 'later');
    sendChat(id, NEXT_QUESTION);
    expect(job(id).walk?.parked).toEqual(['version:fr']);
    expect(step(id)).toEqual({ kind: 'version', lang: 'es' });
    sendChat(id, 'not now');
    sendChat(id, 'ok');
    expect(job(id).walk?.parked).toEqual(expect.arrayContaining(['version:fr', 'version:es']));
    expect(step(id)).toEqual({ kind: 'review' });
  });

  it('opening Language versions un-parks version:* keys', () => {
    const id = toVersion();
    sendChat(id, 'skip');
    expect(parkedIn('langs', job(id))).toEqual(['version:fr']);
    unparkPart(id, 'langs');
    expect(job(id).walk?.parked ?? []).not.toContain('version:fr');
    expect(step(id)).toEqual({ kind: 'version', lang: 'fr' });
  });

  it('reviewTranslation tidies a parked version key', () => {
    const id = toVersion();
    sendChat(id, 'skip');
    expect(job(id).walk?.parked).toEqual(['version:fr']);
    reviewTranslation(id, 'fr');
    goOn(id);
    expect(job(id).walk?.parked ?? []).not.toContain('version:fr');
    expect(step(id)).toEqual({ kind: 'review' });
  });

  it('Remove still clears the version step without needing park', () => {
    const id = toVersion();
    expect(step(id)).toEqual({ kind: 'version', lang: 'fr' });
    sendChat(id, 'Remove French');
    expect(job(id).translations?.fr).toBeUndefined();
    expect(step(id)).toEqual({ kind: 'review' });
  });
});
