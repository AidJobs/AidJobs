import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  applyFormat,
  approvalRequired,
  basePattern,
  deleteDraft,
  editSection,
  extend,
  isApproved,
  markGenuine,
  overrideApproval,
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
import { article } from '../../components/employer-demo/engine';
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

  it.each(['ok, thanks', 'great, thank you!', 'no thanks', 'looks great', 'thanks a lot', 'please include something about safeguarding', 'mention the travel to field sites', 'try again', 'can you make it better?'])(
    '"%s" changes nothing',
    (said) => {
      const before = text('job-comms');
      sendChat('job-comms', said);
      expect(text('job-comms')).toBe(before);
    },
  );

  it.each(['Experience in human rights monitoring is an asset', 'The post has two direct reports', 'Use of KoboToolbox is an asset', 'Set up and run community feedback mechanisms'])('"%s" is added as text, in the same tone', (said) => {
    const tone = job('job-comms').tone;
    sendChat('job-comms', said);
    expect(text('job-comms')).toContain(said);
    expect(job('job-comms').tone).toBe(tone);
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
