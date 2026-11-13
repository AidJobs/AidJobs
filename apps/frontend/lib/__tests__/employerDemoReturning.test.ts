import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  answerFact,
  CHANGE_SOMETHING,
  closeJob,
  goOn,
  greetState,
  hireAgain,
  publish,
  SAME_AS_LAST,
  sendChat,
  sendForReview,
  START,
  START_FRESH,
  startJob,
} from '../../components/employer-demo/actions';
import { contextFor } from '../../components/employer-demo/ai';
import { applyAiTurn } from '../../components/employer-demo/aiActions';
import { isSettled, nextStep, stepKey } from '../../components/employer-demo/flow';
import { stateActionsOf } from '../../components/employer-demo/lifecycle';
import { profileFor, profilesFromJobs } from '../../components/employer-demo/profiles';
import { recommendation, usualTemplate } from '../../components/employer-demo/setup';
import { getState, resetDemo, update } from '../../components/employer-demo/store';
import { ALL_GOOD, KEEP_AS_IS, NOTHING_ELSE } from '../../components/employer-demo/walkChat';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const last = (id: string) => job(id).chat.at(-1);
const open = jest.fn();

beforeEach(() => {
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
  open.mockClear();
});

describe('a returning employer: the usual template and one confirmation (section 19, phase 4)', () => {
  it('the usual template is the one the organisation used most, recommended with its reason', () => {
    expect(usualTemplate(getState())).toEqual({ key: 'house', count: 7 });
    expect(recommendation(getState(), 'house').reason).toBe('your usual template, used for 7 of your jobs');
    update((s) => ({ ...s, jobs: [] }));
    expect(usualTemplate(getState())).toBeNull();
  });

  it('steps 2 and 3 become one confirmation: the usual template, in the organisation’s style, at the pace of last time', () => {
    const id = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    expect(job(id).setup).toBe('template');
    expect(last(id)).toMatchObject({ step: 'setup:usual', quick: [START, CHANGE_SOMETHING] });
    expect(last(id)?.text).toContain('I\'ll use your **Riverstone format** (7 of your jobs use it): 7 sections for this job, in your style (warm, plain English, speaks as "we", rights-based), one section at a time. Shall I start?');
    update((s) => ({ ...s, pace: 'all' }));
    const again = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    expect(last(again)?.text).toContain('all of it first, then through it with you as last time. Shall I start?');
  });

  it('"Start" applies the template, the style, and the pace at once, and writing begins', () => {
    const id = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    sendChat(id, START);
    expect(job(id)).toMatchObject({ setup: undefined, format: 'house', style: getState().org.voice, tone: 'warm' });
    expect(job(id).walk?.pace).toBe('step');
    expect(getState().pace).toBe('step');
    expect(job(id).chat.some((m) => m.text.startsWith('Starting with your Riverstone format, written warmly'))).toBe(true);
    // About us is part of the job since phase 5: it is written in its turn, not put in from the profile at the start.
    expect(job(id).sections.map((x) => x.key)).toEqual(['apply']);
    expect(nextStep(job(id), getState())?.kind).not.toBe('setup');
  });

  it('"Change something" goes to the template step of a new employer; a yes then takes the recommended template', () => {
    const id = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    sendChat(id, CHANGE_SOMETHING);
    expect(job(id).setup).toBe('template');
    expect(last(id)).toMatchObject({ step: 'setup:template' });
    expect(last(id)?.text).toMatch(/^Then the template first\. I'd use \*\*Riverstone format\*\*, your usual template, used for 7 of your jobs/);
    expect(last(id)?.quick).toContain('See all formats');
    sendChat(id, 'yes');
    expect(job(id).setup).toBe('style');
  });

  it('a new employer, with no job written yet, gets the template step as before', () => {
    update((s) => ({ ...s, jobs: [], profiles: [] }));
    const id = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    expect(last(id)?.step).toBe('setup:template');
    expect(last(id)?.text).toContain('First, the template.');
  });
});

describe('saved job profiles (section 19, phase 4)', () => {
  it('jobs published before profiles were saved leave one each', () => {
    const titles = (getState().profiles ?? []).map((p) => `${p.title}, ${p.location}`);
    expect(titles).toEqual(expect.arrayContaining(['Child Protection Specialist, Kampala, Uganda', 'MEAL Coordinator, Addis Ababa, Ethiopia', 'Health Officer, Goma, DR Congo']));
    expect(titles).not.toContain('Finance Officer, Juba, South Sudan');
    expect(profilesFromJobs(getState().jobs).every((p) => p.facts.deadline === undefined)).toBe(true);
  });

  it('a profile for the role is offered first, and "Same as last time" starts from it; the dates and positions are asked', () => {
    const id = startJob("We're hiring a Child Protection Specialist in Kampala", undefined, [], true);
    expect(last(id)).toMatchObject({ step: 'setup:profile', quick: [SAME_AS_LAST, START_FRESH] });
    expect(last(id)?.text).toContain('Same as your last **Kampala Child Protection Specialist**?');
    sendChat(id, SAME_AS_LAST);
    const j = job(id);
    expect(j.setup).toBeUndefined();
    expect(j.format).toBe('house');
    expect(j.tags).toContain('assessment');
    expect(j.facts).toMatchObject({ contract: 'Fixed-term', grade: 'C1', salaryMode: 'range', salaryMin: '3,900', salaryMax: '4,400', currency: 'USD', safeguarding: 'high', deadline: '' });
    for (const k of ['eligibility', 'languages', 'salary', 'method', 'fixed']) expect(isSettled(k, j)).toBe(true);
    expect(isSettled('deadline', j)).toBe(false);
    expect(isSettled('details', j)).toBe(false);
    expect(j.audit.at(-1)?.what).toBe('Started from the job profile of Kampala Child Protection Specialist');
  });

  it('the place typed now is kept; "Start fresh" offers the usual template instead', () => {
    const goma = startJob("We're hiring a Child Protection Specialist in Goma", undefined, [], true);
    expect(profileFor(getState(), job(goma))?.location).toBe('Kampala, Uganda');
    sendChat(goma, 'same as last time');
    expect(job(goma).facts.location).toBe('Goma, DR Congo');
    const fresh = startJob("We're hiring a Child Protection Specialist in Kampala", undefined, [], true);
    sendChat(fresh, START_FRESH);
    expect(job(fresh).setup).toBe('template');
    expect(last(fresh)).toMatchObject({ step: 'setup:usual', quick: [START, CHANGE_SOMETHING] });
  });
});

describe('Hire again (the user’s choice, 12 November 2026)', () => {
  it('keeps the text, and carries no approvals, plan choice, part, or language versions and their payments', () => {
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === 'job-health' ? { ...j, choice: 'amplify' as const, part: 'publish', paidVia: 'package' as const, langsPaid: 2, payWith: 'three' as const, translations: { fr: { sections: j.sections, reviewed: true, source: '', at: 0 } }, review: { ...j.review, state: 'approved' as const, approvedVersion: 1 } } : j)),
    }));
    const from = job('job-health');
    const id = hireAgain('job-health')!;
    const copy = job(id);
    expect(copy.status).toBe('draft');
    expect(copy.sections.map((x) => x.key)).toEqual(from.tags);
    expect(copy.sections.find((x) => x.key === 'responsibilities')?.lines).toEqual(from.sections.find((x) => x.key === 'responsibilities')?.lines);
    for (const k of ['choice', 'part', 'paidVia', 'langsPaid', 'payWith', 'translations', 'publishOn'] as const) expect(copy[k]).toBeUndefined();
    expect(copy.review).toMatchObject({ state: 'none', reviewers: [] });
    expect(copy.review.approvedVersion).toBeUndefined();
  });

  it('the chat asks first what changes (the dates, positions, and place), then each section for a quick "keep as is"', () => {
    const id = hireAgain('job-log')!;
    expect(nextStep(job(id), getState())).toEqual({ kind: 'again' });
    expect(last(id)).toMatchObject({ step: 'again', quick: [NOTHING_ELSE, 'Change the closing date', 'Change the place', 'Change the positions'] });
    expect(last(id)?.text).toMatch(/^A new job from your Logistics Assistant, Kampala, with its text\. First, what changes\? For now it closes on .+, for 1 position, in Kampala, Uganda\.$/);
    sendChat(id, 'Change the closing date');
    expect(last(id)).toMatchObject({ text: 'When do applications close?', ask: 'deadline' });
    answerFact(id, { deadline: '2026-12-30' }, '30 December 2026', 'deadline');
    expect(job(id).facts.deadline).toBe('2026-12-30');
    expect(last(id)?.text).toMatch(/^Anything else that changes\? Now it closes on 30 December 2026/);
    sendChat(id, '3 positions');
    expect(job(id).facts.positions).toBe('3');
    sendChat(id, 'it is based in Gulu, Uganda now');
    expect(job(id).facts.location).toMatch(/^Gulu/);
    sendChat(id, NOTHING_ELSE);
    expect(nextStep(job(id), getState())).toEqual({ kind: 'approve', section: 'about' });
    expect(last(id)).toMatchObject({ text: '**About us**, as in your Logistics Assistant, Kampala: keep it as it is, or change something?', quick: [KEEP_AS_IS, ALL_GOOD] });
    sendChat(id, KEEP_AS_IS);
    expect(job(id).walk?.approved).toContain('about');
  });
});

describe('jobs opened in their state (section 19, phase 4)', () => {
  it('offers exactly section 17’s actions for the state, with its permission rules', () => {
    const s = getState();
    expect(stateActionsOf(s, job('job-cps'))).toEqual(['extend', 'share', 'filled', 'close', 'withdraw', 'delete']);
    expect(stateActionsOf(s, job('job-meal'))).toEqual(['extend', 'share', 'amplify', 'filled', 'close', 'withdraw', 'delete']);
    expect(stateActionsOf(s, job('job-health'))).toEqual(['reopen', 'hire', 'download']);
    expect(stateActionsOf(s, job('job-wash-2026'))).toEqual(['hire', 'download']);
    expect(stateActionsOf(s, { ...job('job-fin'), status: 'scheduled' })).toEqual(['publishNow', 'reschedule', 'backToDraft', 'delete']);
    expect(stateActionsOf(s, job('job-comms'))).toEqual([]);
    expect(stateActionsOf({ ...s, me: { ...s.me, role: 'member' } }, job('job-cps'))).not.toContain('delete');
    expect(stateActionsOf({ ...s, reviewerAs: 'amina' }, job('job-cps'))).toEqual([]);
  });

  it('the chat opens with one message for the state, once, with the card of its actions', () => {
    greetState('job-cps');
    expect(last('job-cps')).toMatchObject({ state: 'live', card: 'state', text: 'This job is live: edits go live at once, and its page says Updated. You can extend it, share it, mark the position filled, close it now, withdraw it, or delete it.' });
    const n = job('job-cps').chat.length;
    greetState('job-cps');
    expect(job('job-cps').chat.length).toBe(n);
    greetState('job-health');
    expect(last('job-health')?.text).toMatch(/^This job closed on .+: it was closed early, so candidates can no longer apply\. It can be reopened until .+\. You can reopen it, hire again, or download a copy\.$/);
    update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === 'job-fin' ? { ...j, status: 'scheduled' as const, scheduledFor: '2099-01-01' } : j)) }));
    greetState('job-fin');
    expect(last('job-fin')?.text).toMatch(/^Scheduled for 1 January 2099; it goes live that day\. Edits are kept for the go-live\. You can publish it now, change the date, take it back to a draft, or delete it\.$/);
  });

  it('an approved job is ready to publish, with the publish card; the steps do not ask again', () => {
    greetState('job-fin');
    expect(last('job-fin')).toMatchObject({ state: 'approved', card: 'publish', text: 'Approved by Amina: ready to publish. An edit sends it back to review.' });
    expect(last('job-fin')?.step).toBe(stepKey(nextStep(job('job-fin'), getState())));
    const n = job('job-fin').chat.length;
    goOn('job-fin');
    expect(job('job-fin').chat.length).toBe(n);
  });

  it('in review: who it waits for and the due date, with the Remind card; a draft picks up where it left off', () => {
    sendForReview('job-comms', [{ name: 'Amina Yusuf', email: 'amina@riverstone.example.org', outside: false }], '2099-01-05', 'any', '');
    greetState('job-comms');
    expect(last('job-comms')).toMatchObject({ state: 'review', card: 'review', text: 'This job is in review: waiting for Amina, due 5 January 2099. You can keep editing; an edit resets any approval already given.' });
    resetDemo();
    greetState('job-comms');
    expect(last('job-comms')).toMatchObject({ ask: 'deadline', text: 'For the listing: When do applications close?' });
    update((s) => ({ ...s, reviewerAs: 'amina' }));
    const n = job('job-cps').chat.length;
    greetState('job-cps');
    expect(job('job-cps').chat.length).toBe(n);
  });

  it('a job written in the window and then closed reads as closed, not live', () => {
    const id = hireAgain('job-log')!;
    publish(id, { plan: 'free', schedule: null });
    goOn(id);
    expect(last(id)?.step).toBe('live');
    closeJob(id, 'early');
    goOn(id);
    greetState(id);
    expect(job(id).chat.slice(-1).every((m) => !m.text.includes("It's live"))).toBe(true);
    expect(last(id)).toMatchObject({ state: 'closed' });
  });

  it('the AI is told the state and its actions; it may open only a dialog the state allows, and never changes a state', () => {
    const ctx = contextFor(getState(), job('job-cps'), undefined, false);
    expect(ctx.job.stateActions.map((a) => a.key)).toEqual(['extend', 'share', 'filled', 'close', 'withdraw', 'delete']);
    applyAiTurn('job-cps', 'extend it', { reply: 'Here is the dialog.', actions: [{ type: 'open', target: 'extend' }] }, open);
    expect(open.mock.calls).toEqual([['extend']]);
    open.mockClear();
    applyAiTurn('job-cps', 'reopen it', { reply: 'Opening it.', actions: [{ type: 'open', target: 'reopen' }, { type: 'close_job' }] }, open);
    expect(open).not.toHaveBeenCalled();
    expect(job('job-cps').status).toBe('live');
    expect(last('job-cps')?.text).toMatch(/Not done: an action the demo does not have \("close_job"\); reopen: not for a job that is live\.$/);
    applyAiTurn('job-cps', 'what can I do?', { reply: 'These.', actions: [{ type: 'show', card: 'state' }] }, open);
    expect(last('job-cps')?.card).toBe('state');
  });

  it('the AI is told the returning employer’s offer, and starts from it only through its own checked actions', () => {
    const id = startJob("We're hiring a Child Protection Specialist in Kampala", undefined, [], true);
    const ctx = contextFor(getState(), job(id), undefined, true);
    expect(ctx.returning).toMatchObject({ usual: { key: 'house', label: 'Riverstone format', jobs: 7 }, pace: null, profile: { name: 'Kampala Child Protection Specialist' } });
    applyAiTurn(id, 'yes', { reply: 'Starting.', actions: [{ type: 'use_profile', profile: 'someone-else' }] }, open);
    expect(job(id).setup).toBe('template');
    expect(last(id)?.text).toContain('Not done: a saved job profile that is not offered for this job.');
    applyAiTurn(id, 'just start', { reply: 'Starting.', actions: [{ type: 'start' }] }, open);
    expect(job(id).setup).toBeUndefined();
    expect(job(id).format).toBe('house');
  });
});
