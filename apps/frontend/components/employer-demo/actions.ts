'use client';

import {
  addDays,
  applyEdit,
  buildSections,
  daysUntil,
  detectFamily,
  emptyFacts,
  extractFacts,
  longDate,
  parseIso,
  recommendTags,
  TAG_BY_KEY,
  type BuildContext,
} from './engine';
import { changeWithUndo, getState, nextId, notify, update, updateJob } from './store';
import type { ChatMsg, DemoJob, Facts, Person, ReachRecord, Review, State, Style } from './types';

export const FREE_DRAFTS = 3;
export const FREE_LIVE = 2;
export const PREMIUM_EMAILS = 50;
export const PRICE_LABEL = { premium: 'US$149', pack: 'US$599' };

function msg(from: ChatMsg['from'], text: string, quick?: string[]): ChatMsg {
  return { id: `m${Math.random().toString(36).slice(2, 9)}`, from, text, quick };
}

function who(s: State): string {
  return s.reviewerAs ? (s.team.find((p) => p.id === s.reviewerAs)?.name ?? 'Reviewer') : s.me.name;
}

export function ctxFor(s: State, j: DemoJob): BuildContext {
  return { facts: j.facts, familyKey: j.family, org: s.org, tone: j.tone, modifier: detectFamily(`${j.facts.title} ${j.facts.contract}`).modifier };
}

export function freeDraftsLeft(s: State): number {
  return Math.max(0, FREE_DRAFTS - s.draftsUsed);
}

export function liveStandard(s: State): number {
  return s.jobs.filter((j) => (j.status === 'live' || j.status === 'scheduled') && j.plan === 'standard').length;
}

export function approvalRequired(s: State, j: DemoJob): boolean {
  if (s.org.approval === 'all') return true;
  if (s.org.approval === 'senior') return /^(P[45]|D\d)/.test(j.facts.grade);
  return false;
}

export function isApproved(j: DemoJob): boolean {
  return j.review.state === 'approved' || (j.review.rule === 'any' ? j.review.reviewers.some((r) => r.decision === 'approved') : j.review.reviewers.length > 0 && j.review.reviewers.every((r) => r.decision === 'approved'));
}

function missingFacts(f: Facts): Array<{ key: keyof Facts; ask: string; quick: string[] }> {
  const today = getState().today;
  const out: Array<{ key: keyof Facts; ask: string; quick: string[] }> = [];
  if (!f.location && !f.remote) out.push({ key: 'location', ask: 'Where is the job based?', quick: ['Nairobi', 'Kampala', 'Addis Ababa', 'Remote'] });
  if (!f.deadline) out.push({ key: 'deadline', ask: 'When do applications close?', quick: [`In 2 weeks`, `In 4 weeks`, longDate(addDays(today, 27))] });
  if (!f.contract) out.push({ key: 'contract', ask: 'What kind of contract is it?', quick: ['Fixed-term, 12 months', 'Consultancy', 'Internship', 'Open-ended'] });
  return out;
}

function memoryHint(s: State, title: string): string | null {
  const past = s.jobs.find((j) => j.status === 'closed' && title && j.facts.title.toLowerCase() === title.toLowerCase());
  return past ? `You hired a ${past.facts.title} before (${past.facts.location}). Say "start from last time" to reuse it.` : null;
}

/** Starts a job conversation from the first message. Returns the new job's id. */
export function startJob(text: string, style?: Style): string {
  const s = getState();
  const id = nextId('job');
  const { facts, family, modifier } = extractFacts(text, s.today);
  const tags = style ? style.tags : recommendTags(family, modifier, facts);
  const job: DemoJob = {
    id,
    status: 'draft',
    plan: null,
    facts,
    family: family?.key ?? 'programme',
    tags,
    style: style?.key ?? null,
    tone: style?.tone ?? (s.styles.find((x) => x.key === 'house')?.tone ?? 'warm'),
    sections: [],
    versions: [],
    review: { state: 'none', reviewers: [], due: '', round: 0, rule: s.org.approvalRule, remarks: [] },
    reach: null,
    chat: [msg('user', text)],
    createdAt: Date.now(),
    countsAsFreeDraft: false,
    audit: [{ at: Date.now(), who: s.me.name, what: 'Started in the chat' }],
  };
  job.chat.push(...replyAfterFacts(s, job, true));
  update((st) => ({ ...st, jobs: [job, ...st.jobs] }));
  return id;
}

function replyAfterFacts(s: State, j: DemoJob, first: boolean): ChatMsg[] {
  const out: ChatMsg[] = [];
  const mem = first ? memoryHint(s, j.facts.title) : null;
  if (first) {
    const what = j.facts.title ? `**${j.facts.title}**${j.facts.location ? ` in ${j.facts.location}` : ''}` : 'this role';
    out.push(msg('ai', `Got it: ${what}. I've suggested the sections it needs; tap a tag to add or remove one (at least 3).`));
    if (mem) out.push(msg('ai', mem));
  }
  const reuse = mem ? ['Start from last time'] : [];
  const missing = missingFacts(j.facts);
  if (missing.length) out.push(msg('ai', missing[0].ask, [...missing[0].quick, ...reuse]));
  else if (!j.sections.length) out.push(msg('ai', 'I have what I need. Ready to write it?', ['Write the description', ...reuse]));
  return out;
}

export function toggleTag(id: string, key: string) {
  updateJob(id, (j) => {
    const has = j.tags.includes(key);
    const tags = has ? j.tags.filter((t) => t !== key) : [...j.tags, key];
    if (!j.sections.length) return { ...j, tags, style: null };
    const s = getState();
    const sections = has ? j.sections.filter((x) => x.key !== key) : buildSections(tags, ctxFor(s, { ...j, tags })).map((x) => j.sections.find((o) => o.key === x.key) ?? x);
    return { ...j, tags, sections, style: null };
  });
}

export function applyStyle(id: string, style: Style) {
  updateJob(id, (j) => {
    const s = getState();
    const next = { ...j, tags: style.tags, tone: style.tone, style: style.key };
    const sections = j.sections.length ? buildSections(style.tags, ctxFor(s, next)).map((x) => j.sections.find((o) => o.key === x.key && o.edited) ?? x) : [];
    return { ...next, sections, chat: [...j.chat, msg('ai', `Applied ${style.label}: ${style.tags.length} sections, ${style.tone} tone.`)] };
  });
}

export function canWrite(j: DemoJob): { ok: boolean; why?: string } {
  if (j.tags.length < 3) return { ok: false, why: 'Choose at least 3 sections' };
  if (!j.facts.title) return { ok: false, why: 'Say what the role is' };
  return { ok: true };
}

/** Writes the first draft. The first one in a conversation uses one free draft unless the job is Premium. */
export function writeDraft(id: string) {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j) return;
  const counts = !j.countsAsFreeDraft && j.plan !== 'premium';
  const sections = buildSections(j.tags, ctxFor(s, j));
  update((st) => ({
    ...st,
    draftsUsed: counts ? st.draftsUsed + 1 : st.draftsUsed,
    jobs: st.jobs.map((x) =>
      x.id === id
        ? {
            ...x,
            sections,
            countsAsFreeDraft: x.countsAsFreeDraft || counts,
            versions: [...x.versions, { n: x.versions.length + 1, at: Date.now(), note: 'First draft', sections }],
            chat: [
              ...x.chat,
              msg('ai', `Here's a first draft with ${sections.length} sections. Ask me to change anything, or edit the text directly.`, ['Shorter', 'More formal', 'Add French', 'Add a salary']),
            ],
          }
        : x,
    ),
  }));
}

export function sendChat(id: string, text: string) {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || !text.trim()) return;
  const userMsg = msg('user', text);
  const lower = text.toLowerCase();

  if (lower === 'write the description') {
    updateJob(id, (x) => ({ ...x, chat: [...x.chat, userMsg] }));
    if (canWrite(j).ok) writeDraft(id);
    else updateJob(id, (x) => ({ ...x, chat: [...x.chat, msg('ai', canWrite(j).why ?? '')] }));
    return;
  }
  if (lower === 'start from last time') {
    const past = s.jobs.find((x) => x.status === 'closed' && x.facts.title.toLowerCase() === j.facts.title.toLowerCase());
    if (past) {
      const facts: Facts = { ...past.facts, deadline: j.facts.deadline || addDays(s.today, 27), location: j.facts.location || past.facts.location, country: j.facts.country || past.facts.country, iso: j.facts.iso || past.facts.iso };
      updateJob(id, (x) => ({ ...x, facts, tags: past.tags, tone: past.tone, family: past.family, chat: [...x.chat, userMsg, msg('ai', `Started from your ${past.facts.title} of ${longDate(past.facts.deadline)}, with a new closing date. Ready to write it?`, ['Write the description'])] }));
      return;
    }
  }
  if (lower === 'add a salary') {
    updateJob(id, (x) => ({ ...x, chat: [...x.chat, userMsg, msg('ai', 'What is the salary range?', ['USD 4,800 to 5,600 a month', 'USD 3,000 to 3,600 a month', 'In line with our scale'])] }));
    return;
  }
  if (lower === 'undo that') {
    updateJob(id, (x) => {
      const prev = x.versions[x.versions.length - 2];
      return prev ? { ...x, sections: prev.sections, chat: [...x.chat, userMsg, msg('ai', `Back to version ${prev.n}.`)] } : x;
    });
    return;
  }

  if (!j.sections.length) {
    const { facts, family, modifier } = extractFacts(answerToText(text, j), s.today, j.facts);
    const famKey = j.family === 'programme' && family ? family.key : j.family;
    const tags = j.style ? j.tags : Array.from(new Set([...j.tags, ...recommendTags(family, modifier, facts)]));
    const next = { ...j, facts, family: famKey, tags, chat: [...j.chat, userMsg] };
    next.chat.push(...replyAfterFacts(s, next, false));
    updateJob(id, () => next);
    return;
  }

  const result = applyEdit(answerToText(text, j), j.tags, j.sections, ctxFor(s, j), s.today);
  updateJob(id, (x) => ({
    ...x,
    sections: result.sections,
    tags: result.tags,
    tone: result.tone,
    facts: result.facts,
    updatedAfterPublish: x.status === 'live' ? true : x.updatedAfterPublish,
    review: x.review.state === 'approved' ? { ...x.review, state: 'open', reviewers: x.review.reviewers.map((r) => ({ ...r, decision: undefined })) } : x.review,
    versions: [...x.versions, { n: x.versions.length + 1, at: Date.now(), note: text.slice(0, 60), sections: result.sections }],
    chat: [...x.chat, userMsg, msg('ai', result.reply + (x.review.state === 'approved' ? ' This changes the approved version, so the approval is reset.' : ''), result.quick)],
  }));
}

/** Quick replies are short; this turns them into text the fact reader understands. */
function answerToText(text: string, j: DemoJob): string {
  const t = text.trim();
  if (/^remote$/i.test(t)) return 'remote';
  if (/^in \d weeks?$/i.test(t)) return `closing ${t.toLowerCase()}`;
  if (/^in line with our scale$/i.test(t)) return 'salary in line with scale';
  if (!j.facts.location && !j.facts.remote && /^[A-Z][a-zA-Z' -]+$/.test(t)) return `based in ${t}`;
  return t;
}

export function setFact(id: string, key: keyof Facts, value: string) {
  updateJob(id, (j) => {
    const s = getState();
    const facts: Facts = { ...j.facts };
    if (key === 'languages') facts.languages = value.split(',').map((x) => x.trim()).filter(Boolean);
    else if (key === 'remote') facts.remote = value === 'true';
    else if (key === 'location') {
      const { facts: f } = extractFacts(value, s.today, emptyFacts());
      facts.location = f.location || value;
      facts.country = f.country;
      facts.iso = f.iso;
    } else (facts as Record<string, unknown>)[key] = value;
    const next = { ...j, facts };
    const sections = j.sections.map((x) => (x.edited ? x : ['role', 'apply', 'offer', 'languages', 'setting', 'security'].includes(x.key) ? buildSections([x.key], ctxFor(s, next))[0] : x));
    return { ...next, sections, updatedAfterPublish: j.status === 'live' ? true : j.updatedAfterPublish };
  });
}

export function editSection(id: string, key: string, text: string) {
  updateJob(id, (j) => {
    const sections = j.sections.map((x) => (x.key === key ? { ...x, lines: text.split('\n').map((l) => l.replace(/^[•*]\s*/, '- ')).filter((l) => l.trim()), edited: true } : x));
    return { ...j, sections, versions: [...j.versions, { n: j.versions.length + 1, at: Date.now(), note: `Edited ${TAG_BY_KEY[key]?.label ?? key}`, sections }], updatedAfterPublish: j.status === 'live' ? true : j.updatedAfterPublish };
  });
}

export function restoreVersion(id: string, n: number) {
  updateJob(id, (j) => {
    const v = j.versions.find((x) => x.n === n);
    return v ? { ...j, sections: v.sections, versions: [...j.versions, { n: j.versions.length + 1, at: Date.now(), note: `Restored version ${n}`, sections: v.sections }] } : j;
  });
  notify(`Restored version ${n}`);
}

export function sendForReview(id: string, reviewers: Array<{ name: string; email: string; outside: boolean }>, due: string, rule: 'any' | 'all', note: string) {
  update((s) => {
    const j = s.jobs.find((x) => x.id === id);
    if (!j) return s;
    const review: Review = { state: 'open', reviewers, due, round: j.review.round + 1, rule, remarks: j.review.remarks.filter((r) => r.state === 'open'), approvedVersion: undefined };
    return {
      ...s,
      jobs: s.jobs.map((x) =>
        x.id === id
          ? { ...x, status: 'review', review, audit: [...x.audit, { at: Date.now(), who: s.me.name, what: `Sent for review to ${reviewers.map((r) => r.name).join(', ')}${note ? `: "${note}"` : ''}` }] }
          : x,
      ),
      notice: { text: `Sent to ${reviewers.length} ${reviewers.length === 1 ? 'reviewer' : 'reviewers'} (simulated). Outside reviewers get a private link that expires in 7 days.` },
    };
  });
}

export function addRemark(id: string, section: string, kind: 'comment' | 'suggestion', text: string, suggestion?: string) {
  update((s) => ({
    ...s,
    jobs: s.jobs.map((j) => (j.id === id ? { ...j, review: { ...j.review, remarks: [...j.review.remarks, { id: `r${Math.random().toString(36).slice(2, 8)}`, section, author: who(s), kind, text, suggestion, state: 'open' }] } } : j)),
  }));
}

export function reviewerDecision(id: string, decision: 'approved' | 'changes', note: string) {
  update((s) => {
    const name = who(s);
    const j = s.jobs.find((x) => x.id === id);
    if (!j) return s;
    const reviewers = j.review.reviewers.map((r) => (r.name === name ? { ...r, decision, note } : r));
    const next: DemoJob = { ...j, review: { ...j.review, reviewers } };
    const approved = isApproved(next);
    next.review.state = decision === 'changes' ? 'changes' : approved ? 'approved' : 'open';
    if (approved) next.review.approvedVersion = j.versions.length;
    next.status = approved ? 'approved' : 'review';
    next.audit = [...j.audit, { at: Date.now(), who: name, what: decision === 'approved' ? `Approved version ${j.versions.length}` : 'Requested changes' }];
    return {
      ...s,
      jobs: s.jobs.map((x) => (x.id === id ? next : x)),
      inbox: [
        { id: `i${Date.now()}`, kind: decision === 'approved' ? 'approved' : 'changes', jobId: id, title: `${name.split(' ')[0]} ${decision === 'approved' ? 'approved' : 'requested changes on'} ${j.facts.title}`, body: note || (decision === 'approved' ? 'Ready to publish.' : 'See the comments on the sections.'), at: Date.now() },
        ...s.inbox,
      ],
      notice: { text: decision === 'approved' ? 'Approval sent (simulated)' : 'Changes requested (simulated)' },
    };
  });
}

export function settleRemark(id: string, remarkId: string, outcome: 'accepted' | 'rejected' | 'resolved') {
  updateJob(id, (j) => {
    const r = j.review.remarks.find((x) => x.id === remarkId);
    if (!r) return j;
    let sections = j.sections;
    if (outcome === 'accepted' && r.suggestion) {
      sections = j.sections.map((sec) => (sec.key === r.section ? { ...sec, lines: [...sec.lines, r.suggestion as string], edited: true } : sec));
    }
    return {
      ...j,
      sections,
      versions: outcome === 'accepted' ? [...j.versions, { n: j.versions.length + 1, at: Date.now(), note: `Accepted ${r.author.split(' ')[0]}'s suggestion`, sections }] : j.versions,
      review: { ...j.review, remarks: j.review.remarks.map((x) => (x.id === remarkId ? { ...x, state: outcome } : x)) },
    };
  });
}

export function overrideApproval(id: string, reason: string) {
  update((s) => ({
    ...s,
    jobs: s.jobs.map((j) => (j.id === id ? { ...j, status: 'approved', review: { ...j.review, state: 'approved' }, audit: [...j.audit, { at: Date.now(), who: s.me.name, what: `Approval overridden by the owner: "${reason}"` }] } : j)),
  }));
}

export function buyCredits(n: number, mode: 'paddle-sandbox' | 'simulated') {
  update((s) => ({
    ...s,
    credits: s.credits + n,
    receipts: [{ id: `rc${Date.now()}`, at: Date.now(), item: `${n} Premium credits`, amount: `${PRICE_LABEL.pack} (placeholder)`, mode }, ...s.receipts],
    inbox: [{ id: `i${Date.now()}`, kind: 'receipt', title: `Receipt: ${n} Premium credits`, body: mode === 'paddle-sandbox' ? 'Paddle (sandbox) emailed the receipt and invoice to the address used at checkout.' : 'Simulated payment: in the real product Paddle emails the receipt and invoice.', at: Date.now() }, ...s.inbox],
  }));
}

export function payPremium(mode: 'paddle-sandbox' | 'simulated', title: string) {
  update((s) => ({
    ...s,
    receipts: [{ id: `rc${Date.now()}`, at: Date.now(), item: `Premium job: ${title}`, amount: `${PRICE_LABEL.premium} (placeholder)`, mode }, ...s.receipts],
    inbox: [{ id: `i${Date.now()}`, kind: 'receipt', title: `Receipt: Premium job, ${title}`, body: mode === 'paddle-sandbox' ? 'Paddle (sandbox) emailed the receipt and invoice to the address used at checkout.' : 'Simulated payment: in the real product Paddle emails the receipt and invoice.', at: Date.now() }, ...s.inbox],
  }));
}

export type PublishOptions = { plan: 'standard' | 'premium'; useCredit: boolean; schedule: string | null; reach: ReachRecord | null };

/** Publishes, then queues the chosen Reach emails. Publishing never waits for, or depends on, the emails. */
export function publish(id: string, o: PublishOptions) {
  update((s) => {
    const j = s.jobs.find((x) => x.id === id);
    if (!j) return s;
    const refund = o.plan === 'premium' && j.countsAsFreeDraft;
    const status = o.schedule ? 'scheduled' : 'live';
    const reach: ReachRecord | null = o.reach
      ? { ...o.reach, candidates: o.reach.candidates.map((r) => ({ ...r, status: 'queued' })), team: o.reach.team.map((r) => ({ ...r, status: 'queued' })) }
      : null;
    return {
      ...s,
      credits: o.useCredit ? s.credits - 1 : s.credits,
      draftsUsed: refund ? Math.max(0, s.draftsUsed - 1) : s.draftsUsed,
      jobs: s.jobs.map((x) =>
        x.id === id
          ? {
              ...x,
              status,
              plan: o.plan,
              scheduledFor: o.schedule ?? undefined,
              publishedAt: o.schedule ? undefined : Date.now(),
              countsAsFreeDraft: refund ? false : x.countsAsFreeDraft,
              reach,
              audit: [
                ...x.audit,
                { at: Date.now(), who: s.me.name, what: `${o.schedule ? `Scheduled for ${longDate(o.schedule)}` : 'Published'} as ${o.plan === 'premium' ? `Premium${o.useCredit ? ' (credit)' : ''}` : 'Standard'}` },
                ...(reach ? [{ at: Date.now(), who: s.me.name, what: `Reach: ${reach.candidates.length} invitations, ${reach.team.length} team emails queued (simulated)` }] : []),
              ],
            }
          : x,
      ),
    };
  });
  simulateDelivery(id);
}

/** Simulated email progress: queued, sending, sent. Labelled as simulated everywhere it is shown. */
function simulateDelivery(id: string) {
  const step = (status: 'sending' | 'sent', delay: number) =>
    setTimeout(() => {
      updateJob(id, (j) =>
        j.reach
          ? {
              ...j,
              reach: {
                ...j.reach,
                candidates: j.reach.candidates.map((r) => ({ ...r, status: status === 'sent' && r.email.startsWith('bounce') ? 'failed' : status })),
                team: j.reach.team.map((r) => ({ ...r, status })),
              },
            }
          : j,
      );
    }, delay);
  step('sending', 1200);
  step('sent', 3200);
}

export function extend(id: string, days: number) {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j) return;
  const base = j.facts.deadline && daysUntil(s.today, j.facts.deadline) >= 0 ? j.facts.deadline : addDays(s.today, 0);
  const deadline = addDays(parseIso(base) + 12 * 3_600_000, days);
  changeWithUndo(`${j.facts.title}: closing date moved to ${longDate(deadline)}`, (st) => ({
    ...st,
    jobs: st.jobs.map((x) => (x.id === id ? { ...x, facts: { ...x.facts, deadline }, audit: [...x.audit, { at: Date.now(), who: st.me.name, what: `Extended to ${longDate(deadline)}` }] } : x)),
    inbox: st.inbox.map((i) => (i.jobId === id && i.kind === 'deadline' ? { ...i, done: true } : i)),
  }));
}

export function closeJob(id: string, reason: 'early' | 'filled' | 'withdrawn', tellReach = false) {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j) return;
  const label = reason === 'filled' ? 'Position filled' : reason === 'withdrawn' ? 'Withdrawn' : 'Closed early';
  changeWithUndo(`${j.facts.title}: ${label.toLowerCase()}${tellReach ? '; the people it was shared with are told (simulated)' : ''}`, (st) => ({
    ...st,
    jobs: st.jobs.map((x) => (x.id === id ? { ...x, status: 'closed', closedAt: st.today, closeReason: reason, audit: [...x.audit, { at: Date.now(), who: st.me.name, what: label }] } : x)),
    inbox: st.inbox.map((i) => (i.jobId === id && i.kind === 'deadline' ? { ...i, done: true } : i)),
  }));
}

export function letClose(id: string) {
  update((s) => ({ ...s, inbox: s.inbox.map((i) => (i.jobId === id && i.kind === 'deadline' ? { ...i, done: true } : i)), notice: { text: 'It will close on its date. Nothing else to do.' } }));
}

export function deleteDraft(id: string) {
  const j = getState().jobs.find((x) => x.id === id);
  changeWithUndo(`Draft deleted: ${j?.facts.title || 'untitled'}`, (s) => ({ ...s, jobs: s.jobs.filter((x) => x.id !== id) }));
}

/** A new draft from an earlier job: same text, fresh dates. */
export function hireAgain(id: string, place?: string): string | null {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j) return null;
  const nid = nextId('job');
  let facts: Facts = { ...j.facts, deadline: addDays(s.today, 27) };
  if (place) {
    const { facts: f } = extractFacts(place, s.today, emptyFacts());
    facts = { ...facts, location: f.location || place, country: f.country, iso: f.iso };
  }
  const ctx = { ...ctxFor(s, j), facts };
  const sections = buildSections(j.tags, ctx).map((x) => {
    const old = j.sections.find((o) => o.key === x.key);
    return old?.edited ? old : x;
  });
  const copy: DemoJob = {
    ...j,
    id: nid,
    status: 'draft',
    plan: null,
    facts,
    sections,
    versions: [{ n: 1, at: Date.now(), note: place ? `Variant of ${j.facts.title} for ${facts.location}` : `Reopened from ${longDate(j.facts.deadline)}`, sections }],
    review: { state: 'none', reviewers: [], due: '', round: 0, rule: s.org.approvalRule, remarks: [] },
    reach: null,
    chat: [msg('ai', place ? `A copy of ${j.facts.title} for ${facts.location}. Check the duty-station details, then publish.` : `Reopened ${j.facts.title} with a new closing date, ${longDate(facts.deadline)}. Review it and publish when ready.`)],
    createdAt: Date.now(),
    publishedAt: undefined,
    closedAt: undefined,
    closeReason: undefined,
    updatedAfterPublish: false,
    countsAsFreeDraft: false,
    audit: [{ at: Date.now(), who: s.me.name, what: place ? `Created from ${j.facts.title} (${j.facts.location})` : `Reopened from ${j.facts.title}` }],
  };
  update((st) => ({ ...st, jobs: [copy, ...st.jobs] }));
  return nid;
}

export function downloadCopy(j: DemoJob, orgName: string) {
  const text = [`${j.facts.title}`, `${orgName} · ${j.facts.location}`, j.facts.deadline ? `Closing date: ${longDate(j.facts.deadline)}` : '', '', ...j.sections.flatMap((s) => [s.title.toUpperCase(), ...s.lines.map((l) => (l.startsWith('- ') ? `• ${l.slice(2)}` : l)), ''])].join('\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `${j.facts.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

export function markInbox(id: string) {
  update((s) => ({ ...s, inbox: s.inbox.map((i) => (i.id === id ? { ...i, done: true } : i)) }));
}

export function invite(email: string, role: Person['role']) {
  update((s) => {
    const name = email
      .split('@')[0]
      .split(/[._-]/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
    return { ...s, team: [...s.team, { id: `p${Date.now()}`, name, email, role }], notice: { text: `Invitation to ${email} (simulated)` } };
  });
}

export function setRole(id: string, role: Person['role']) {
  update((s) => ({ ...s, team: s.team.map((p) => (p.id === id ? { ...p, role } : p)) }));
}

export function removeMember(id: string) {
  update((s) => ({ ...s, team: s.team.filter((p) => p.id !== id) }));
}

/** "Ask to act": jobs and an action read from a sentence, always confirmed before anything changes. */
export type Intent = { kind: 'extend' | 'close' | 'reopen'; days?: number; jobIds: string[]; summary: string } | null;

export function readIntent(text: string): Intent {
  const s = getState();
  const t = text.toLowerCase();
  const live = s.jobs.filter((j) => j.status === 'live');
  const named = (j: DemoJob) => {
    const city = j.facts.location.split(',')[0].toLowerCase();
    const country = j.facts.country.toLowerCase();
    return Boolean((city && t.includes(city)) || (country && t.includes(country)) || t.includes(j.facts.title.toLowerCase()) || j.facts.title.toLowerCase().split(' ').some((w) => w.length > 4 && t.includes(w)));
  };
  /** Jobs named by place or title; "all" with nothing named means every job in the pool. */
  const pick = (pool: DemoJob[]) => {
    const hits = pool.filter(named);
    if (hits.length) return hits;
    return /\ball\b/.test(t) ? pool : [];
  };
  if (/\b(extend|push back|move)\b/.test(t)) {
    const weeks = t.match(/(\d+|a|one|two)\s+weeks?/);
    const daysM = t.match(/(\d+)\s+days?/);
    const n = weeks ? (weeks[1] === 'a' || weeks[1] === 'one' ? 1 : weeks[1] === 'two' ? 2 : Number(weeks[1])) * 7 : daysM ? Number(daysM[1]) : 7;
    const jobs = pick(live);
    return jobs.length ? { kind: 'extend', days: n, jobIds: jobs.map((j) => j.id), summary: `Extend ${jobs.length} live ${jobs.length === 1 ? 'job' : 'jobs'} by ${n} days` } : null;
  }
  if (/\b(close|end|stop)\b/.test(t)) {
    const jobs = pick(live);
    return jobs.length ? { kind: 'close', jobIds: jobs.map((j) => j.id), summary: `Close ${jobs.length} live ${jobs.length === 1 ? 'job' : 'jobs'} now` } : null;
  }
  if (/\b(reopen|hire again|re-open|repost)\b/.test(t)) {
    const jobs = pick(s.jobs.filter((j) => j.status === 'closed'));
    return jobs.length ? { kind: 'reopen', jobIds: [jobs[0].id], summary: `Reopen ${jobs[0].facts.title} as a new draft` } : null;
  }
  return null;
}

export function runIntent(intent: NonNullable<Intent>): string | null {
  if (intent.kind === 'extend') {
    const s = getState();
    changeWithUndo(intent.summary.replace('Extend', 'Extended'), (st) => ({
      ...st,
      jobs: st.jobs.map((j) => {
        if (!intent.jobIds.includes(j.id)) return j;
        const base = j.facts.deadline && daysUntil(s.today, j.facts.deadline) >= 0 ? j.facts.deadline : addDays(s.today, 0);
        const deadline = addDays(parseIso(base) + 12 * 3_600_000, intent.days ?? 7);
        return { ...j, facts: { ...j.facts, deadline }, audit: [...j.audit, { at: Date.now(), who: st.me.name, what: `Extended to ${longDate(deadline)} from the chat` }] };
      }),
    }));
    return null;
  }
  if (intent.kind === 'close') {
    changeWithUndo(intent.summary.replace('Close', 'Closed').replace(' now', ''), (st) => ({
      ...st,
      jobs: st.jobs.map((j) => (intent.jobIds.includes(j.id) ? { ...j, status: 'closed', closedAt: st.today, closeReason: 'early', audit: [...j.audit, { at: Date.now(), who: st.me.name, what: 'Closed early from the chat' }] } : j)),
    }));
    return null;
  }
  return hireAgain(intent.jobIds[0]);
}
