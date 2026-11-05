import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  amplifyLive,
  applyFormat,
  approvalRequired,
  basePattern,
  buy,
  cancelSubscription,
  canSkipApproval,
  deleteDraft,
  editSection,
  extend,
  isApproved,
  markGenuine,
  overrideApproval,
  publish,
  publishBlock,
  reorderSections,
  restoreVersion,
  reviewerDecision,
  saveEditedBase,
  sendChat,
  settleRemark,
  setApply,
  setFacts,
  startJob,
  toggleSection,
  undoLastChange,
} from '../../components/employer-demo/actions';
import { article, daysUntil, isoDay } from '../../components/employer-demo/engine';
import { addMonths, canGoFree, currentMonth, firstOfNextMonth, freeLeft, listedUntil, paidJobsLeft, rollBilling, singlePrice } from '../../components/employer-demo/plans';
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
  it('a deleted draft comes back while nothing else has changed', () => {
    deleteDraft('job-comms');
    expect(getState().jobs.some((j) => j.id === 'job-comms')).toBe(false);
    undo();
    expect(getState().jobs.some((j) => j.id === 'job-comms')).toBe(true);
  });

  it('the undo is withdrawn once another job is created, so the new job is kept', () => {
    deleteDraft('job-comms');
    const id = startJob('We are hiring a Nutrition Officer in Juba');
    expect(getState().notice?.undo).toBeFalsy();
    undo();
    expect(getState().jobs.some((j) => j.id === id)).toBe(true);
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
    deleteDraft('job-fin');
    expect(JSON.stringify(job('job-fin'))).toBe(before);
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

  it('paying for a job that had counted gives its free job back', () => {
    expect(freeLeft(getState())).toBe(1);
    buy('one', 'Communications Intern');
    expect(publish('job-comms', { plan: 'amplify', schedule: null, paid: 'direct' })).toBe(true);
    expect(freeLeft(getState())).toBe(2);
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

  it('a package job amplifies a live free job and gives its free job back', () => {
    const id = startJob('Hiring a Shelter Officer in Goma, closing in 3 weeks');
    publish(id, { plan: 'free', schedule: null });
    expect(freeLeft(getState())).toBe(0);
    buy('five');
    expect(amplifyLive(id, 'onHand')).toBe(true);
    expect(job(id).plan).toBe('amplify');
    expect(paidJobsLeft(getState())).toBe(4);
    expect(freeLeft(getState())).toBe(1);
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
    expect(job(id).audit.at(-1)?.what).toContain('Published without approval. Reason: "The donor deadline is today"');
    expect(publish(id, { plan: 'free', schedule: null })).toBe(true);
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
  ])('%s takes "%s"', (word, expected) => {
    expect(article(word)).toBe(expected);
  });
});
