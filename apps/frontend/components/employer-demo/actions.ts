'use client';

import { applyLines, defaultApply } from './apply';
import {
  addDays,
  applyEdit,
  buildSection,
  buildSections,
  daysUntil,
  emptyFacts,
  extractFacts,
  FORMAT_FOR_TYPE,
  headingFor,
  longDate,
  orderSections,
  parseIso,
  readPasted,
  recommendSections,
  type BuildContext,
} from './engine';
import { changeWithUndo, getState, nextId, notify, update, updateJob } from './store';
import type { ApplySettings, ChatMsg, DemoJob, Facts, Format, Person, ReachRecord, Review, State } from './types';

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

export function formatOf(s: State, key: string): Format {
  return s.formats.find((f) => f.key === key) ?? s.formats[0];
}

export function defaultFormatKey(s: State): string {
  return s.org.learned && s.formats.some((f) => f.key === 'house') ? 'house' : FORMAT_FOR_TYPE[s.org.orgType];
}

export function ctxFor(s: State, j: DemoJob): BuildContext {
  return { facts: j.facts, roleKey: j.family, org: s.org, tone: j.tone, format: formatOf(s, j.format), commitments: j.commitments, applyLines: applyLines(j.apply, j.facts, s.org) };
}

/** Rebuilds every section not edited by hand, keeping the user's order and headings from the job's format. */
function rebuilt(s: State, j: DemoJob): DemoJob {
  if (!j.sections.length) return j;
  const ctx = ctxFor(s, j);
  return { ...j, sections: j.tags.map((k) => j.sections.find((x) => x.key === k && x.edited) ?? buildSection(k, ctx)) };
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

function missingFacts(f: Facts): Array<{ ask: string; quick: string[] }> {
  const today = getState().today;
  const out: Array<{ ask: string; quick: string[] }> = [];
  if (!f.location && f.arrangement !== 'remote') out.push({ ask: 'Where is the job based?', quick: ['Nairobi', 'Kampala', 'Addis Ababa', 'Remote'] });
  if (!f.deadline) out.push({ ask: 'When do applications close?', quick: ['In 2 weeks', 'In 4 weeks', longDate(addDays(today, 27))] });
  return out;
}

function memoryHint(s: State, title: string): string | null {
  const past = s.jobs.find((j) => j.status === 'closed' && title && j.facts.title.toLowerCase() === title.toLowerCase());
  return past ? `You hired a ${past.facts.title} before (${past.facts.location}). Say "start from last time" to reuse it.` : null;
}

function newJob(s: State, id: string, facts: Facts, roleKey: string, formatKey: string): DemoJob {
  const format = formatOf(s, formatKey);
  return {
    id,
    status: 'draft',
    plan: null,
    facts,
    family: roleKey,
    tags: orderSections(recommendSections(format, facts), format),
    format: format.key,
    tone: format.tone,
    commitments: format.commitments.filter((c) => c !== 'mds' || s.org.mdsMember),
    apply: defaultApply(s.org.orgType, s.org.careersUrl),
    genuine: {},
    sections: [],
    versions: [],
    review: { state: 'none', reviewers: [], due: '', round: 0, rule: s.org.approvalRule, remarks: [] },
    reach: null,
    chat: [],
    createdAt: Date.now(),
    countsAsFreeDraft: false,
    audit: [{ at: Date.now(), who: s.me.name, what: 'Started in the chat' }],
  };
}

/** Starts a job conversation from the first message. Returns the new job's id. */
export function startJob(text: string, formatKey?: string): string {
  const s = getState();
  const id = nextId('job');
  const { facts, role } = extractFacts(text, s.today);
  if (facts.salaryMode === 'hidden') facts.salaryMode = s.org.orgType === 'charity' ? 'range' : s.org.orgType === 'un' ? 'grade' : s.org.orgType === 'ingo' ? 'scale' : 'hidden';
  const job = newJob(s, id, facts, role?.key ?? 'programme', formatKey ?? defaultFormatKey(s));
  job.chat = [msg('user', text), ...replyAfterFacts(s, job, true)];
  update((st) => ({ ...st, jobs: [job, ...st.jobs] }));
  return id;
}

function replyAfterFacts(s: State, j: DemoJob, first: boolean): ChatMsg[] {
  const out: ChatMsg[] = [];
  const mem = first ? memoryHint(s, j.facts.title) : null;
  if (first) {
    const what = j.facts.title ? `**${j.facts.title}**${j.facts.location ? ` in ${j.facts.location}` : ''}` : 'this role';
    out.push(msg('ai', `Got it: ${what}, in ${formatOf(s, j.format).label}. The outline on the right shows the sections; add, remove, or reorder any of them.`));
    if (mem) out.push(msg('ai', mem));
  }
  const reuse = mem ? ['Start from last time'] : [];
  const missing = missingFacts(j.facts);
  if (missing.length) out.push(msg('ai', missing[0].ask, [...missing[0].quick, ...reuse]));
  else if (!j.sections.length) out.push(msg('ai', 'I have what I need. Ready to write it?', ['Write the description', ...reuse]));
  return out;
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
            chat: [...x.chat, msg('ai', `Here's a first draft with ${sections.length} sections. Ask me to change anything, or edit the text directly.`, ['Shorter', 'More formal', 'Add French'])],
          }
        : x,
    ),
  }));
}

/** Quick replies are short; this turns them into text the fact reader understands. */
function answerToText(text: string, j: DemoJob): string {
  const t = text.trim();
  if (/^remote$/i.test(t)) return 'remote';
  if (/^in \d weeks?$/i.test(t)) return `closing ${t.toLowerCase()}`;
  if (!j.facts.location && j.facts.arrangement !== 'remote' && /^[A-Z][a-zA-Z' -]+$/.test(t)) return `based in ${t}`;
  return t;
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
      updateJob(id, (x) => ({ ...x, facts, tags: past.tags, format: past.format, tone: past.tone, family: past.family, chat: [...x.chat, userMsg, msg('ai', `Started from your ${past.facts.title}, with a new closing date. Ready to write it?`, ['Write the description'])] }));
      return;
    }
  }
  if (lower === 'undo that') {
    updateJob(id, (x) => {
      const prev = x.versions[x.versions.length - 2];
      return prev ? { ...x, sections: prev.sections, chat: [...x.chat, userMsg, msg('ai', `Back to version ${prev.n}.`)] } : x;
    });
    return;
  }
  if (!j.sections.length) {
    const { facts, role } = extractFacts(answerToText(text, j), s.today, j.facts);
    const next = { ...j, facts, family: j.family === 'programme' && role ? role.key : j.family, chat: [...j.chat, userMsg] };
    next.tags = orderSections(Array.from(new Set([...j.tags, ...recommendSections(formatOf(s, j.format), facts)])), formatOf(s, j.format));
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

export function setFacts(id: string, patch: Partial<Facts>) {
  update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? rebuilt(s, { ...j, facts: { ...j.facts, ...patch }, updatedAfterPublish: j.status === 'live' ? true : j.updatedAfterPublish }) : j)) }));
}

export function setApply(id: string, patch: Partial<ApplySettings>) {
  update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? rebuilt(s, { ...j, apply: { ...j.apply, ...patch } }) : j)) }));
}

export function toggleSection(id: string, key: string) {
  update((s) => ({
    ...s,
    jobs: s.jobs.map((j) => {
      if (j.id !== id) return j;
      const has = j.tags.includes(key);
      const tags = has ? j.tags.filter((t) => t !== key) : [...j.tags, key];
      const next = { ...j, tags };
      if (!j.sections.length) return next;
      return { ...next, sections: has ? j.sections.filter((x) => x.key !== key) : [...j.sections, buildSection(key, ctxFor(s, next))] };
    }),
  }));
}

export function moveSection(id: string, key: string, dir: -1 | 1) {
  updateJob(id, (j) => {
    const i = j.tags.indexOf(key);
    const k = i + dir;
    if (i < 0 || k < 0 || k >= j.tags.length) return j;
    const tags = [...j.tags];
    [tags[i], tags[k]] = [tags[k], tags[i]];
    const sections = tags.map((t) => j.sections.find((x) => x.key === t)).filter(Boolean) as DemoJob['sections'];
    return { ...j, tags, sections: j.sections.length ? sections : j.sections };
  });
}

export function applyFormat(id: string, formatKey: string) {
  update((s) => ({
    ...s,
    jobs: s.jobs.map((j) => {
      if (j.id !== id) return j;
      const format = formatOf(s, formatKey);
      const extras = j.tags.filter((t) => !format.order.some((o) => o.key === t) && (['deliverables', 'learning', 'deployment', 'funding', 'conditions', 'languages'].includes(t) || j.sections.some((x) => x.key === t && x.edited)));
      const tags = orderSections([...format.order.map((o) => o.key), ...extras], format);
      const next = { ...j, format: format.key, tone: format.tone, tags, commitments: format.commitments.filter((c) => c !== 'mds' || s.org.mdsMember), chat: [...j.chat, msg('ai', `Applied ${format.label}: its headings, order, and tone. Sections you edited by hand keep your text.`)] };
      return rebuilt(s, { ...next, sections: j.sections.length ? j.sections.map((x) => ({ ...x, title: headingFor(x.key, format) })) : [] });
    }),
  }));
}

export function toggleCommitment(id: string, key: string) {
  updateJob(id, (j) => ({ ...j, commitments: j.commitments.includes(key) ? j.commitments.filter((c) => c !== key) : [...j.commitments, key] }));
}

export function markGenuine(id: string, hitKey: string, reason: string) {
  updateJob(id, (j) => ({ ...j, genuine: { ...j.genuine, [hitKey]: reason }, audit: [...j.audit, { at: Date.now(), who: getState().me.name, what: `Kept highlighted wording as a genuine requirement: "${reason}"` }] }));
}

export function editSection(id: string, key: string, text: string) {
  updateJob(id, (j) => {
    const sections = j.sections.map((x) => (x.key === key ? { ...x, lines: text.split('\n').map((l) => l.replace(/^[•*]\s*/, '- ')).filter((l) => l.trim()), edited: true } : x));
    return { ...j, sections, versions: [...j.versions, { n: j.versions.length + 1, at: Date.now(), note: `Edited ${j.sections.find((x) => x.key === key)?.title ?? key}`, sections }], updatedAfterPublish: j.status === 'live' ? true : j.updatedAfterPublish };
  });
}

export function restoreVersion(id: string, n: number) {
  updateJob(id, (j) => {
    const v = j.versions.find((x) => x.n === n);
    return v ? { ...j, sections: v.sections, versions: [...j.versions, { n: j.versions.length + 1, at: Date.now(), note: `Restored version ${n}`, sections: v.sections }] } : j;
  });
  notify(`Restored version ${n}`);
}

/** A pasted advert becomes a job in its own format; its headings can then be saved as the organisation's format. */
export function importPasted(text: string): string | null {
  const s = getState();
  const parsed = readPasted(text);
  if (!parsed.length) return null;
  const merged: Array<{ heading: string; key: string; lines: string[] }> = [];
  for (const p of parsed) {
    const same = merged.find((m) => m.key === p.key);
    if (same) same.lines.push(...p.lines);
    else merged.push({ ...p });
  }
  const { facts, role } = extractFacts(text, s.today);
  const fkey = `pasted-${s.seq + 1}`;
  const format: Format = { key: fkey, label: 'Format of your pasted advert', family: 'Your organisation', usedBy: `Read from ${merged.length} headings you pasted`, tone: 'warm', order: merged.map((m) => ({ key: m.key, heading: m.heading })), commitments: [] };
  const id = nextId('job');
  update((st) => ({ ...st, formats: [...st.formats, format] }));
  const st2 = getState();
  const job = newJob(st2, id, facts, role?.key ?? 'programme', fkey);
  job.tags = merged.map((m) => m.key);
  job.sections = merged.map((m) => ({ key: m.key, title: m.heading, lines: m.lines, edited: true }));
  job.versions = [{ n: 1, at: Date.now(), note: 'Imported from pasted text', sections: job.sections }];
  job.chat = [msg('ai', `I read ${merged.length} sections from your text and kept your wording and headings. Check the facts in the top row, then ask for any changes. You can save these headings as your organisation's format.`, ['Save as our format', 'Shorter'])];
  job.audit = [{ at: Date.now(), who: st2.me.name, what: 'Imported from a pasted advert' }];
  update((st) => ({ ...st, jobs: [job, ...st.jobs] }));
  return id;
}

export function saveAsOurFormat(id: string) {
  update((s) => {
    const j = s.jobs.find((x) => x.id === id);
    if (!j) return s;
    const house: Format = { key: 'house', label: `${s.org.short} format`, family: 'Your organisation', usedBy: 'Saved from your own advert', tone: j.tone, order: j.sections.map((x) => ({ key: x.key, heading: x.title })), commitments: j.commitments };
    return { ...s, formats: [house, ...s.formats.filter((f) => f.key !== 'house')], org: { ...s.org, learned: { source: 'upload', adverts: 1, confirmed: true } }, jobs: s.jobs.map((x) => (x.id === id ? { ...x, format: 'house' } : x)), notice: { text: `Saved as the ${s.org.short} format. New jobs start from it.` } };
  });
}

export function confirmLearned() {
  update((s) => ({ ...s, org: { ...s.org, learned: s.org.learned ? { ...s.org.learned, confirmed: true } : s.org.learned }, notice: { text: 'Your format is confirmed. New jobs start from it.' } }));
}

export function sendForReview(id: string, reviewers: Array<{ name: string; email: string; outside: boolean }>, due: string, rule: 'any' | 'all', note: string) {
  update((s) => {
    const j = s.jobs.find((x) => x.id === id);
    if (!j) return s;
    const review: Review = { state: 'open', reviewers, due, round: j.review.round + 1, rule, remarks: j.review.remarks.filter((r) => r.state === 'open'), approvedVersion: undefined };
    return {
      ...s,
      jobs: s.jobs.map((x) => (x.id === id ? { ...x, status: 'review', review, audit: [...x.audit, { at: Date.now(), who: s.me.name, what: `Sent for review to ${reviewers.map((r) => r.name).join(', ')}${note ? `: "${note}"` : ''}` }] } : x)),
      notice: { text: `Sent to ${reviewers.length} ${reviewers.length === 1 ? 'reviewer' : 'reviewers'} (simulated). Outside reviewers get a private link that expires in 7 days.` },
    };
  });
}

export function addRemark(id: string, section: string, kind: 'comment' | 'suggestion', text: string, suggestion?: string) {
  update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, review: { ...j.review, remarks: [...j.review.remarks, { id: `r${Math.random().toString(36).slice(2, 8)}`, section, author: who(s), kind, text, suggestion, state: 'open' }] } } : j)) }));
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
      inbox: [{ id: `i${Date.now()}`, kind: decision === 'approved' ? 'approved' : 'changes', jobId: id, title: `${name.split(' ')[0]} ${decision === 'approved' ? 'approved' : 'requested changes on'} ${j.facts.title}`, body: note || (decision === 'approved' ? 'Ready to publish.' : 'See the comments on the sections.'), at: Date.now() }, ...s.inbox],
      notice: { text: decision === 'approved' ? 'Approval sent (simulated)' : 'Changes requested (simulated)' },
    };
  });
}

export function settleRemark(id: string, remarkId: string, outcome: 'accepted' | 'rejected' | 'resolved') {
  updateJob(id, (j) => {
    const r = j.review.remarks.find((x) => x.id === remarkId);
    if (!r) return j;
    const sections = outcome === 'accepted' && r.suggestion ? j.sections.map((sec) => (sec.key === r.section ? { ...sec, lines: [...sec.lines, r.suggestion as string], edited: true } : sec)) : j.sections;
    return {
      ...j,
      sections,
      versions: outcome === 'accepted' ? [...j.versions, { n: j.versions.length + 1, at: Date.now(), note: `Accepted ${r.author.split(' ')[0]}'s suggestion`, sections }] : j.versions,
      review: { ...j.review, remarks: j.review.remarks.map((x) => (x.id === remarkId ? { ...x, state: outcome } : x)) },
    };
  });
}

export function overrideApproval(id: string, reason: string) {
  update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, status: 'approved', review: { ...j.review, state: 'approved' }, audit: [...j.audit, { at: Date.now(), who: s.me.name, what: `Approval overridden by the owner: "${reason}"` }] } : j)) }));
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
    const reach: ReachRecord | null = o.reach ? { ...o.reach, candidates: o.reach.candidates.map((r) => ({ ...r, status: 'queued' })), team: o.reach.team.map((r) => ({ ...r, status: 'queued' })) } : null;
    return {
      ...s,
      credits: o.useCredit ? s.credits - 1 : s.credits,
      draftsUsed: refund ? Math.max(0, s.draftsUsed - 1) : s.draftsUsed,
      jobs: s.jobs.map((x) =>
        x.id === id
          ? {
              ...x,
              status: o.schedule ? 'scheduled' : 'live',
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
      updateJob(id, (j) => (j.reach ? { ...j, reach: { ...j.reach, candidates: j.reach.candidates.map((r) => ({ ...r, status })), team: j.reach.team.map((r) => ({ ...r, status })) } } : j));
    }, delay);
  step('sending', 1200);
  step('sent', 3200);
}

function movedDeadline(today: number, current: string, days: number): string {
  const base = current && daysUntil(today, current) >= 0 ? current : addDays(today, 0);
  return addDays(parseIso(base) + 12 * 3_600_000, days);
}

export function extend(id: string, days: number) {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j) return;
  const deadline = movedDeadline(s.today, j.facts.deadline, days);
  changeWithUndo(`${j.facts.title}: closing date moved to ${longDate(deadline)}`, (st) => ({
    ...st,
    jobs: st.jobs.map((x) => (x.id === id ? rebuilt(st, { ...x, facts: { ...x.facts, deadline }, audit: [...x.audit, { at: Date.now(), who: st.me.name, what: `Extended to ${longDate(deadline)}` }] }) : x)),
    inbox: st.inbox.map((i) => (i.jobId === id && i.kind === 'deadline' ? { ...i, done: true } : i)),
  }));
}

export function closeJob(id: string, reason: 'early' | 'filled' | 'withdrawn', tellReach = false) {
  const j = getState().jobs.find((x) => x.id === id);
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

/** A new draft from an earlier job: same text, fresh dates; optionally for another duty station. */
export function hireAgain(id: string, place?: string): string | null {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j) return null;
  const nid = nextId('job');
  let facts: Facts = { ...j.facts, deadline: addDays(s.today, 27) };
  if (place) {
    const { facts: f } = extractFacts(place, s.today, emptyFacts());
    facts = { ...facts, location: f.location || place, country: f.country, iso: f.iso, timezone: f.timezone || facts.timezone };
  }
  const base: DemoJob = { ...j, id: nid, facts };
  const copy: DemoJob = {
    ...rebuilt(s, base),
    status: 'draft',
    plan: null,
    review: { state: 'none', reviewers: [], due: '', round: 0, rule: s.org.approvalRule, remarks: [] },
    reach: null,
    chat: [msg('ai', place ? `A copy of ${j.facts.title} for ${facts.location}. Check the duty-station details, then publish.` : `Reopened ${j.facts.title} with a new closing date, ${longDate(facts.deadline)}.`)],
    createdAt: Date.now(),
    publishedAt: undefined,
    closedAt: undefined,
    closeReason: undefined,
    updatedAfterPublish: false,
    countsAsFreeDraft: false,
    audit: [{ at: Date.now(), who: s.me.name, what: place ? `Created from ${j.facts.title} (${j.facts.location})` : `Reopened from ${j.facts.title}` }],
  };
  copy.versions = [{ n: 1, at: Date.now(), note: place ? `Variant for ${facts.location}` : 'Reopened', sections: copy.sections }];
  update((st) => ({ ...st, jobs: [copy, ...st.jobs] }));
  return nid;
}

export function downloadCopy(j: DemoJob, orgName: string) {
  const text = [j.facts.title, `${orgName} · ${j.facts.location}`, j.facts.deadline ? `Closing date: ${longDate(j.facts.deadline)}` : '', '', ...j.sections.flatMap((s) => [s.title.toUpperCase(), ...s.lines.map((l) => (l.startsWith('- ') ? `• ${l.slice(2)}` : l)), ''])].join('\n');
  const href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
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
        const deadline = movedDeadline(s.today, j.facts.deadline, intent.days ?? 7);
        return rebuilt(st, { ...j, facts: { ...j.facts, deadline }, audit: [...j.audit, { at: Date.now(), who: st.me.name, what: `Extended to ${longDate(deadline)} from the chat` }] });
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
