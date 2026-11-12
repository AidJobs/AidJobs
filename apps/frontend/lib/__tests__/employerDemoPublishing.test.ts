import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  applyTemplate,
  chooseBlock,
  chooseStyle,
  forgetProfile,
  goOn,
  keepForAll,
  openWindowAt,
  publish,
  reviewerDecision,
  sendChat,
  sendForReview,
  setChoice,
  setPace,
  startJob,
  stopKeeping,
} from '../../components/employer-demo/actions';
import { ASKS, checkPoints, keepToOffer, LEFT, nextStep } from '../../components/employer-demo/flow';
import { partsOf } from '../../components/employer-demo/parts';
import { publicLangs } from '../../components/employer-demo/translate';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const step = (id: string) => nextStep(job(id), getState());
const last = (id: string) => job(id).chat.at(-1);

/** A job started in the window, written and checked: the next step is free or Amplify. */
function toPlan(text = "We're hiring a Logistics Officer in Goma, fixed-term, closing 30 December 2026"): string {
  const id = startJob(text, undefined, [], true);
  applyTemplate(id, job(id).format);
  chooseStyle(id, ['Warm']);
  setPace(id, 'all');
  update((s) => ({ ...s, org: { ...s.org, keepOffered: ['fixed', 'apply'] }, jobs: s.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, approved: [...j.tags], settled: [...ASKS, ...LEFT] } } : j)) }));
  const points = checkPoints(job(id), getState()).map((p) => p.key);
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

describe('step 8: free or Amplify (section 19)', () => {
  it('after the check, the chat offers both, with the month’s free jobs and what Amplify includes', () => {
    const id = toPlan();
    expect(step(id)).toEqual({ kind: 'plan' });
    expect(last(id)?.text).toMatch(/1 of 2 free jobs left in \w+, used only when it is published/);
    expect(last(id)?.text).toContain('**Amplify** (US$28.40)');
    expect(last(id)?.text).toContain('1 language version besides its own (more at US$5 each)');
    expect(last(id)?.quick).toEqual(['Publish free', 'Amplify']);
  });

  it('Amplify only for a verified organisation; Free only while the month has a free job for it', () => {
    const id = toPlan();
    update((s) => ({ ...s, org: { ...s.org, verified: false } }));
    expect(chooseBlock(getState(), job(id), 'amplify')).toMatch(/verified organisations/);
    sendChat(id, 'Amplify');
    expect(job(id).choice).toBeUndefined();
    expect(job(id).chat.at(-2)?.text).toMatch(/^Amplify is for verified organisations/);
    expect(last(id)?.quick).toEqual(['Publish free']);
    update((s) => ({ ...s, org: { ...s.org, verified: true }, freeUses: [...s.freeUses, { jobId: 'job-x', month: s.freeUses[0].month }] }));
    expect(setChoice(id, 'free')).toBe(false);
    expect(chooseBlock(getState(), job(id), 'free')).toMatch(/^Both free jobs for \w+ are used/);
  });
});

describe('Amplify’s parts, review, and publishing, in order (section 19, steps 8 and 9)', () => {
  it('walks the market check, the full check, the languages and their review, the flyer, Reach, then review and publishing', () => {
    const id = toPlan();
    sendChat(id, 'Amplify');
    expect(job(id).choice).toBe('amplify');
    for (let i = 0; i < 10 && ['market', 'full'].includes(step(id)?.kind ?? ''); i++) sendChat(id, 'Leave it');
    expect(step(id)).toEqual({ kind: 'langs' });
    expect(last(id)?.quick).toEqual(['Add French', 'Add Arabic', 'Add Spanish', 'Add Portuguese', 'No other languages']);
    sendChat(id, 'French and Spanish');
    expect(Object.keys(job(id).translations ?? {}).sort()).toEqual(['es', 'fr']);
    expect(job(id).chat.find((m) => m.text.startsWith('Drafted French and Spanish'))?.text).toContain('That is 1 beyond what Amplify includes: US$5, added to the payment.');
    sendChat(id, 'No other languages');
    expect(step(id)).toEqual({ kind: 'version', lang: 'fr' });
    sendChat(id, 'Mark it as reviewed');
    expect(step(id)).toEqual({ kind: 'version', lang: 'es' });
    sendChat(id, 'Remove Spanish');
    expect(job(id).translations?.es).toBeUndefined();
    expect(step(id)).toEqual({ kind: 'flyer' });
    sendChat(id, 'No, thanks');
    expect(step(id)).toEqual({ kind: 'reach' });
    sendChat(id, 'Not now');
    expect(step(id)).toEqual({ kind: 'review' });
    expect(last(id)?.quick).toEqual(['Send for review', 'No review']);
    sendChat(id, 'No review');
    expect(step(id)).toEqual({ kind: 'publish' });
    expect(last(id)).toMatchObject({ step: 'publish', card: 'publish' });
    sendChat(id, 'publish it');
    expect(last(id)).toMatchObject({ card: 'publish' });
    expect(job(id).status).toBe('draft');
    expect(publish(id, { plan: 'amplify', schedule: null, paid: 'direct' })).toBe(true);
    goOn(id);
    expect(step(id)).toEqual({ kind: 'live' });
    expect(last(id)).toMatchObject({ step: 'live', card: 'live' });
    expect(publicLangs(job(id))).toEqual(['fr']);
    expect(partsOf(job(id), getState()).every((p) => p.done)).toBe(true);
  });

  it('a short reply the rules cannot read is asked again, never added to the text', () => {
    const id = toPlan();
    sendChat(id, 'Amplify');
    for (let i = 0; i < 10 && ['market', 'full'].includes(step(id)?.kind ?? ''); i++) sendChat(id, 'Leave it');
    const before = JSON.stringify(job(id).sections);
    sendChat(id, 'Leave it');
    expect(JSON.stringify(job(id).sections)).toBe(before);
    expect(last(id)?.text).toBe("I didn't catch that for this step. Pick an answer, or tell me in your own words.");
    expect(step(id)).toEqual({ kind: 'langs' });
  });

  it('where approval is required, review comes first and publishing waits for it', () => {
    const id = toPlan("We're hiring a Head of Programmes, P5, in Goma, fixed-term, closing 30 December 2026");
    sendChat(id, 'Publish free');
    expect(step(id)).toEqual({ kind: 'review' });
    expect(last(id)).toMatchObject({ card: 'review' });
    sendChat(id, 'No review');
    expect(step(id)).toEqual({ kind: 'review' });
    sendForReview(id, [{ name: 'Amina Yusuf', email: 'amina@riverstone.example.org', outside: false }], '2026-12-01', 'any', '');
    goOn(id);
    expect(step(id)).toEqual({ kind: 'waiting' });
    expect(last(id)?.text).toMatch(/^Sent for review\. Waiting for Amina/);
    expect(last(id)?.quick).toEqual(['Remind them', 'Publish without approval']);
    sendChat(id, 'Remind them');
    expect(job(id).review.reminded).toBeDefined();
    expect(publish(id, { plan: 'free', schedule: null })).toBe(false);
    update((s) => ({ ...s, reviewerAs: 'amina' }));
    reviewerDecision(id, 'approved', '');
    update((s) => ({ ...s, reviewerAs: null }));
    goOn(id);
    expect(step(id)).toEqual({ kind: 'publish' });
  });
});

describe('found on the real-AI walk (12 November 2026)', () => {
  it('a published job is no longer walked through: a section left unapproved is not asked about after publishing', () => {
    const id = toPlan();
    sendChat(id, 'Publish free');
    sendChat(id, 'No review');
    update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, approved: j.walk!.approved.slice(1) } } : j)) }));
    expect(step(id)?.kind).toBe('approve');
    expect(publish(id, { plan: 'free', schedule: null })).toBe(true);
    expect(step(id)).toEqual({ kind: 'live' });
  });

  it('at the basic check, "leave that one too" leaves the point, and a short reply the rules cannot read is asked again, not added to the text', () => {
    const id = startJob("We're hiring a Logistics Officer in Goma, fixed-term", undefined, [], true);
    applyTemplate(id, job(id).format);
    chooseStyle(id, ['Warm']);
    setPace(id, 'all');
    update((s) => ({ ...s, org: { ...s.org, keepOffered: ['fixed', 'apply'] }, jobs: s.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, approved: [...j.tags], settled: [...ASKS, ...LEFT] } } : j)) }));
    goOn(id);
    const first = step(id);
    expect(first?.kind).toBe('check');
    const before = JSON.stringify(job(id).sections);
    sendChat(id, 'what now');
    expect(JSON.stringify(job(id).sections)).toBe(before);
    expect(last(id)?.text).toBe("I didn't catch that for this step. Pick an answer, or tell me in your own words.");
    sendChat(id, 'Leave that one too');
    expect(JSON.stringify(job(id).sections)).toBe(before);
    expect(step(id)).not.toEqual(first);
  });

  it('Reach: the addresses given in the chat are added, the organisation’s own to the team, and “can you publish it” shows the card', () => {
    const id = toPlan();
    sendChat(id, 'Amplify');
    for (let i = 0; i < 10 && ['market', 'full'].includes(step(id)?.kind ?? ''); i++) sendChat(id, 'Leave it');
    sendChat(id, 'No other languages');
    sendChat(id, 'No, thanks');
    expect(step(id)).toEqual({ kind: 'reach' });
    sendChat(id, 'Invite ana.lopez@example.org, and my colleague amina@riverstone.example.org');
    expect(job(id).reachPlan).toMatchObject({ candidates: ['ana.lopez@example.org'], team: ['amina@riverstone.example.org'] });
    expect(job(id).chat.find((m) => m.text.startsWith('Added 1 to invite and 1 from your team'))).toBeDefined();
    sendChat(id, 'No review');
    sendChat(id, 'Can you publish it on Monday?');
    expect(last(id)).toMatchObject({ card: 'publish' });
    expect(job(id).status).toBe('draft');
  });

  it('with a language version’s tab open, the rules leave the job’s own text alone', () => {
    const id = toPlan();
    sendChat(id, 'Amplify');
    for (let i = 0; i < 10 && ['market', 'full'].includes(step(id)?.kind ?? ''); i++) sendChat(id, 'Leave it');
    sendChat(id, 'Add French');
    sendChat(id, 'No other languages');
    const before = JSON.stringify(job(id).sections);
    sendChat(id, 'Add a short section about the conditions, saying the post is based in Goma', undefined, 'fr');
    expect(JSON.stringify(job(id).sections)).toBe(before);
    expect(job(id).chat.at(-2)?.text).toMatch(/^That is about the French version/);
    sendChat(id, 'Mark it as reviewed', undefined, 'fr');
    expect(job(id).translations?.fr?.reviewed).toBe(true);
  });

  it('"that is all" ends the languages', () => {
    const id = toPlan();
    sendChat(id, 'Amplify');
    for (let i = 0; i < 10 && ['market', 'full'].includes(step(id)?.kind ?? ''); i++) sendChat(id, 'Leave it');
    sendChat(id, 'That is all for languages');
    expect(step(id)).toEqual({ kind: 'flyer' });
  });
});

describe('a free job is used, and a job profile kept, only when it is published (section 19)', () => {
  it('publishing free uses one free job and saves a job profile, with Undo', () => {
    const id = toPlan();
    sendChat(id, 'Publish free');
    sendChat(id, 'No review');
    const uses = getState().freeUses.length;
    expect(step(id)).toEqual({ kind: 'publish' });
    expect(getState().freeUses.length).toBe(uses);
    expect(publish(id, { plan: 'free', schedule: null })).toBe(true);
    expect(getState().freeUses.length).toBe(uses + 1);
    const profile = getState().profiles?.[0];
    expect(profile).toMatchObject({ from: id, title: 'Logistics Officer', location: 'Goma, DR Congo' });
    expect(profile?.facts.deadline).toBeUndefined();
    expect(getState().notice).toMatchObject({ text: 'Saved as a job profile for next time: Logistics Officer, Goma.', unprofile: profile?.id });
    forgetProfile(profile!.id);
    expect(getState().profiles).toEqual([]);
  });

  it('a live free job opened at Publish from elsewhere is offered Amplify; a draft only opens there', () => {
    const live = getState().jobs.find((j) => j.status === 'live' && j.plan === 'free')!;
    openWindowAt(live.id, 'publish');
    expect(job(live.id)).toMatchObject({ part: 'publish', choice: 'amplify' });
    openWindowAt('job-comms', 'publish');
    expect(job('job-comms').part).toBe('publish');
    expect(job('job-comms').choice).toBeUndefined();
  });
});

describe('step 10: kept for next time (section 19)', () => {
  it('offers the fixed text and the way to apply the first time, only to the owner', () => {
    update((s) => ({ ...s, org: { ...s.org, keepOffered: [] } }));
    expect(keepToOffer(job('job-comms'), getState())).toBe('fixed');
    update((s) => ({ ...s, me: { ...s.me, role: 'member' } }));
    expect(keepToOffer(job('job-comms'), getState())).toBeNull();
    keepForAll('job-comms', 'fixed', true);
    expect(getState().org.keptFixed).toBeUndefined();
  });

  it('what is kept starts each new job, until it is no longer kept; jobs already written keep their own', () => {
    update((s) => ({ ...s, org: { ...s.org, keepOffered: [] }, jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, commitments: ['psea'], apply: { ...j.apply, method: 'email', address: 'jobs@riverstone.example.org' } } : j)) }));
    keepForAll('job-comms', 'fixed', true);
    keepForAll('job-comms', 'apply', true);
    expect(getState().org.keepOffered).toEqual(['fixed', 'apply']);
    const next = startJob('Hiring a Shelter Officer in Goma');
    expect(job(next).commitments).toEqual(['psea']);
    expect(job(next).apply).toMatchObject({ method: 'email', address: 'jobs@riverstone.example.org' });
    expect(job('job-fin').commitments).not.toEqual(['psea']);
    stopKeeping('fixed');
    const after = startJob('Hiring a Shelter Officer in Bukavu');
    expect(job(after).commitments).not.toEqual(['psea']);
  });

  it('the fixed text is confirmed once for each language, and kept for reuse', () => {
    const id = startJob('Nous recherchons un chargé de logistique à Goma, CDD de 12 mois', undefined, [], true);
    applyTemplate(id, job(id).format);
    chooseStyle(id, ['Warm']);
    setPace(id, 'all');
    update((s) => ({ ...s, org: { ...s.org, keepOffered: ['fixed', 'apply'] }, jobs: s.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, approved: [...j.tags], settled: [...ASKS, 'details', 'sdgs'] } } : j)) }));
    goOn(id);
    expect(step(id)).toEqual({ kind: 'fixed' });
    expect(last(id)?.text).toContain('This is the first French job: confirming them here keeps them for every French job');
    sendChat(id, 'Keep them');
    expect(getState().org.fixedLangs).toEqual(['fr']);
  });
});
