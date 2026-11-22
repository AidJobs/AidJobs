/**
 * FW-1 (22 November 2026): apply email fact matches How to apply body; Publish CTA and fail toast name essentials.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  advanceFromAbout,
  advanceFromProject,
  applyTemplate,
  chooseStyle,
  goOn,
  publish,
  publishBlock,
  sendChat,
  setApply,
  setPace,
  startJob,
} from '../../components/employer-demo/actions';
import { applyLines, defaultApply, emailAddress, withEmailAddress } from '../../components/employer-demo/apply';
import { ASKS, checkPoints, essentials, ESSENTIAL_WORDS, LEFT } from '../../components/employer-demo/flow';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const root = join(__dirname, '../../components/employer-demo');
const stepsSrc = readFileSync(join(root, 'PublishSteps.tsx'), 'utf8');
const publishSrc = readFileSync(join(root, 'Publish.tsx'), 'utf8');

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;

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

describe('FW-1: apply email alignment and publish messaging', () => {
  it('emailAddress and withEmailAddress use jobs@domain when email apply has no address', () => {
    const org = { ...getState().org, domain: 'tumaini.example.org' };
    const empty = { ...defaultApply('ngo', '', ''), address: '' };
    expect(emailAddress(empty, org)).toBe('jobs@tumaini.example.org');
    expect(withEmailAddress(empty, org).address).toBe('jobs@tumaini.example.org');
    expect(applyLines(empty, { title: 'CHO', deadline: '2026-12-30' } as never, org).join(' ')).toMatch(/jobs@tumaini\.example\.org/);
  });

  it('NGO defaultApply starts with jobs@domain when domain is given', () => {
    expect(defaultApply('ngo', '', 'tumaini.example.org').address).toBe('jobs@tumaini.example.org');
    expect(defaultApply('ngo', '', '').address).toBe('');
  });

  it('essentials accept the domain fallback when org is passed; reject when address and domain are empty', () => {
    const id = toPlan();
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, apply: { ...j.apply, method: 'email' as const, address: '' } } : j)),
    }));
    expect(essentials(job(id), getState().org)).not.toContain('method');
    expect(essentials(job(id))).toContain('method');
    update((s) => ({
      ...s,
      org: { ...s.org, domain: '' },
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, apply: { ...j.apply, address: '' } } : j)),
    }));
    expect(essentials(job(id), getState().org)).toContain('method');
    expect(publishBlock(getState(), id, { plan: 'free', schedule: null })).toBe(`Missing: ${ESSENTIAL_WORDS.method}`);
  });

  it('publish persists jobs@domain and succeeds when address was empty but domain is set', () => {
    const id = toPlan();
    sendChat(id, 'Publish free');
    update((s) => ({
      ...s,
      org: { ...s.org, freeTermsAccepted: true },
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, apply: { ...j.apply, method: 'email' as const, address: '' }, choice: 'free' as const } : j)),
    }));
    expect(publishBlock(getState(), id, { plan: 'free', schedule: null })).toBeNull();
    expect(publish(id, { plan: 'free', schedule: null })).toBe(true);
    expect(job(id).apply.address).toBe(`jobs@${getState().org.domain}`);
    expect(job(id).status).toBe('live');
  });

  it('cleared address with no domain blocks with a named reason; CTA/toast code paths use essentials and publishBlock', () => {
    expect(stepsSrc).toMatch(/FW-1:[\s\S]*?essentials\(job, s\.org\)/);
    expect(stepsSrc).toMatch(/notify\(why \?\? 'It could not be published/);
    expect(publishSrc).toMatch(/FW-1:[\s\S]*?essentials\(job, s\.org\)/);
    expect(publishSrc).toMatch(/notify\(why \?\? 'It could not be published/);
    const id = toPlan();
    update((s) => ({
      ...s,
      org: { ...s.org, domain: '', freeTermsAccepted: true },
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, apply: { ...j.apply, method: 'email' as const, address: '' }, choice: 'free' as const } : j)),
    }));
    expect(publishBlock(getState(), id, { plan: 'free', schedule: null })).toBe('Missing: an email address to apply to');
    expect(publish(id, { plan: 'free', schedule: null })).toBe(false);
    expect(job(id).status).toBe('draft');
  });

  it('setApply can clear the address (pencil) without forcing the fallback back in', () => {
    const id = toPlan();
    setApply(id, { address: 'jobs@tumaini.example.org' });
    setApply(id, { address: '' });
    expect(job(id).apply.address).toBe('');
  });
});
