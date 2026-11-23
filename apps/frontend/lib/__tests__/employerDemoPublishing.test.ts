import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  advanceFromAbout,
  advanceFromProject,
  applyTemplate,
  approveSection,
  chooseBlock,
  chooseStyle,
  forgetProfile,
  goOn,
  editSection,
  keepForAll,
  markFlyerMade,
  openWindowAt,
  overrideApproval,
  publish,
  reviewerDecision,
  sendChat,
  sendForReview,
  setChoice,
  setPace,
  startJob,
  stopKeeping,
} from '../../components/employer-demo/actions';
import { ASKS, checkPoints, flyerStale, keepToOffer, LEFT, nextStep, reachOpen } from '../../components/employer-demo/flow';
import { partsOf } from '../../components/employer-demo/parts';
import { fixedShown } from '../../components/employer-demo/fixed';
import { publicLangs } from '../../components/employer-demo/translate';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const step = (id: string) => nextStep(job(id), getState());
const last = (id: string) => job(id).chat.at(-1);

/** A job started in the window, written and checked: the next step is free or Amplify. */
function toPlan(text = "We're hiring a Logistics Officer in Goma, fixed-term, closing 30 December 2026"): string {
  const id = startJob(text, undefined, [], true);
  applyTemplate(id, job(id).format);
  // R2-P0-3: About us / project sit between template and style; skip so toPlan still lands on plan.
  if (job(id).setup === 'about') advanceFromAbout(id);
  if (job(id).setup === 'project') advanceFromProject(id);
  chooseStyle(id, ['Warm']);
  setPace(id, 'all');
  update((s) => ({ ...s, org: { ...s.org, keepOffered: ['fixed', 'apply'] }, jobs: s.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, approved: [...j.tags], settled: [...ASKS, ...LEFT] } } : j)) }));
  // Soft check points only — outline gaps cannot be skipped (R2-P1-8).
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

describe('step 8: free or Amplify (section 19)', () => {
  it('after the check, the chat offers both, Free first with Amplify shortened (R1-18)', () => {
    const id = toPlan();
    expect(step(id)).toEqual({ kind: 'plan' });
    expect(last(id)?.text).toContain('**Free**: your one free standard listing, once for your organisation');
    expect(last(id)?.text).toContain('**Amplify** (free once for your organisation; after this, US$28.40 a job or part of a package)');
    expect(last(id)?.text).toContain('What Amplify adds');
    expect(last(id)?.text).toContain('Free is the usual start');
    expect(last(id)?.text).not.toContain('1 language version besides its own (more at US$5 each)');
    expect(last(id)?.quick).toEqual(['Publish free', 'Amplify']);
    update((s) => ({ ...s, free: { amplify: 'job-x' } }));
    const paid = toPlan("We're hiring a Driver in Goma, fixed-term, closing 30 December 2026");
    expect(last(paid)?.text).toContain('**Amplify** (US$28.40)');
    expect(last(paid)?.text).toContain('What Amplify adds');
  });

  it('Amplify only for a verified organisation; Free only while the free standard listing is unused', () => {
    const id = toPlan();
    update((s) => ({ ...s, org: { ...s.org, verified: false } }));
    expect(chooseBlock(getState(), job(id), 'amplify')).toMatch(/verified organisations/);
    sendChat(id, 'Amplify');
    expect(job(id).choice).toBeUndefined();
    expect(job(id).chat.at(-2)?.text).toMatch(/^Amplify is for verified organisations/);
    expect(last(id)?.quick).toEqual(['Publish free']);
    update((s) => ({ ...s, org: { ...s.org, verified: true }, free: { standard: 'job-x' } }));
    expect(setChoice(id, 'free')).toBe(false);
    expect(chooseBlock(getState(), job(id), 'free')).toMatch(/^Your free standard listing is used, once per organisation/);
  });
});

describe('Amplify’s parts, review, and publishing, in order (section 19, steps 8 and 9)', () => {
  it('walks the market check, the full check, the languages and their review, then review, Reach, the flyer, and publishing (phase 5, C)', () => {
    const id = toPlan();
    sendChat(id, 'Amplify');
    expect(job(id).choice).toBe('amplify');
    for (let i = 0; i < 10 && ['market', 'full'].includes(step(id)?.kind ?? ''); i++) sendChat(id, 'Leave it as it is');
    expect(step(id)).toEqual({ kind: 'langs' });
    expect(last(id)?.quick).toEqual(['Add French', 'Add Arabic', 'Add Spanish', 'Add Portuguese', 'No other languages']);
    sendChat(id, 'French and Spanish');
    expect(Object.keys(job(id).translations ?? {}).sort()).toEqual(['es', 'fr']);
    // EN-BLOCK #2: drafts are not charged; the payment line only counts reviewed versions.
    expect(job(id).chat.find((m) => m.text.startsWith('Drafted French and Spanish'))?.text).toBe('Drafted French and Spanish, each in its own tab.');
    sendChat(id, 'No other languages');
    expect(step(id)).toEqual({ kind: 'version', lang: 'fr' });
    sendChat(id, 'Mark it as reviewed');
    expect(step(id)).toEqual({ kind: 'version', lang: 'es' });
    sendChat(id, 'Remove Spanish');
    expect(job(id).translations?.es).toBeUndefined();
    expect(step(id)).toEqual({ kind: 'review' });
    expect(last(id)?.quick).toEqual(['Send for review', 'No review']);
    expect(last(id)?.text).toContain('Reach and the flyer come after review');
    sendChat(id, 'No review');
    expect(step(id)).toEqual({ kind: 'reach' });
    sendChat(id, 'Not now');
    expect(step(id)).toEqual({ kind: 'flyer' });
    sendChat(id, 'No, thanks');
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
    for (let i = 0; i < 10 && ['market', 'full'].includes(step(id)?.kind ?? ''); i++) sendChat(id, 'Leave it as it is');
    const before = JSON.stringify(job(id).sections);
    sendChat(id, 'Leave it as it is');
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
    expect(last(id)).toMatchObject({ quick: ['Publish without approval'], card: 'review' });
    sendChat(id, 'remind them');
    expect(job(id).review.reminded).toBeUndefined();
    expect(last(id)).toMatchObject({ card: 'review' });
    expect(job(id).chat.some((m) => /nothing is sent until you press it/.test(m.text))).toBe(true);
    expect(publish(id, { plan: 'free', schedule: null })).toBe(false);
    update((s) => ({ ...s, reviewerAs: 'amina' }));
    reviewerDecision(id, 'approved', '');
    update((s) => ({ ...s, reviewerAs: null }));
    goOn(id);
    expect(step(id)).toEqual({ kind: 'publish' });
  });
});

describe('review before Reach and the flyer: each review state (section 19, phase 5, C)', () => {
  const amina = { name: 'Amina Yusuf', email: 'amina@riverstone.example.org', outside: false };
  const daniel = { name: 'Daniel Mwangi', email: 'daniel@riverstone.example.org', outside: false };
  const P5 = "We're hiring a Head of Programmes, P5, in Goma, fixed-term, closing 30 December 2026";
  /** An Amplify job past its checks and languages: the next step is review. */
  const toReview = (text?: string) => {
    const id = toPlan(text);
    sendChat(id, 'Amplify');
    for (let i = 0; i < 10 && ['market', 'full'].includes(step(id)?.kind ?? ''); i++) sendChat(id, 'Leave it as it is');
    sendChat(id, 'No other languages');
    return id;
  };
  const as = (who: string, decision: 'approved' | 'changes', note = '') => {
    update((s) => ({ ...s, reviewerAs: who }));
    reviewerDecision(job(lastId).id, decision, note);
    update((s) => ({ ...s, reviewerAs: null }));
  };
  let lastId = '';
  const open = (id: string) => reachOpen(job(id), getState());

  it('open: waiting, with Remind; nothing after review is offered, and Reach and the flyer stay closed by every route', () => {
    const id = (lastId = toReview());
    expect(step(id)).toEqual({ kind: 'review' });
    expect(open(id)).toBe(false);
    sendForReview(id, [amina], '2026-12-01', 'any', '');
    goOn(id);
    expect(step(id)).toEqual({ kind: 'waiting' });
    expect(last(id)).toMatchObject({ card: 'review' });
    expect(last(id)?.text).toContain('Reach and the flyer stay closed until it is approved.');
    expect(open(id)).toBe(false);
    const parts = partsOf(job(id), getState()).map((p) => p.key);
    expect(parts.indexOf('review')).toBeLessThan(parts.indexOf('reach'));
    expect(parts.indexOf('reach')).toBeLessThan(parts.indexOf('flyer'));
  });

  it('changes requested: the author edits and sends the next round; Reach and the flyer stay closed, and a flyer already made is out of date', () => {
    const id = (lastId = toReview());
    sendChat(id, 'No review');
    sendChat(id, 'Not now');
    expect(step(id)).toEqual({ kind: 'flyer' });
    markFlyerMade(id);
    expect(flyerStale(job(id), getState())).toBe(false);
    sendForReview(id, [amina], '2026-12-01', 'any', '');
    as('amina', 'changes', 'Shorten the duties');
    goOn(id);
    expect(step(id)).toEqual({ kind: 'waiting' });
    expect(last(id)?.text).toMatch(/^Amina asked for changes: “Shorten the duties”\. Make them here/);
    expect(last(id)?.text).toContain('The flyer made earlier is out of date.');
    expect(open(id)).toBe(false);
    expect(flyerStale(job(id), getState())).toBe(true);
    expect(partsOf(job(id), getState()).find((p) => p.key === 'flyer')?.label).toBe('Flyer (out of date)');
  });

  it('approved: Reach, then the flyer, then publish', () => {
    const id = (lastId = toReview());
    sendForReview(id, [amina], '2026-12-01', 'any', '');
    as('amina', 'approved');
    goOn(id);
    expect(open(id)).toBe(true);
    expect(step(id)).toEqual({ kind: 'reach' });
    sendChat(id, 'Not now');
    expect(step(id)).toEqual({ kind: 'flyer' });
    sendChat(id, 'No, thanks');
    expect(step(id)).toEqual({ kind: 'publish' });
  });

  it('approved, then a request for changes: the approval stands under "any one reviewer", and the chat says so', () => {
    const id = (lastId = toReview());
    sendForReview(id, [amina, daniel], '2026-12-01', 'any', '');
    as('amina', 'approved');
    as('daniel', 'changes', 'One more thing');
    goOn(id);
    expect(open(id)).toBe(true);
    expect(step(id)).toEqual({ kind: 'reach' });
    expect(last(id)?.text).toMatch(/^Daniel asked for changes after Amina approved\. Under your organisation’s rule one approval is enough, so it stands/);
  });

  it('approved, then a request for changes, where any request pauses publishing: it waits, and the chat says why', () => {
    const id = (lastId = toReview(P5));
    update((s) => ({ ...s, org: { ...s.org, changesPause: true } }));
    sendForReview(id, [amina, daniel], '2026-12-01', 'any', '');
    as('amina', 'approved');
    as('daniel', 'changes', 'One more thing');
    goOn(id);
    expect(open(id)).toBe(false);
    expect(step(id)).toEqual({ kind: 'waiting' });
    expect(last(id)?.text).toContain('any request for changes pauses publishing');
  });

  it('skipped by the owner where approval is required: Reach and the flyer, then publish, recorded as today', () => {
    const id = (lastId = toReview(P5));
    expect(step(id)).toEqual({ kind: 'review' });
    sendForReview(id, [amina], '2026-12-01', 'any', '');
    expect(overrideApproval(id, 'The deadline cannot move')).toBe(true);
    goOn(id);
    expect(open(id)).toBe(true);
    expect(step(id)).toEqual({ kind: 'reach' });
  });

  it('not required and not asked: straight to Reach', () => {
    const id = (lastId = toReview());
    sendChat(id, 'No review');
    expect(step(id)).toEqual({ kind: 'reach' });
    expect(open(id)).toBe(true);
  });

  it('an edit after approval reopens review and closes Reach and the flyer until the next approval', () => {
    const id = (lastId = toReview());
    sendForReview(id, [amina], '2026-12-01', 'any', '');
    as('amina', 'approved');
    goOn(id);
    expect(open(id)).toBe(true);
    const section = job(id).tags.find((k) => !['about', 'apply'].includes(k))!;
    editSection(id, section, 'A line changed after approval.');
    expect(open(id)).toBe(false);
    // Edit clears that section’s walk approval; re-approve, then the reopened review waits.
    approveSection(id, section);
    goOn(id);
    expect(step(id)).toEqual({ kind: 'waiting' });
  });

  it('a free standard job is never offered Reach or the flyer, by any route, including Publish without approval', () => {
    const id = (lastId = toPlan(P5));
    sendChat(id, 'Publish free');
    expect(step(id)).toEqual({ kind: 'review' });
    sendForReview(id, [amina], '2026-12-01', 'any', '');
    expect(overrideApproval(id, 'The deadline cannot move')).toBe(true);
    goOn(id);
    expect(step(id)).toEqual({ kind: 'publish' });
    expect(open(id)).toBe(false);
    expect(partsOf(job(id), getState()).some((p) => ['market', 'full', 'langs', 'reach', 'flyer'].includes(p.key))).toBe(false);
    expect(job(id).chat.some((m) => m.step === 'reach' || m.step === 'flyer')).toBe(false);
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
    if (job(id).setup === 'about') advanceFromAbout(id);
    if (job(id).setup === 'project') advanceFromProject(id);
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
    for (let i = 0; i < 10 && ['market', 'full'].includes(step(id)?.kind ?? ''); i++) sendChat(id, 'Leave it as it is');
    sendChat(id, 'No other languages');
    sendChat(id, 'No review');
    expect(step(id)).toEqual({ kind: 'reach' });
    sendChat(id, 'Invite ana.lopez@example.org, and my colleague amina@riverstone.example.org');
    expect(job(id).reachPlan).toMatchObject({ candidates: ['ana.lopez@example.org'], team: ['amina@riverstone.example.org'] });
    expect(job(id).chat.find((m) => m.text.startsWith('Added 1 to invite and 1 from your team'))).toBeDefined();
    sendChat(id, 'No, thanks');
    sendChat(id, 'Can you publish it on Monday?');
    expect(last(id)).toMatchObject({ card: 'publish' });
    expect(job(id).status).toBe('draft');
  });

  it('with a language version’s tab open, the rules leave the job’s own text alone', () => {
    const id = toPlan();
    sendChat(id, 'Amplify');
    for (let i = 0; i < 10 && ['market', 'full'].includes(step(id)?.kind ?? ''); i++) sendChat(id, 'Leave it as it is');
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
    for (let i = 0; i < 10 && ['market', 'full'].includes(step(id)?.kind ?? ''); i++) sendChat(id, 'Leave it as it is');
    sendChat(id, 'That is all for languages');
    expect(step(id)).toEqual({ kind: 'review' });
  });
});

describe('a free job is used, and a job profile kept, only when it is published (section 19)', () => {
  it('publishing free uses the free standard listing and saves a job profile, with Undo', () => {
    const id = toPlan();
    sendChat(id, 'Publish free');
    sendChat(id, 'No review');
    expect(step(id)).toEqual({ kind: 'publish' });
    expect(getState().free).toEqual({});
    expect(publish(id, { plan: 'free', schedule: null })).toBe(true);
    expect(getState().free).toEqual({ standard: id });
    const profile = getState().profiles?.[0];
    expect(profile).toMatchObject({ from: id, title: 'Logistics Officer', location: 'Goma, DR Congo' });
    expect(profile?.facts.deadline).toBeUndefined();
    expect(getState().notice).toMatchObject({ text: 'Saved as a job profile for next time: Logistics Officer, Goma.', unprofile: profile?.id });
    forgetProfile(profile!.id);
    expect(getState().profiles?.some((p) => p.id === profile!.id)).toBe(false);
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

  // Changed by phase 6 (section 19, E): no confirming per language; the organisation's wording per language in Settings, or a mark.
  it('in a job in another language, a fixed text shows the organisation’s wording for that language, else its own text marked to translate', () => {
    const id = startJob('Nous recherchons un chargé de logistique à Goma, CDD de 12 mois', undefined, [], true);
    applyTemplate(id, job(id).format);
    if (job(id).setup === 'about') advanceFromAbout(id);
    if (job(id).setup === 'project') advanceFromProject(id);
    chooseStyle(id, ['Warm']);
    setPace(id, 'all');
    update((s) => ({ ...s, org: { ...s.org, keepOffered: ['fixed', 'apply'] }, jobs: s.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, approved: [...j.tags], settled: [...ASKS, 'details', 'sdgs'] } } : j)) }));
    goOn(id);
    expect(step(id)).toEqual({ kind: 'fixed' });
    expect(last(id)?.text).toContain('Where your settings have no French wording, a text shows in English marked "to translate"');
    sendChat(id, 'Keep them');
    expect(getState().org.fixedLangs).toBeUndefined();
    const k = job(id).commitments[0];
    expect(fixedShown(job(id), getState(), k)).toMatchObject({ toTranslate: true, machine: false });
    update((s) => ({ ...s, org: { ...s.org, fixedWording: { fr: { [k]: 'Notre propre formulation.' } } } }));
    expect(fixedShown(job(id), getState(), k)).toMatchObject({ text: 'Notre propre formulation.', toTranslate: false, machine: false });
  });
});
