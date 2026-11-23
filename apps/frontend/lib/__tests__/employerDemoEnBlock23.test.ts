/**
 * EN-BLOCK #2–3 + Reach settle (23 November 2026):
 * - langsToPay counts only reviewed versions (drafts are not charged).
 * - publicLangs fills slots with reviewed versions first (drafts do not steal slots).
 * - Chat Invite does not settle Reach; Save (setReachPlan) or No thanks does.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  addTranslation,
  advanceFromAbout,
  advanceFromProject,
  applyTemplate,
  chooseStyle,
  goOn,
  NEXT_QUESTION,
  reviewTranslation,
  sendChat,
  setPace,
  setReachPlan,
  startJob,
} from '../../components/employer-demo/actions';
import { ASKS, checkPoints, LEFT, nextStep } from '../../components/employer-demo/flow';
import { planFor } from '../../components/employer-demo/invites';
import { langsToPay } from '../../components/employer-demo/plans';
import { getState, resetDemo, update } from '../../components/employer-demo/store';
import { publicLangs } from '../../components/employer-demo/translate';
import { INVITE, NO_REVIEW, NO_THANKS } from '../../components/employer-demo/walkChat';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const step = (id: string) => nextStep(job(id), getState());

function toPlan(text = "We're hiring a Logistics Officer in Goma, fixed-term, closing 30 December 2026"): string {
  const id = startJob(text, undefined, [], true);
  applyTemplate(id, job(id).format);
  if (job(id).setup === 'about') advanceFromAbout(id);
  if (job(id).setup === 'project') advanceFromProject(id);
  chooseStyle(id, ['Warm']);
  setPace(id, 'all');
  update((s) => ({
    ...s,
    org: { ...s.org, keepOffered: ['fixed', 'apply'], verified: true },
    jobs: s.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, approved: [...j.tags], settled: [...ASKS, ...LEFT] } } : j)),
  }));
  const points = checkPoints(job(id), getState())
    .map((p) => p.key)
    .filter((k) => !k.startsWith('outline-gap-'));
  update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, skipped: points } } : j)) }));
  goOn(id);
  return id;
}

/** Amplify through market/full; settle langs (English only unless langs named). */
function toAfterLangs(langs?: string): string {
  const id = toPlan();
  sendChat(id, 'Amplify');
  for (let i = 0; i < 10 && ['market', 'full'].includes(step(id)?.kind ?? ''); i++) sendChat(id, 'Leave it as it is');
  expect(step(id)).toEqual({ kind: 'langs' });
  if (langs) sendChat(id, langs);
  sendChat(id, 'No other languages');
  return id;
}

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
});

describe('EN-BLOCK #2: langsToPay charges reviewed only', () => {
  it('does not charge for unreviewed drafts beyond the included slot', () => {
    const id = toAfterLangs();
    addTranslation(id, 'fr');
    addTranslation(id, 'es');
    expect(Object.keys(job(id).translations ?? {})).toHaveLength(2);
    expect(job(id).translations?.fr?.reviewed).toBe(false);
    expect(langsToPay(job(id), 'amplify', 'single')).toBe(0);
    reviewTranslation(id, 'fr');
    expect(langsToPay(job(id), 'amplify', 'single')).toBe(0);
    reviewTranslation(id, 'es');
    expect(langsToPay(job(id), 'amplify', 'single')).toBe(1);
  });
});

describe('EN-BLOCK #3: publicLangs prefers reviewed for slots', () => {
  it('gives the included slot to a later reviewed version, not an earlier draft', () => {
    const id = toAfterLangs();
    addTranslation(id, 'fr');
    addTranslation(id, 'es');
    reviewTranslation(id, 'es');
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) =>
        j.id === id
          ? {
              ...j,
              choice: 'amplify',
              plan: 'amplify',
              status: 'live',
              paidVia: 'single' as const,
              publishedAt: Date.now(),
            }
          : j,
      ),
    }));
    expect(publicLangs(job(id))).toEqual(['es']);
    expect(langsToPay(job(id))).toBe(0);
  });
});

describe('EN-BLOCK Reach: settle agrees with reachPlan', () => {
  function toReach(): string {
    const id = toAfterLangs();
    for (let i = 0; i < 8 && step(id)?.kind === 'version'; i++) {
      sendChat(id, 'skip');
      if (job(id).walk?.hold) sendChat(id, NEXT_QUESTION);
    }
    if (step(id)?.kind === 'review') sendChat(id, NO_REVIEW);
    expect(step(id)?.kind).toBe('reach');
    return id;
  }

  it('Invite does not settle; Save settles and advances', () => {
    const id = toReach();
    sendChat(id, INVITE);
    expect(job(id).walk?.settled.includes('reach')).toBe(false);
    expect(job(id).reachPlan).toBeUndefined();
    expect(step(id)?.kind).toBe('reach');
    const plan = { ...planFor(job(id), getState().org), candidates: ['ana@example.org'] };
    setReachPlan(id, plan);
    expect(job(id).walk?.settled.includes('reach')).toBe(true);
    expect(job(id).reachPlan?.candidates).toEqual(['ana@example.org']);
    goOn(id);
    expect(step(id)?.kind).toBe('flyer');
  });

  it('No thanks settles without a reachPlan', () => {
    const id = toReach();
    sendChat(id, NO_THANKS);
    expect(job(id).walk?.settled.includes('reach')).toBe(true);
    expect(job(id).reachPlan).toBeUndefined();
    expect(step(id)?.kind).toBe('flyer');
  });
});
