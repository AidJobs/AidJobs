/**
 * Phase 7 (23 November 2026): Job profiles — grouping on save/start, rename, delete Undo,
 * startJobFromProfile, light fact edit, reviewer gate.
 * Review fixes (23 November 2026): customGroups, AI gates, context.profiles.total, pay/apply edits.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  deleteProfile,
  publish,
  renameProfile,
  restoreProfile,
  startFromProfile,
  startJob,
  startJobFromProfile,
  updateProfile,
} from '../../components/employer-demo/actions';
import { applyAiTurn, PROFILE_ASKED, type OpenTarget } from '../../components/employer-demo/aiActions';
import { contextFor } from '../../components/employer-demo/ai';
import { profileFor, profileIdsInContext, profileName, profileOf, profilesForContext } from '../../components/employer-demo/profiles';
import { getState, resetDemo, update } from '../../components/employer-demo/store';
import type { DemoJob, JobProfile } from '../../components/employer-demo/types';
import { SYSTEM } from '../../lib/employerDemoAi/model';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;

function seedFinProfile(extra: Partial<JobProfile> = {}): JobProfile {
  const src = job('job-fin');
  // Non-default grouping so cleanGrouping keeps it (requirements under employer).
  const grouped: DemoJob = {
    ...src,
    groupOrder: ['employer', 'job', 'applying'],
    groupOf: { requirements: 'employer' },
  };
  const p: JobProfile = { ...profileOf(grouped, Date.now()), id: 'pf-fin', ...extra };
  update((s) => ({
    ...s,
    profiles: [p, ...(s.profiles ?? []).filter((x) => !(x.title === p.title && x.location === p.location))],
  }));
  return getState().profiles!.find((x) => x.id === 'pf-fin')!;
}

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true, reviewerAs: null }));
});

describe('Phase 7: profile data', () => {
  it('profileOf keeps grouping; profileName prefers optional name', () => {
    const j = job('job-fin');
    const withGroup: DemoJob = {
      ...j,
      groupOrder: ['employer', 'job', 'applying'],
      groupOf: { requirements: 'employer' },
    };
    const p = profileOf(withGroup, 1);
    expect(p.groupOrder).toEqual(['employer', 'job', 'applying']);
    expect(p.groupOf?.requirements).toBe('employer');
    expect(profileName(p)).toMatch(/Finance Officer/);
    expect(profileName({ ...p, name: '  Country Finance  ' })).toBe('Country Finance');
  });

  it('rename clears blank name; publish replace keeps name', () => {
    const seeded = seedFinProfile();
    expect(renameProfile(seeded.id, 'Juba FO')).toBe(true);
    expect(profileName(getState().profiles!.find((p) => p.id === seeded.id)!)).toBe('Juba FO');
    expect(renameProfile(seeded.id, '   ')).toBe(true);
    expect(getState().profiles!.find((p) => p.id === seeded.id)!.name).toBeUndefined();
    renameProfile(seeded.id, 'Kept name');
    update((s) => {
      const src = s.jobs.find((j) => j.id === 'job-fin')!;
      const copy: DemoJob = {
        ...src,
        id: 'job-fin-new',
        status: 'approved',
        choice: 'free',
        plan: null,
        publishedAt: undefined,
        walk: undefined,
      };
      return { ...s, jobs: [copy, ...s.jobs], free: {} };
    });
    expect(publish('job-fin-new', { plan: 'free', schedule: null })).toBe(true);
    const saved = getState().profiles!.find((p) => p.title === 'Finance Officer' && p.location.includes('Juba'));
    expect(saved?.name).toBe('Kept name');
  });

  it('delete with restoreProfile Undo; clash does not overwrite', () => {
    const p = seedFinProfile();
    expect(deleteProfile(p.id)).toBe(true);
    expect(getState().profiles!.some((x) => x.id === p.id)).toBe(false);
    expect(getState().notice?.restoreProfile?.id).toBe(p.id);
    expect(profileFor(getState(), job('job-fin'))?.id === p.id).toBeFalsy();
    expect(restoreProfile()).toBe(true);
    expect(getState().profiles!.some((x) => x.id === p.id)).toBe(true);
    deleteProfile(p.id);
    update((s) => ({
      ...s,
      profiles: [{ ...p, id: 'pf-newer', at: Date.now(), name: 'Newer' }, ...(s.profiles ?? [])],
    }));
    expect(restoreProfile()).toBe(false);
    expect(getState().profiles!.find((x) => x.title === p.title && x.location === p.location)?.id).toBe('pf-newer');
  });

  it('startJobFromProfile applies facts and grouping, asks dates, no Same-as-last question', () => {
    seedFinProfile({ name: 'Test FO' });
    const id = startJobFromProfile('pf-fin');
    expect(id).toBeTruthy();
    const j = job(id!);
    expect(j.setup).toBeUndefined();
    expect(j.facts.title).toBe('Finance Officer');
    expect(j.facts.deadline).toBe('');
    expect(j.facts.positions).toBe('');
    expect(j.groupOf?.requirements).toBe('employer');
    expect(j.chat.some((m) => /Same as last time/.test(m.text))).toBe(false);
    expect(j.chat.some((m) => /Starting from your last Test FO/.test(m.text))).toBe(true);
    expect(j.walk?.settled.includes('contract')).toBe(true);
  });

  it('light fact edit does not change the source job; locked commitment stays', () => {
    const p = seedFinProfile();
    const gradeBefore = job(p.from).facts.grade;
    expect(updateProfile(p.id, { facts: { grade: 'E2', title: 'Hacked' }, commitments: [] })).toBe(true);
    const next = getState().profiles!.find((x) => x.id === p.id)!;
    expect(next.facts.grade).toBe('E2');
    expect(next.title).toBe('Finance Officer');
    expect(next.facts.title).toBe('Finance Officer');
    expect(job(p.from).facts.grade).toBe(gradeBefore);
    expect(next.commitments.includes('safeguarding')).toBe(true);
  });

  it('reviewers cannot mutate profiles; missing format disables start', () => {
    const p = seedFinProfile();
    update((s) => ({ ...s, reviewerAs: 'amina' }));
    expect(renameProfile(p.id, 'Nope')).toBe(false);
    expect(deleteProfile(p.id)).toBe(false);
    expect(startJobFromProfile(p.id)).toBeNull();
    update((s) => ({ ...s, reviewerAs: null, profiles: s.profiles!.map((x) => (x.id === p.id ? { ...x, format: 'gone-format' } : x)) }));
    expect(startJobFromProfile(p.id)).toBeNull();
  });

  it('old profile without grouping still starts via outlineOrder path', () => {
    const src = job('job-meal');
    const bare = { ...profileOf(src), id: 'pf-bare' };
    delete bare.groupOrder;
    delete bare.groupOf;
    update((s) => ({
      ...s,
      profiles: [bare, ...(s.profiles ?? []).filter((p) => !(p.title === bare.title && p.location === bare.location))],
    }));
    const id = startJob(bare.title, bare.format, [], true);
    startFromProfile(id, bare.id);
    expect(job(id).groupOrder).toBeUndefined();
    expect(job(id).tags.length).toBeGreaterThan(0);
  });

  it('profileOf keeps customGroups; start restores them', () => {
    const src = job('job-fin');
    const withCustom: DemoJob = {
      ...src,
      customGroups: [{ id: 'g-annex', label: 'Annex' }],
      groupOrder: ['employer', 'job', 'g-annex', 'applying'],
      groupOf: { requirements: 'g-annex' },
    };
    const p = { ...profileOf(withCustom, Date.now()), id: 'pf-custom' };
    expect(p.customGroups?.[0]?.id).toBe('g-annex');
    update((s) => ({
      ...s,
      profiles: [p, ...(s.profiles ?? []).filter((x) => !(x.title === p.title && x.location === p.location))],
    }));
    const id = startJobFromProfile('pf-custom');
    expect(id).toBeTruthy();
    expect(job(id!).customGroups?.some((g) => g.id === 'g-annex')).toBe(true);
    expect(job(id!).groupOf?.requirements).toBe('g-annex');
  });

  it('updateProfile pay mode and apply documents; at and source job unchanged', () => {
    const p = seedFinProfile();
    const at = p.at;
    const kept = getState().org.keptApply;
    expect(
      updateProfile(p.id, {
        facts: { salaryMode: 'range', salaryMin: '1000', salaryMax: '2000', currency: 'USD', period: 'month', eligibility: 'righttowork' },
        apply: { ...p.apply, documents: ['CV', 'Cover letter', 'Work samples'], method: 'email', address: 'jobs@riverstone.example.org' },
      }),
    ).toBe(true);
    const next = getState().profiles!.find((x) => x.id === p.id)!;
    expect(next.at).toBe(at);
    expect(next.facts.salaryMode).toBe('range');
    expect(next.facts.eligibility).toBe('righttowork');
    expect(next.apply.documents).toContain('Work samples');
    expect(job(p.from).apply.documents).not.toContain('Work samples');
    expect(getState().org.keptApply).toEqual(kept);
  });

  it('profilesForContext omits total at ≤20 and lists at most 20', () => {
    const many: JobProfile[] = Array.from({ length: 22 }, (_, i) => ({
      ...profileOf(job('job-fin'), i),
      id: `pf-n-${i}`,
      title: `Role ${i}`,
      location: `City ${i}`,
    }));
    const under = profilesForContext(many.slice(0, 5));
    expect(under.total).toBeUndefined();
    expect(under.list).toHaveLength(5);
    const over = profilesForContext(many);
    expect(over.total).toBe(22);
    expect(over.list).toHaveLength(20);
    expect(profileIdsInContext(many).has('pf-n-21')).toBe(false);
    expect(profileIdsInContext(many).has('pf-n-0')).toBe(true);
  });

  it('AI profile actions need PROFILE_ASKED and an id in the context list', () => {
    expect(PROFILE_ASKED.test('open the job profiles')).toBe(true);
    expect(PROFILE_ASKED.test('list the profiles')).toBe(true);
    expect(PROFILE_ASKED.test('list my profiles')).toBe(true);
    expect(PROFILE_ASKED.test('open my profiles')).toBe(true);
    expect(PROFILE_ASKED.test('start from the Juba profile')).toBe(true);
    expect(PROFILE_ASKED.test('go on')).toBe(false);
    const p = seedFinProfile();
    const open: OpenTarget[] = [];
    const record = (t: OpenTarget) => open.push(t);
    const id = 'job-fin';
    const unasked = applyAiTurn(id, '', { reply: 'Done.', actions: [{ type: 'delete_profile', profile: p.id }] }, record);
    expect(unasked.refused.some((r) => /only when you ask/.test(r))).toBe(true);
    expect(getState().profiles!.some((x) => x.id === p.id)).toBe(true);
    const outside = applyAiTurn(id, 'delete the profile', { reply: 'Done.', actions: [{ type: 'delete_profile', profile: 'pf-not-listed' }] }, record);
    expect(outside.refused.some((r) => /not in the list/.test(r))).toBe(true);
    const renamed = applyAiTurn(id, 'rename the profile', { reply: 'Done.', actions: [{ type: 'rename_profile', profile: p.id, name: 'AI Name' }] }, record);
    expect(renamed.refused).toEqual([]);
    expect(profileName(getState().profiles!.find((x) => x.id === p.id)!)).toBe('AI Name');
    expect(SYSTEM).toMatch(/open_profiles/);
    expect(SYSTEM).toMatch(/context\.profiles/);
    const ctx = contextFor(getState(), job(id), undefined, false) as { profiles: { list: unknown[]; total?: number } };
    expect(ctx.profiles.total).toBeUndefined();
    expect(Array.isArray(ctx.profiles.list)).toBe(true);
  });
});
