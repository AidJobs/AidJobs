import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  addTranslation,
  amplifyLive,
  applyFix,
  applyFormat,
  approvalRequired,
  askToPay,
  basePattern,
  buy,
  cancelPayRequest,
  cancelSubscription,
  closeJob,
  canSkipApproval,
  changedSinceLastRound,
  changesAfterApproval,
  backToDraft,
  canDelete,
  closeAtListingEnd,
  completePayRequest,
  declineTell,
  freeNeed,
  letLeaveList,
  publishNow,
  reschedule,
  rescheduleBlock,
  tellInvited,
  deleteJob,
  dismissMoment,
  editSection,
  editTranslation,
  extend,
  hireAgain,
  isApproved,
  markGenuine,
  overrideApproval,
  overruleChanges,
  publish,
  publishBlock,
  refreshTranslation,
  remindPayer,
  remindReviewers,
  removeTranslation,
  reorderSections,
  restoreVersion,
  restoreDeleted,
  resumeSubscription,
  reviewerDecision,
  reviewTranslation,
  saveEditedBase,
  sendChat,
  sendForReview,
  sendReach,
  setReachPlan,
  setReachReminders,
  settleRemark,
  setApply,
  setFacts,
  startJob,
  toggleSection,
  undoLastChange,
} from '../../components/employer-demo/actions';
import { article, daysUntil, isoDay, parseIso } from '../../components/employer-demo/engine';
import { needsYou, statusLine } from '../../components/employer-demo/Home';
import { goLive, planFor, REACH_EMAILS, reachMoment, reachUsed, recipientsOf } from '../../components/employer-demo/invites';
import { basicAdvertCheck, fullAdvertCheck, marketCheck } from '../../components/employer-demo/market';
import { purgeDeleted } from '../../components/employer-demo/lifecycle';
import { langOf, publicLangs, stale, untranslated } from '../../components/employer-demo/translate';
import { addMonths, canGoFree, currentMonth, delisted, firstOfNextMonth, freeLeft, listedUntil, listingEnd, listingEndsIn, paidJobsLeft, rollBilling, singlePrice } from '../../components/employer-demo/plans';
import { changesSince, tellOffer } from '../../components/employer-demo/changes';
import { getState, resetDemo, undo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const blocked = (id: string) => approvalRequired(getState(), job(id)) && !isApproved(job(id));
const outlineMatchesDocument = (id: string) => expect(job(id).sections.map((x) => x.key)).toEqual(job(id).tags);

beforeEach(() => {
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
});

describe('undo never throws away later work', () => {
  it('a deleted draft comes back from Recently deleted', () => {
    deleteJob('job-comms');
    expect(getState().jobs.some((j) => j.id === 'job-comms')).toBe(false);
    expect(getState().notice?.restore).toBe('job-comms');
    expect(restoreDeleted('job-comms')).toBe(true);
    expect(getState().jobs.some((j) => j.id === 'job-comms')).toBe(true);
  });

  it('restoring a deleted job after creating another keeps the new job', () => {
    deleteJob('job-comms');
    const id = startJob('We are hiring a Nutrition Officer in Juba');
    restoreDeleted('job-comms');
    expect(getState().jobs.some((j) => j.id === id)).toBe(true);
    expect(getState().jobs.some((j) => j.id === 'job-comms')).toBe(true);
  });

  it('a later hand edit ends the chance to undo the chat change, and is kept', () => {
    sendChat('job-comms', 'shorten the responsibilities');
    const change = job('job-comms').lastChange;
    expect(change).toBeTruthy();
    const other = job('job-comms').sections.find((x) => !change!.keys.includes(x.key))!;
    editSection('job-comms', other.key, 'My own careful text');
    expect(job('job-comms').lastChange).toBeUndefined();
    undoLastChange('job-comms');
    expect(job('job-comms').sections.find((x) => x.key === other.key)?.lines).toEqual(['My own careful text']);
  });

  it('"undo that" puts back the outline with the text, so the two agree', () => {
    const extra = ['firstweeks', 'team', 'practical', 'assessment'].find((k) => !job('job-comms').tags.includes(k))!;
    toggleSection('job-comms', extra);
    sendChat('job-comms', 'make it more formal');
    sendChat('job-comms', 'undo that');
    outlineMatchesDocument('job-comms');
    expect(job('job-comms').tags).toContain(extra);
    expect(job('job-comms').lastChange).toBeUndefined();
  });

  it('restoring an earlier version brings its outline too', () => {
    const before = job('job-comms').versions.length;
    const extra = ['firstweeks', 'team', 'practical', 'assessment'].find((k) => !job('job-comms').tags.includes(k))!;
    toggleSection('job-comms', extra);
    expect(job('job-comms').versions.length).toBe(before + 1);
    restoreVersion('job-comms', before);
    outlineMatchesDocument('job-comms');
    expect(job('job-comms').tags).not.toContain(extra);
  });
});

describe('a change to an approved job needs a new approval', () => {
  it('the sample Finance Officer is approved, so it can be published', () => {
    expect(job('job-fin').status).toBe('approved');
    expect(job('job-fin').review.state).toBe('approved');
    expect(blocked('job-fin')).toBe(false);
  });

  it('a hand edit withdraws the approval and sends the job back to review', () => {
    editSection('job-fin', 'responsibilities', '- Something completely different');
    expect(isApproved(job('job-fin'))).toBe(false);
    expect(job('job-fin').status).toBe('review');
    expect(blocked('job-fin')).toBe(true);
  });

  it('a fact change after a full approval blocks publishing too', () => {
    update((s) => ({ ...s, reviewerAs: 'daniel' }));
    reviewerDecision('job-fin', 'approved', '');
    update((s) => ({ ...s, reviewerAs: null }));
    setFacts('job-fin', { grade: 'D2' });
    expect(job('job-fin').status).toBe('review');
    expect(blocked('job-fin')).toBe(true);
  });

  it('a message or a click that changes nothing keeps the approval', () => {
    const versions = job('job-fin').versions.length;
    const text = JSON.stringify(job('job-fin').sections);
    sendChat('job-fin', 'thanks');
    sendChat('job-fin', `make it more ${job('job-fin').tone}`);
    sendChat('job-fin', 'can you make it better?');
    expect(JSON.stringify(job('job-fin').sections)).toBe(text);
    setFacts('job-fin', { grade: job('job-fin').facts.grade, contract: job('job-fin').facts.contract });
    expect(blocked('job-fin')).toBe(false);
    expect(job('job-fin').status).toBe('approved');
    expect(job('job-fin').versions.length).toBe(versions);
  });

  it.each([
    ['restoring a version', () => restoreVersion('job-fin', 1)],
    ['moving a section', () => reorderSections('job-fin', [...job('job-fin').tags.filter((k) => ['responsibilities', 'requirements'].includes(k))].reverse())],
    ['changing the JD format', () => applyFormat('job-fin', 'un-agency')],
    ['adding a section', () => toggleSection('job-fin', ['firstweeks', 'team', 'practical'].find((k) => !job('job-fin').tags.includes(k))!)],
  ])('%s withdraws the approval', (_, change) => {
    change();
    expect(blocked('job-fin')).toBe(true);
  });
});

describe('only real changes count', () => {
  it('saving a section unchanged, or choosing the How to apply option already chosen, keeps the approval', () => {
    const sec = job('job-fin').sections.find((x) => x.key === 'responsibilities')!;
    editSection('job-fin', 'responsibilities', sec.lines.map((l) => (l.startsWith('- ') ? `• ${l.slice(2)}` : l)).join('\n'));
    setApply('job-fin', { method: job('job-fin').apply.method });
    expect(blocked('job-fin')).toBe(false);
    expect(job('job-fin').status).toBe('approved');
  });

  it('extending the closing date ends the undo of an earlier chat change, so undo cannot bring the old date back', () => {
    sendChat('job-comms', 'shorten the responsibilities');
    expect(job('job-comms').lastChange).toBeTruthy();
    extend('job-comms', 7);
    expect(job('job-comms').lastChange).toBeUndefined();
  });
});

describe('the chat reads what was meant', () => {
  const lastReply = (id: string) => job(id).chat.slice(-2).map((m) => m.text).join(' ');
  const text = (id: string) => JSON.stringify(job(id).sections);

  it.each(['ok, thanks', 'great, thank you!', 'no thanks', 'looks great', 'thanks a lot', 'Yes please', 'Looks good to me', 'Sounds good', 'Great job', 'Love it', 'please include something about safeguarding', 'try again', 'can you make it better?'])(
    '"%s" changes nothing',
    (said) => {
      const before = text('job-comms');
      sendChat('job-comms', said);
      expect(text('job-comms')).toBe(before);
    },
  );

  it.each([
    'Experience in human rights monitoring is an asset',
    'The post has two direct reports',
    'Use of KoboToolbox is an asset',
    'Set up and run community feedback mechanisms',
    'Change management experience is an asset',
    'Make regular field visits to project sites',
    'Edit and proofread donor reports',
    'Include gender analysis in all assessments',
    'Sound knowledge of IPSAS and a formal accounting qualification',
    'Expand partnerships with local NGOs',
    'Cut through complexity to explain results to donors',
  ])('"%s" is added as text, with the same tone and sections', (said) => {
    const tone = job('job-comms').tone;
    const tags = job('job-comms').tags;
    sendChat('job-comms', said);
    expect(text('job-comms')).toContain(said);
    expect(job('job-comms').tone).toBe(tone);
    expect(job('job-comms').tags).toEqual(tags);
  });

  it('"Add value through cross-team learning" is text, not the Team purpose section', () => {
    const tags = job('job-comms').tags;
    sendChat('job-comms', 'Add value through cross-team learning');
    expect(job('job-comms').tags).toEqual(tags);
  });

  it.each([
    ['more formal please', 'warm', 'formal'],
    ['can you make it more formal', 'warm', 'formal'],
    ['make it sound more formal', 'warm', 'formal'],
    ['too formal', 'formal', 'warm'],
    ['less formal please', 'formal', 'warm'],
    ['not so formal', 'formal', 'warm'],
    ['more casual', 'formal', 'warm'],
    ['use a friendlier tone', 'formal', 'warm'],
    ['less warm', 'warm', 'formal'],
    ['plainer', 'warm', 'plain'],
  ])('"%s" turns a %s job %s', (said, from, to) => {
    if (job('job-comms').tone !== from) sendChat('job-comms', from === 'formal' ? 'more formal' : from === 'warm' ? 'warmer' : 'plainer');
    expect(job('job-comms').tone).toBe(from);
    sendChat('job-comms', said);
    expect(job('job-comms').tone).toBe(to);
  });

  it.each(['please undo', 'undo that please', 'go back'])('"%s" undoes the last change', (said) => {
    const before = text('job-comms');
    sendChat('job-comms', 'shorten the responsibilities');
    expect(text('job-comms')).not.toBe(before);
    sendChat('job-comms', said);
    expect(text('job-comms')).toBe(before);
  });

  it.each(['shorter', 'make the responsibilities shorter', 'shorten the responsibilities'])('"%s" shortens', (said) => {
    const before = text('job-comms');
    sendChat('job-comms', said);
    expect(text('job-comms')).not.toBe(before);
  });

  it('"more formal" and "make it warmer" change the tone; asking for the tone it has says so', () => {
    sendChat('job-comms', 'more formal');
    expect(job('job-comms').tone).toBe('formal');
    sendChat('job-comms', 'make it more formal');
    expect(lastReply('job-comms')).toMatch(/already/);
    sendChat('job-comms', 'make it warmer');
    expect(job('job-comms').tone).toBe('warm');
  });

  it('"undo" alone undoes the last change', () => {
    const before = text('job-comms');
    sendChat('job-comms', 'shorten the responsibilities');
    sendChat('job-comms', 'undo');
    expect(text('job-comms')).toBe(before);
  });
});

describe('reviewers comment and decide, but never change the job', () => {
  beforeEach(() => update((s) => ({ ...s, reviewerAs: 'amina' })));

  it('cannot edit, restore, add sections, or keep highlighted wording', () => {
    const before = JSON.stringify(job('job-fin'));
    editSection('job-fin', 'responsibilities', '- Changed by a reviewer');
    restoreVersion('job-fin', 1);
    toggleSection('job-fin', 'team');
    setFacts('job-fin', { grade: 'P2' });
    markGenuine('job-fin', 'rule:about:word', 'A reason given by a reviewer');
    settleRemark('job-fin', 'r1', 'accepted');
    overrideApproval('job-fin', 'A reviewer cannot override');
    sendChat('job-fin', 'make it shorter');
    expect(deleteJob('job-fin')).toBe(false);
    expect(JSON.stringify(job('job-fin'))).toBe(before);
  });
});

describe('managing jobs: scheduled jobs, changes since publishing, the listing end (plan section 17, phase 2)', () => {
  const DAY = 86_400_000;
  const tomorrow = () => isoDay(getState().today + DAY);
  const scheduleAmplified = () => {
    setReachPlan('job-fin', { candidates: ['a@example.org', 'b@example.org'], team: [], candidateMsg: { subject: 's', body: 'b', closing: 'c' }, teamMsg: { subject: 's', body: 'b', closing: 'c' } });
    expect(publish('job-fin', { plan: 'amplify', schedule: tomorrow(), paid: 'direct' })).toBe(true);
  };
  const freeJobFor = (months: number) => {
    const id = startJob('Hiring a Shelter Officer in Goma');
    setFacts(id, { deadline: isoDay(getState().today + (months * 31 + 20) * DAY) });
    return id;
  };

  it('Publish now sends the waiting Reach emails and lists the job from today', () => {
    scheduleAmplified();
    expect(job('job-fin').reach?.candidates.every((r) => r.status === 'waiting')).toBe(true);
    expect(publishNow('job-fin')).toBe(true);
    expect(job('job-fin').status).toBe('live');
    expect(job('job-fin').scheduledFor).toBeUndefined();
    expect(job('job-fin').reach?.candidates.some((r) => r.status === 'waiting')).toBe(false);
    expect(job('job-fin').published?.facts.title).toBe('Finance Officer');
  });

  it('a free job scheduled into next month needs one of this month\'s free jobs to publish now; next month\'s stays used', () => {
    const next = firstOfNextMonth(currentMonth(getState()));
    const a = freeJobFor(2);
    expect(publish(a, { plan: 'free', schedule: next })).toBe(true);
    expect(freeNeed(getState(), job(a), currentMonth(getState()))).toBe('use');
    expect(publishNow(a)).toBe(true);
    expect(getState().freeUses.filter((u) => u.jobId === a).map((u) => u.month).sort()).toEqual([currentMonth(getState()), next.slice(0, 7)].sort());

    const b = freeJobFor(2);
    expect(publish(b, { plan: 'free', schedule: next })).toBe(true);
    expect(freeLeft(getState())).toBe(0);
    expect(freeNeed(getState(), job(b), currentMonth(getState()))).toBe('none-left');
    expect(publishNow(b)).toBe(false);
    expect(job(b).status).toBe('scheduled');
  });

  it('Change the date keeps the scheduling checks and moves the waiting emails', () => {
    scheduleAmplified();
    const later = isoDay(getState().today + 5 * DAY);
    expect(rescheduleBlock(getState(), job('job-fin'), isoDay(getState().today))).toBe('Choose a date from tomorrow');
    expect(rescheduleBlock(getState(), job('job-fin'), job('job-fin').facts.deadline)).toBe('It would close before it goes live');
    expect(reschedule('job-fin', later)).toBe(true);
    expect(job('job-fin').scheduledFor).toBe(later);
    expect(job('job-fin').reach?.rounds.at(-1)?.sendsOn).toBe(later);
  });

  it('Back to draft keeps the Reach emails prepared and the payment: publishing again costs nothing', () => {
    scheduleAmplified();
    update((s) => ({ ...s, packs: [{ id: 'p', jobs: 3, left: 2, ends: isoDay(s.today + 30 * DAY), at: s.today }] }));
    expect(backToDraft('job-fin')).toBe(true);
    expect(job('job-fin').status).toBe('approved');
    expect(job('job-fin').paidFor).toBe(true);
    expect(job('job-fin').reach).toBeNull();
    expect(job('job-fin').reachPlan?.candidates).toEqual(['a@example.org', 'b@example.org']);
    expect(publishBlock(getState(), 'job-fin', { plan: 'amplify', schedule: null })).toBeNull();
    expect(publish('job-fin', { plan: 'amplify', schedule: null, paid: 'onHand' })).toBe(true);
    expect(getState().packs[0].left).toBe(2);
    expect(job('job-fin').paidFor).toBeUndefined();
    expect(job('job-fin').reach?.candidates).toHaveLength(2);
  });

  it('shows what changed since publishing, and offers once to tell the people Reach invited, counting the emails', () => {
    const used = reachUsed(job('job-cps'));
    extend('job-cps', 7);
    expect(job('job-cps').editedAt).toBeTruthy();
    expect(changesSince(job('job-cps')).map((c) => c.label)).toEqual(['Closing date']);
    const offer = tellOffer(job('job-cps'));
    expect(offer?.count).toBe(5);
    expect(tellInvited('job-cps')).toBe(true);
    expect(reachUsed(job('job-cps'))).toBe(used + 5);
    expect(tellOffer(job('job-cps'))).toBeNull();
    setFacts('job-cps', { location: 'Gulu, Uganda' });
    expect(tellOffer(job('job-cps'))?.changes.map((c) => c.label)).toEqual(['Duty station']);
    declineTell('job-cps');
    expect(tellOffer(job('job-cps'))).toBeNull();
  });

  it('a free job, or a change that is not important, makes no offer', () => {
    extend('job-meal', 7);
    expect(changesSince(job('job-meal')).length).toBeGreaterThan(0);
    expect(tellOffer(job('job-meal'))).toBeNull();
    setFacts('job-cps', { grade: 'C2' });
    expect(tellOffer(job('job-cps'))).toBeNull();
  });

  it('a free listing ending before the closing date: reminders in the last 7 days, close on the last listed day, or leave the list', () => {
    const s = getState();
    expect(listingEndsIn(job('job-liv'), s.today)).toBe(5);
    expect(needsYou(s, job('job-liv'))).toBe(true);
    closeAtListingEnd('job-liv');
    expect(job('job-liv').facts.deadline).toBe(listingEnd(job('job-liv'), getState().today));
    expect(listingEndsIn(job('job-liv'), getState().today)).toBeNull();
    undo();
    letLeaveList('job-liv');
    expect(listingEndsIn(job('job-liv'), getState().today)).toBeNull();
    expect(delisted(job('job-liv'), getState().today)).toBe(false);
    expect(delisted(job('job-liv'), getState().today + 6 * DAY)).toBe(true);
    expect(statusLine({ ...getState(), today: getState().today + 6 * DAY }, job('job-liv'))).toBe('Live · no longer listed on AidJobs');
  });
});

describe('managing jobs: delete, restore, erase, withdraw (plan section 17)', () => {
  const DAY = 86_400_000;
  const deleted = () => getState().deleted ?? [];

  it('a live job is deleted with its pay request and waiting emails; receipts, the free use, and a public "gone" answer stay', () => {
    const before = getState().receipts.length;
    const used = getState().freeUses.filter((u) => u.jobId === 'job-meal').length;
    const reach = job('job-cps').reach!;
    update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === 'job-meal' ? { ...j, payRequest: { name: 'Finance', email: 'finance@example.org', note: '', key: 'one', amount: '$28.40', item: 'Amplify: MEAL Coordinator', schedule: null, at: s.today }, reach: { ...reach, candidates: [...reach.candidates, { email: 'later@example.org', status: 'waiting', round: 1 }] } } : j)) }));
    expect(used).toBe(1);
    expect(deleteJob('job-meal', { reviewers: true, reach: true })).toBe(true);
    const d = deleted().find((x) => x.job.id === 'job-meal')!;
    expect(d.job.payRequest).toBeUndefined();
    expect(d.job.reach?.candidates.some((r) => r.status === 'waiting')).toBe(false);
    expect(d.told.some((t) => t.includes('Reach invited'))).toBe(true);
    expect(getState().gone).toContain('job-meal');
    expect(getState().receipts.length).toBe(before);
    expect(getState().freeUses.filter((u) => u.jobId === 'job-meal').length).toBe(used);
    expect(getState().inbox.some((i) => i.jobId === 'job-meal')).toBe(false);
    expect(getState().activity?.[0].what).toContain('Deleted "MEAL Coordinator"');
  });

  it('a draft leaves no "gone" answer, since it was never public', () => {
    deleteJob('job-comms');
    expect(getState().gone ?? []).not.toContain('job-comms');
  });

  it('only the owner deletes or restores a published job; a member may delete a draft', () => {
    update((s) => ({ ...s, me: { ...s.me, role: 'member' } }));
    expect(canDelete(getState(), job('job-cps'))).toMatch(/Only the owner/);
    expect(deleteJob('job-cps')).toBe(false);
    expect(deleteJob('job-comms')).toBe(true);
    update((s) => ({ ...s, me: { ...s.me, role: 'owner' } }));
    deleteJob('job-cps');
    update((s) => ({ ...s, me: { ...s.me, role: 'member' } }));
    expect(restoreDeleted('job-cps')).toBe(false);
  });

  it('a restored job comes back at the same address and stops answering "gone"', () => {
    deleteJob('job-cps');
    restoreDeleted('job-cps');
    expect(job('job-cps').status).toBe('live');
    expect(getState().gone ?? []).not.toContain('job-cps');
    expect(deleted().some((x) => x.job.id === 'job-cps')).toBe(false);
  });

  it('after 14 days a deleted job is erased, leaving one line in the activity log', () => {
    deleteJob('job-comms');
    update((s) => purgeDeleted({ ...s, today: s.today + 13 * DAY }));
    expect(deleted().some((x) => x.job.id === 'job-comms')).toBe(true);
    update((s) => purgeDeleted({ ...s, today: s.today + 2 * DAY }));
    expect(deleted().some((x) => x.job.id === 'job-comms')).toBe(false);
    expect(restoreDeleted('job-comms')).toBe(false);
    expect(getState().activity?.some((a) => a.what.startsWith('Erased for good: "Communications Intern"'))).toBe(true);
  });

  it('withdrawing records the reason in the history only; reviewers cannot withdraw', () => {
    update((s) => ({ ...s, reviewerAs: 'amina' }));
    closeJob('job-cps', 'withdrawn', false, 'Funding ended');
    expect(job('job-cps').status).toBe('live');
    update((s) => ({ ...s, reviewerAs: null }));
    closeJob('job-cps', 'withdrawn', false, 'Funding ended');
    expect(job('job-cps').closeReason).toBe('withdrawn');
    expect(job('job-cps').audit.at(-1)?.what).toContain('Reason: "Funding ended"');
  });
});

describe('free jobs: two a calendar month, counted at first use', () => {
  const free = (id: string, schedule: string | null = null) => publish(id, { plan: 'free', schedule });

  it('the sample month has one free job left; a third free job this month is refused', () => {
    expect(freeLeft(getState())).toBe(1);
    const a = startJob('Hiring a Shelter Officer in Goma, closing in 3 weeks');
    expect(free(a)).toBe(true);
    expect(freeLeft(getState())).toBe(0);
    const b = startJob('Hiring a Driver in Goma, closing in 3 weeks');
    expect(publishBlock(getState(), b, { plan: 'free', schedule: null })).toMatch(/No free job left/);
    expect(free(b)).toBe(false);
    expect(job(b).status).toBe('draft');
  });

  it('scheduling for the 1st of next month uses that month’s allowance', () => {
    free(startJob('Hiring a Shelter Officer in Goma, closing in 3 weeks'));
    const b = startJob('Hiring a Driver in Goma, closing in 6 weeks');
    const next = firstOfNextMonth(currentMonth(getState()));
    expect(canGoFree(getState(), b, next)).toBe(true);
    expect(free(b, next)).toBe(true);
    expect(job(b)).toMatchObject({ status: 'scheduled', scheduledFor: next });
    expect(freeLeft(getState(), next.slice(0, 7))).toBe(1);
  });

  it('a job already counted (downloaded or sent for review) publishes free without counting again', () => {
    const before = getState().freeUses.length;
    expect(free('job-comms')).toBe(true);
    expect(getState().freeUses.length).toBe(before);
  });

  it('paying for a job that had counted does not give its free job back', () => {
    expect(freeLeft(getState())).toBe(1);
    buy('one', 'Communications Intern');
    expect(publish('job-comms', { plan: 'amplify', schedule: null, paid: 'direct' })).toBe(true);
    expect(freeLeft(getState())).toBe(1);
    expect(job('job-comms').plan).toBe('amplify');
  });

  it('an amplified job is listed 100 days, a free one 60, never past the closing date', () => {
    const id = startJob('Hiring a Shelter Officer in Goma');
    expect(job(id).facts.deadline).toBe('');
    free(id);
    const today = getState().today;
    expect(daysUntil(today, listedUntil(job(id), today))).toBe(60);
    buy('one', 'Shelter Officer');
    amplifyLive(id, 'direct');
    expect(daysUntil(today, listedUntil(job(id), today))).toBe(100);
    expect(listedUntil(job('job-cps'), today)).toBe(job('job-cps').facts.deadline);
  });
});

describe('packages and the subscription', () => {
  it('a 3-job pack lasts 2 months and its jobs are used one at a time', () => {
    buy('three');
    expect(paidJobsLeft(getState())).toBe(3);
    expect(getState().packs[0].ends).toBe(addMonths(isoDay(getState().today), 2));
    const id = startJob('Hiring a Shelter Officer in Goma, closing in 3 weeks');
    expect(publish(id, { plan: 'amplify', schedule: null, paid: 'onHand' })).toBe(true);
    expect(paidJobsLeft(getState())).toBe(2);
    expect(getState().receipts[0].amount).toContain('US$66');
  });

  it('without a paid job on hand, "onHand" is refused', () => {
    const id = startJob('Hiring a Shelter Officer in Goma, closing in 3 weeks');
    expect(publish(id, { plan: 'amplify', schedule: null, paid: 'onHand' })).toBe(false);
    expect(amplifyLive('job-meal', 'onHand')).toBe(false);
  });

  it('a package job amplifies a live free job; the free job it used stays used', () => {
    const id = startJob('Hiring a Shelter Officer in Goma, closing in 3 weeks');
    publish(id, { plan: 'free', schedule: null });
    expect(freeLeft(getState())).toBe(0);
    buy('five');
    expect(amplifyLive(id, 'onHand')).toBe(true);
    expect(job(id).plan).toBe('amplify');
    expect(paidJobsLeft(getState())).toBe(4);
    expect(freeLeft(getState())).toBe(0);
  });

  it('the subscription gives 3 jobs a month, extra jobs at US$18, and can be cancelled', () => {
    buy('always');
    expect(getState().subscription).toMatchObject({ left: 3, cancelled: false });
    expect(singlePrice(getState())).toEqual({ key: 'extra', amount: 18 });
    cancelSubscription();
    expect(getState().subscription?.cancelled).toBe(true);
    expect(singlePrice(getState()).key).toBe('one');
  });

  it('unused pack jobs lapse after the end date; the subscription renews, or ends once cancelled', () => {
    const s = getState();
    const day = 86_400_000;
    const later = { ...s, today: s.today + 120 * day };
    const withPack = { ...later, packs: [{ id: 'p', jobs: 3, left: 2, ends: isoDay(s.today + 60 * day), at: 0 }], subscription: { since: isoDay(s.today), renews: isoDay(s.today + 30 * day), left: 0, cancelled: false } };
    const rolled = rollBilling(withPack);
    expect(rolled.packs).toHaveLength(0);
    expect(rolled.subscription?.left).toBe(3);
    expect(rolled.subscription!.renews > isoDay(later.today)).toBe(true);
    expect(rollBilling({ ...withPack, subscription: { ...withPack.subscription, cancelled: true } }).subscription).toBeNull();
  });
});

describe('publishing without approval', () => {
  beforeEach(() => update((s) => ({ ...s, org: { ...s.org, approval: 'all' } })));

  it('needs approval first; the owner can skip it with a reason, kept in the history', () => {
    const id = startJob('Hiring a Shelter Officer in Goma, closing in 3 weeks');
    expect(publishBlock(getState(), id, { plan: 'free', schedule: null })).toBe('Waiting for approval');
    expect(canSkipApproval(getState(), job(id))).toBe(true);
    expect(overrideApproval(id, 'no')).toBe(false);
    expect(overrideApproval(id, 'The donor deadline is today')).toBe(true);
    expect(job(id).audit.at(-1)?.what).toBe('Approval skipped by the owner. Reason: "The donor deadline is today"');
    expect(job(id).audit.some((a) => a.what.startsWith('Published without approval'))).toBe(false);
    expect(publish(id, { plan: 'free', schedule: null })).toBe(true);
    expect(job(id).audit.some((a) => a.what.startsWith('Published without approval. Reason: "The donor deadline is today"'))).toBe(true);
  });

  it('a skipped approval is reset by a later change, and is not "published" until it is', () => {
    const id = startJob('Hiring a Shelter Officer in Goma, closing in 3 weeks');
    overrideApproval(id, 'The donor deadline is today');
    editSection(id, job(id).sections[1].key, 'Changed after skipping');
    expect(job(id).review.skipped).toBeUndefined();
    expect(publishBlock(getState(), id, { plan: 'free', schedule: null })).toBe('Waiting for approval');
  });

  it('"Nobody can skip approval" removes the override', () => {
    update((s) => ({ ...s, org: { ...s.org, noSkip: true } }));
    const id = startJob('Hiring a Shelter Officer in Goma, closing in 3 weeks');
    expect(canSkipApproval(getState(), job(id))).toBe(false);
    expect(overrideApproval(id, 'The donor deadline is today')).toBe(false);
    expect(publish(id, { plan: 'free', schedule: null })).toBe(false);
  });

  it('only the owner can skip it, never a member', () => {
    update((s) => ({ ...s, me: { ...s.me, role: 'member' } }));
    const id = startJob('Hiring a Shelter Officer in Goma, closing in 3 weeks');
    expect(overrideApproval(id, 'The donor deadline is today')).toBe(false);
  });
});

describe('the market check', () => {
  it('compares with a labelled sample of similar open jobs, and says so when there are too few', () => {
    const check = marketCheck(job('job-fin'), getState(), null);
    expect(check.thin).toBe(false);
    expect(check.count).toBeGreaterThanOrEqual(5);
    expect(check.points.map((p) => p.key)).toEqual(['window', 'language', 'clash']);
    expect(marketCheck(job('job-fin'), getState(), null).similar).toEqual(check.similar);
    const thin = marketCheck(job('job-comms'), getState(), null);
    expect(thin.thin).toBe(true);
    expect(thin.points).toHaveLength(0);
  });

  it('a short window gets a later closing date on a working day, and Undo puts it back', () => {
    const id = startJob('Hiring a WASH Officer in Nairobi, closing in 1 week, fixed-term');
    const before = job(id).facts.deadline;
    const point = marketCheck(job(id), getState(), null).points.find((p) => p.key === 'window');
    expect(point?.ok).toBe(false);
    applyFix(id, point!.fix!.fix, point!.fix!.label);
    expect(job(id).facts.deadline).not.toBe(before);
    expect(marketCheck(job(id), getState(), null).points.find((p) => p.key === 'window')?.ok).toBe(true);
    undo();
    expect(job(id).facts.deadline).toBe(before);
  });

  it('a deadline that clashes with similar jobs in the same country can be moved to a week without clashes', () => {
    const similar = marketCheck(job('job-fin'), getState(), null).similar.filter((x) => x.iso === 'SS');
    const crowded = similar.map((x) => x.closes).filter((d) => similar.filter((x) => Math.abs(daysUntil(parseIso(d), x.closes)) <= 3).length >= 2);
    expect(crowded.length).toBeGreaterThan(0);
    const clashOn = (d: string) => marketCheck({ ...job('job-fin'), facts: { ...job('job-fin').facts, deadline: d } }, getState(), null).points.find((p) => p.key === 'clash');
    const busy = crowded.find((d) => clashOn(d)?.fix);
    expect(busy).toBeTruthy();
    setFacts('job-fin', { deadline: busy! });
    const clash = marketCheck(job('job-fin'), getState(), null).points.find((p) => p.key === 'clash');
    expect(clash?.ok).toBe(false);
    applyFix('job-fin', clash!.fix!.fix, clash!.fix!.label);
    expect(marketCheck(job('job-fin'), getState(), null).points.find((p) => p.key === 'clash')?.ok).toBe(true);
  });

  it('a language most similar jobs ask for is added as desirable, with its section', () => {
    const id = startJob('Hiring a Programme Manager in Goma, closing in 5 weeks, fixed-term');
    const point = marketCheck(job(id), getState(), null).points.find((p) => p.key === 'language');
    expect(point?.fix?.label).toBe('Add French as desirable');
    applyFix(id, point!.fix!.fix, point!.fix!.label);
    expect(job(id).facts.languages).toContain('French');
    expect(job(id).sections.find((x) => x.key === 'languages')?.lines.join(' ')).toContain('French');
    outlineMatchesDocument(id);
  });
});

describe('the advert checks', () => {
  it('the basic check finds inclusive-language highlights, for free jobs too', () => {
    expect(basicAdvertCheck(job('job-fin'), getState()).some((p) => !p.ok && p.title.includes('15 years'))).toBe(true);
  });

  it('the full check compares requirements and pay with similar jobs, and fixes them in one tap', () => {
    const points = fullAdvertCheck(job('job-fin'), getState()).points;
    const years = points.find((p) => p.key === 'years');
    expect(years?.ok).toBe(false);
    applyFix('job-fin', years!.fix!.fix, years!.fix!.label);
    expect(job('job-fin').sections.find((x) => x.key === 'requirements')?.lines.join(' ')).not.toContain('15 years');
    expect(blocked('job-fin')).toBe(true);
    const pay = fullAdvertCheck(job('job-fin'), getState()).points.find((p) => p.key === 'pay');
    if (pay && !pay.ok && pay.fix) {
      applyFix('job-fin', pay.fix.fix, pay.fix.label);
      expect(job('job-fin').facts.salaryMode).toBe('range');
    }
  });

  it('too few similar jobs: the full check compares nothing', () => {
    expect(fullAdvertCheck(job('job-comms'), getState())).toEqual({ thin: true, points: [] });
  });
});

describe('language versions', () => {
  it('a draft translates headings, standard sentences, dates, and the country; other lines stay in English for review', () => {
    const id = startJob("We're hiring a WASH Programme Manager in Juba, 12-month fixed-term contract, closing 30 November 2026");
    addTranslation(id, 'fr');
    const t = job(id).translations!.fr!;
    const text = JSON.stringify(t.sections);
    expect(t.reviewed).toBe(false);
    expect(t.sections.find((x) => x.key === 'apply')?.title).toBe('Comment postuler');
    expect(text).toContain('30 novembre 2026');
    expect(text).toContain('Soudan du Sud');
    expect(text).not.toContain('South Sudan');
    expect(untranslated(job(id), t)).toBeGreaterThan(0);
    expect(langOf('ar').dir).toBe('rtl');
  });

  it('only reviewed, up-to-date versions of an amplified job are public; a change to the English asks for an update that keeps edits', () => {
    const id = startJob("We're hiring a WASH Programme Manager in Juba, 12-month fixed-term contract, closing 30 November 2026");
    addTranslation(id, 'es');
    const resp = job(id).translations!.es!.sections.find((x) => x.key === 'responsibilities')!;
    editTranslation(id, 'es', 'responsibilities', 0, 'Dirigir el programa de agua y saneamiento');
    reviewTranslation(id, 'es');
    expect(publicLangs(job(id))).toEqual([]);
    buy('one', 'WASH Programme Manager');
    publish(id, { plan: 'amplify', schedule: null, paid: 'direct' });
    expect(publicLangs(job(id))).toEqual(['es']);
    extend(id, 7);
    expect(stale(job(id), job(id).translations!.es!)).toBe(true);
    expect(publicLangs(job(id))).toEqual([]);
    refreshTranslation(id, 'es');
    const after = job(id).translations!.es!;
    expect(after.reviewed).toBe(false);
    expect(after.sections.find((x) => x.key === 'responsibilities')?.lines[0]).toBe('Dirigir el programa de agua y saneamiento');
    expect(resp.lines.length).toBe(after.sections.find((x) => x.key === 'responsibilities')?.lines.length);
    reviewTranslation(id, 'es');
    expect(publicLangs(job(id))).toEqual(['es']);
  });

  it('reviewers cannot change a language version', () => {
    addTranslation('job-fin', 'fr');
    update((s) => ({ ...s, reviewerAs: 'amina' }));
    const before = JSON.stringify(job('job-fin').translations);
    editTranslation('job-fin', 'fr', 'about', 0, 'Changed by a reviewer');
    reviewTranslation('job-fin', 'fr');
    removeTranslation('job-fin', 'fr');
    expect(JSON.stringify(job('job-fin').translations)).toBe(before);
  });
});

describe('Reach', () => {
  const planned = (id: string, candidates: string[], team: string[] = []) => setReachPlan(id, { ...planFor(job(id), getState().org), candidates, team });

  it('team emails go only to the organisation’s own domain', () => {
    planned('job-fin', ['a@example.org'], ['amina@riverstone.example.org', 'friend@gmail.example.org']);
    expect(job('job-fin').reachPlan?.team).toEqual(['amina@riverstone.example.org']);
  });

  it('a paid job sends at go-live; a free job sends nothing and keeps the plan', () => {
    const paid = startJob('Hiring a Shelter Officer in Goma, closing in 4 weeks');
    planned(paid, ['a@example.org', 'b@example.org'], ['grace@riverstone.example.org']);
    buy('one', 'Shelter Officer');
    publish(paid, { plan: 'amplify', schedule: null, paid: 'direct' });
    expect(job(paid).reach?.rounds).toEqual([expect.objectContaining({ n: 1, why: 'At go-live' })]);
    expect([...job(paid).reach!.candidates, ...job(paid).reach!.team].map((r) => r.status)).toEqual(['queued', 'queued', 'queued']);
    expect(job(paid).reachPlan).toBeUndefined();
    const free = startJob('Hiring a Driver in Goma, closing in 4 weeks');
    planned(free, ['c@example.org']);
    publish(free, { plan: 'free', schedule: null });
    expect(job(free).reach).toBeNull();
    expect(job(free).reachPlan?.candidates).toEqual(['c@example.org']);
  });

  it('a scheduled job sends on its date, when it goes live', () => {
    const id = startJob('Hiring a Shelter Officer in Goma, closing in 6 weeks');
    planned(id, ['a@example.org']);
    buy('one', 'Shelter Officer');
    const date = isoDay(getState().today + 3 * 86_400_000);
    publish(id, { plan: 'amplify', schedule: date, paid: 'direct' });
    expect(job(id).reach?.candidates[0].status).toBe('waiting');
    expect(job(id).reach?.rounds[0].sendsOn).toBe(date);
    const later = goLive({ ...getState(), today: getState().today + 4 * 86_400_000 });
    const after = later.jobs.find((j) => j.id === id)!;
    expect(after.status).toBe('live');
    expect(after.reach?.candidates[0].status).toBe('sent');
  });

  it('inviting more skips people already invited and those who unsubscribed, within the allowance', () => {
    planned('job-cps', ['candidate1@example.org', 'new@example.org', 'optout@example.org']);
    expect(sendReach('job-cps', 'Before closing')).toBe(1);
    const reach = job('job-cps').reach!;
    expect(reach.rounds.map((r) => r.why)).toEqual(['At go-live', 'Before closing']);
    expect(reach.candidates.filter((r) => r.round === 2).map((r) => r.email)).toEqual(['new@example.org']);
    planned('job-cps', Array.from({ length: 60 }, (_, i) => `p${i}@example.org`));
    expect(sendReach('job-cps', 'Invited more')).toBe(REACH_EMAILS - 6);
    expect(reachUsed(job('job-cps'))).toBe(REACH_EMAILS);
  });

  it('reminders come at the right moments, "Not now" moves on, and they can be switched off', () => {
    const today = getState().today;
    expect(reachMoment(job('job-cps'), today)?.key).toBe('closing');
    dismissMoment('job-cps', 'closing');
    expect(reachMoment(job('job-cps'), today)?.key).toBe('halfway');
    extend('job-cps', 14);
    expect(reachMoment(job('job-cps'), today)?.key).toMatch(/^extended-/);
    setReachReminders('job-cps', false);
    expect(reachMoment(job('job-cps'), today)).toBeNull();
    expect(reachMoment(job('job-meal'), today)).toBeNull();
  });

  it('reviewers cannot prepare or send invitations', () => {
    update((s) => ({ ...s, reviewerAs: 'amina' }));
    planned('job-cps', ['new@example.org']);
    expect(job('job-cps').reachPlan).toBeUndefined();
    expect(sendReach('job-cps', 'Invited more')).toBe(0);
  });
});

describe('review rounds', () => {
  const people = [{ name: 'Amina Yusuf', email: 'amina@riverstone.example.org', outside: false }];

  it('a new round shows only the sections changed since the last one', () => {
    sendForReview('job-comms', people, '2026-12-01', 'any', '');
    expect(changedSinceLastRound(job('job-comms'))).toEqual([]);
    const key = job('job-comms').sections[1].key;
    editSection('job-comms', key, 'Rewritten after the first round');
    sendForReview('job-comms', people, '2026-12-01', 'any', '');
    expect(job('job-comms').review.round).toBe(2);
    expect(changedSinceLastRound(job('job-comms'))).toEqual([key]);
  });

  it('reminds only reviewers who have not answered, and logs it', () => {
    remindReviewers('job-fin');
    expect(job('job-fin').review.reminded).toBeTruthy();
    expect(job('job-fin').audit.at(-1)?.what).toBe('Reminded Daniel to review');
  });
});

describe('Ask to pay', () => {
  const request = { name: 'Grace Akello', email: 'grace@riverstone.example.org', note: '', key: 'one' as const, amount: 'US$28.40', item: 'Amplify: Finance Officer', schedule: null };

  it('the person asked pays from the link; the job publishes with its invitations, and they get the receipt', () => {
    setReachPlan('job-fin', { ...planFor(job('job-fin'), getState().org), candidates: ['a@example.org'] });
    expect(askToPay('job-fin', request)).toBe(true);
    expect(statusLine(getState(), job('job-fin'))).toBe('Waiting for Grace to pay US$28.40');
    remindPayer('job-fin');
    expect(job('job-fin').payRequest?.reminded).toBeTruthy();
    expect(completePayRequest('job-fin')).toBe(true);
    expect(job('job-fin')).toMatchObject({ status: 'live', plan: 'amplify', payRequest: undefined });
    expect(job('job-fin').reach?.candidates.map((r) => r.email)).toEqual(['a@example.org']);
    expect(getState().receipts[0].item).toBe('Amplify: Finance Officer');
    expect(getState().inbox[0].title).toBe('Grace paid US$28.40: Finance Officer is live');
  });

  it('it can amplify a live free job, and paying yourself closes the request', () => {
    expect(askToPay('job-meal', { ...request, item: 'Amplify: MEAL Coordinator' })).toBe(true);
    expect(completePayRequest('job-meal')).toBe(true);
    expect(job('job-meal').plan).toBe('amplify');
    askToPay('job-comms', request);
    buy('one', 'Communications Intern');
    publish('job-comms', { plan: 'amplify', schedule: null, paid: 'direct' });
    expect(job('job-comms').payRequest).toBeUndefined();
  });

  it('not while approval is still needed; cancelled, it is gone; reviewers cannot ask', () => {
    update((s) => ({ ...s, org: { ...s.org, approval: 'all' } }));
    const id = startJob('Hiring a Shelter Officer in Goma, closing in 3 weeks');
    expect(askToPay(id, request)).toBe(false);
    askToPay('job-fin', request);
    cancelPayRequest('job-fin');
    expect(job('job-fin').payRequest).toBeUndefined();
    update((s) => ({ ...s, reviewerAs: 'amina' }));
    expect(askToPay('job-fin', request)).toBe(false);
  });
});

describe('fixes from the round 4 review', () => {
  const amina = [{ name: 'Amina Yusuf', email: 'amina@riverstone.example.org', outside: false }];
  const asReviewer = (id: string, fn: () => void) => {
    update((s) => ({ ...s, reviewerAs: id }));
    fn();
    update((s) => ({ ...s, reviewerAs: null }));
  };

  it('1. a reviewer answering after the job is published never takes it off the site', () => {
    sendForReview('job-comms', amina, '2026-12-01', 'any', '');
    expect(publish('job-comms', { plan: 'free', schedule: null })).toBe(true);
    asReviewer('amina', () => reviewerDecision('job-comms', 'changes', 'Too late'));
    expect(job('job-comms').status).toBe('live');
    expect(getState().inbox[0].body).toBe('Too late');
  });

  it('2. a scheduled or live job is not sent for review', () => {
    const id = startJob('Hiring a Shelter Officer in Goma, closing in 6 weeks');
    publish(id, { plan: 'free', schedule: isoDay(getState().today + 3 * 86_400_000) });
    sendForReview(id, amina, '2026-12-01', 'any', '');
    expect(job(id).status).toBe('scheduled');
  });

  it('3 and 5. a schedule date in the past, today, or on or after the closing date is refused', () => {
    const id = startJob('Hiring a Shelter Officer in Goma, closing in 1 week');
    const day = (n: number) => isoDay(getState().today + n * 86_400_000);
    expect(publishBlock(getState(), id, { plan: 'free', schedule: day(-40) })).toBe('Choose a date from tomorrow');
    expect(publishBlock(getState(), id, { plan: 'free', schedule: day(0) })).toBe('Choose a date from tomorrow');
    expect(publishBlock(getState(), id, { plan: 'free', schedule: job(id).facts.deadline })).toBe('It would close before it goes live');
    expect(publish(id, { plan: 'free', schedule: day(-40) })).toBe(false);
    expect(getState().freeUses.some((u) => u.jobId === id)).toBe(false);
    expect(publishBlock(getState(), id, { plan: 'free', schedule: day(2) })).toBeNull();
  });

  it('6. Ask to pay charges nothing when the job can no longer be published', () => {
    askToPay('job-fin', { name: 'Grace Akello', email: 'grace@riverstone.example.org', note: '', key: 'one', amount: 'US$28.40', item: 'Amplify: Finance Officer', schedule: null });
    editSection('job-fin', 'responsibilities', '- Changed after the request');
    const receipts = getState().receipts.length;
    expect(completePayRequest('job-fin')).toBe(false);
    expect(getState().receipts.length).toBe(receipts);
    expect(job('job-fin').status).toBe('review');
  });

  it('7. closing a job closes its payment request', () => {
    askToPay('job-meal', { name: 'Grace Akello', email: 'grace@riverstone.example.org', note: '', key: 'one', amount: 'US$28.40', item: 'Amplify: MEAL Coordinator', schedule: null });
    closeJob('job-meal', 'early');
    expect(job('job-meal').payRequest).toBeUndefined();
  });

  it('9. undo puts a job back but never "unsends" Reach emails', () => {
    const sampleDeadline = job('job-cps').facts.deadline;
    setReachPlan('job-cps', { ...planFor(job('job-cps'), getState().org), candidates: ['new@example.org'] });
    sendReach('job-cps', 'Invited more');
    extend('job-cps', 7);
    update((s) => ({ ...s, jobs: s.jobs.map((x) => (x.id === 'job-cps' && x.reach ? { ...x, reach: { ...x.reach, candidates: x.reach.candidates.map((r) => ({ ...r, status: 'sent' as const })) } } : x)) }), true);
    undo();
    expect(job('job-cps').facts.deadline).toBe(sampleDeadline);
    expect(job('job-cps').reach?.candidates.every((r) => r.status === 'sent')).toBe(true);
  });

  it('10. a cancelled subscription is resumed, not bought again', () => {
    buy('always');
    cancelSubscription();
    resumeSubscription();
    expect(getState().subscription?.cancelled).toBe(false);
  });

  it('11. "Hire again" starts without the old schedule or reminder setting', () => {
    update((s) => ({ ...s, jobs: s.jobs.map((x) => (x.id === 'job-log' ? { ...x, scheduledFor: '2026-01-01', reachReminders: false } : x)) }));
    const copy = job(hireAgain('job-log')!);
    expect(copy.scheduledFor).toBeUndefined();
    expect(copy.reachReminders).toBeUndefined();
  });

  it('13. an address in both Reach lists gets one email, as a candidate', () => {
    const plan = { ...planFor(job('job-fin'), getState().org), candidates: ['amina@riverstone.example.org'], team: ['amina@riverstone.example.org', 'grace@riverstone.example.org'] };
    expect(recipientsOf(job('job-fin'), plan)).toMatchObject({ candidates: ['amina@riverstone.example.org'], team: ['grace@riverstone.example.org'] });
  });

  it('14. under "any one reviewer" an approval stands after a later request for changes; under "every reviewer" it does not', () => {
    asReviewer('daniel', () => reviewerDecision('job-fin', 'changes', 'One more thing'));
    expect(job('job-fin').status).toBe('approved');
    expect(job('job-fin').review.state).toBe('approved');
    expect(blocked('job-fin')).toBe(false);
    update((s) => ({ ...s, jobs: s.jobs.map((x) => (x.id === 'job-fin' ? { ...x, review: { ...x.review, rule: 'all' } } : x)) }));
    asReviewer('daniel', () => reviewerDecision('job-fin', 'changes', 'One more thing'));
    expect(job('job-fin').status).toBe('review');
    expect(blocked('job-fin')).toBe(true);
  });

  it('15. an unverified organisation cannot amplify, by any route', () => {
    update((s) => ({ ...s, org: { ...s.org, verified: false } }));
    expect(publishBlock(getState(), 'job-comms', { plan: 'amplify', schedule: null, paid: 'direct' })).toBe('Verify your organisation to amplify');
    expect(amplifyLive('job-meal', 'direct')).toBe(false);
    askToPay('job-meal', { name: 'Grace Akello', email: 'grace@riverstone.example.org', note: '', key: 'one', amount: 'US$28.40', item: 'Amplify: MEAL Coordinator', schedule: null });
    const receipts = getState().receipts.length;
    expect(completePayRequest('job-meal')).toBe(false);
    expect(getState().receipts.length).toBe(receipts);
    expect(job('job-meal').plan).toBe('free');
  });

  it('re-review A. a reviewer answering after the owner skipped approval replaces the skip', () => {
    update((s) => ({ ...s, org: { ...s.org, approval: 'all' } }));
    const id = startJob('Hiring a Shelter Officer in Goma, closing in 3 weeks');
    sendForReview(id, amina, '2026-12-01', 'any', '');
    overrideApproval(id, 'The donor deadline is today');
    asReviewer('amina', () => reviewerDecision(id, 'approved', ''));
    expect(job(id).review.skipped).toBeUndefined();
    publish(id, { plan: 'free', schedule: null });
    expect(job(id).audit.some((a) => a.what.startsWith('Published without approval'))).toBe(false);
  });

  it('re-review B. a late request for changes on a published job leaves nothing waiting', () => {
    sendForReview('job-comms', amina, '2026-12-01', 'any', '');
    publish('job-comms', { plan: 'free', schedule: null });
    asReviewer('amina', () => reviewerDecision('job-comms', 'changes', ''));
    expect(job('job-comms').review.state).toBe('open');
    expect(needsYou(getState(), job('job-comms'))).toBe(false);
  });

  it('re-review D. paid after the date asked for, the job goes live now', () => {
    const tomorrow = isoDay(getState().today + 86_400_000);
    askToPay('job-fin', { name: 'Grace Akello', email: 'grace@riverstone.example.org', note: '', key: 'one', amount: 'US$28.40', item: 'Amplify: Finance Officer', schedule: tomorrow });
    update((s) => ({ ...s, today: s.today + 2 * 86_400_000 }));
    expect(completePayRequest('job-fin')).toBe(true);
    expect(job('job-fin').status).toBe('live');
  });
});

describe('a request for changes after an approval', () => {
  const daniel = (decision: 'approved' | 'changes', note = '') => {
    update((s) => ({ ...s, reviewerAs: 'daniel' }));
    reviewerDecision('job-fin', decision, note);
    update((s) => ({ ...s, reviewerAs: null }));
  };

  it('under "any one reviewer" the approval stands; publishing anyway is recorded, with the reason, and Daniel is told', () => {
    daniel('changes', 'One more thing');
    expect(changesAfterApproval(job('job-fin'))).toEqual({ approvers: ['Amina Yusuf'], askers: [{ name: 'Daniel Mwangi', note: 'One more thing' }] });
    expect(statusLine(getState(), job('job-fin'))).toBe('Approved · Daniel asked for changes');
    expect(publishBlock(getState(), 'job-fin', { plan: 'free', schedule: null })).toBeNull();
    overruleChanges('job-fin', 'Minor, fixed in the next round');
    expect(publish('job-fin', { plan: 'free', schedule: null })).toBe(true);
    expect(job('job-fin').audit.some((a) => a.what === "Published with Daniel's request for changes still open. Reason: \"Minor, fixed in the next round\"; Daniel told (simulated)")).toBe(true);
    expect(getState().notice?.text).toBe('Daniel is told it was published with their request for changes open (simulated).');
  });

  it('with "Any request for changes pauses publishing", the request withdraws the approval until it is dealt with', () => {
    update((s) => ({ ...s, org: { ...s.org, changesPause: true } }));
    daniel('changes');
    expect(job('job-fin').status).toBe('review');
    expect(publishBlock(getState(), 'job-fin', { plan: 'free', schedule: null })).toBe('Waiting for approval');
    expect(canSkipApproval(getState(), job('job-fin'))).toBe(true);
  });

  it('"Publish anyway" lasts only until the job or the answers change', () => {
    daniel('changes');
    overruleChanges('job-fin', '');
    expect(job('job-fin').review.overruled).toBe('');
    daniel('approved');
    expect(job('job-fin').review.overruled).toBeUndefined();
    overruleChanges('job-fin', 'x');
    editSection('job-fin', 'responsibilities', '- Changed again');
    expect(job('job-fin').review.overruled).toBeUndefined();
  });
});

describe('the base JD format offer', () => {
  it('"Edit it" saves the edited headings and the offer does not come back', () => {
    const p = basePattern(getState())!;
    expect(p).not.toBeNull();
    const edited = p.order.map((o, i) => (i === 0 ? { ...o, heading: `${o.heading} (ours)` } : o));
    saveEditedBase(p, edited, 'warm');
    expect(getState().formats.find((f) => f.key === 'house')?.order[0].heading).toBe(edited[0].heading);
    const again = basePattern(getState());
    expect(again === null || getState().baseDismissed === again.sig).toBe(true);
  });
});

describe('a or an', () => {
  it.each([
    ['Education Specialist', 'an'],
    ['Programme Manager', 'a'],
    ['Officer', 'an'],
    ['HR Officer', 'an'],
    ['UN Volunteer', 'a'],
    ['Unit Manager', 'a'],
    ['European Affairs Adviser', 'a'],
    ['Hour-based Consultant', 'an'],
    ['WASH Officer', 'a'],
    ['MEAL Coordinator', 'a'],
    ['NATO Liaison Officer', 'a'],
    ['MSF Field Coordinator', 'an'],
    ['NGO Coordinator', 'an'],
  ])('%s takes "%s"', (word, expected) => {
    expect(article(word)).toBe(expected);
  });
});
