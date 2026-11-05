'use client';

import { applyLines, defaultApply } from './apply';
import {
  addDays,
  applyEdit,
  article,
  buildSection,
  buildSections,
  daysUntil,
  emptyFacts,
  extractFacts,
  FORMAT_FOR_TYPE,
  headingFor,
  isoDay,
  longDate,
  orderSections,
  parseIso,
  readPasted,
  inOutlineOrder,
  lengthRequest,
  outlineOrder,
  recommendSections,
  suggestTitle,
  toneRequest,
  type BuildContext,
} from './engine';
import { addMonths, canGoFree, currentMonth, EXTRA_JOB, freeLeft, hasFreeUse, LISTED_DAYS, monthFor, nextPaidJob, packageOf, SUBSCRIPTION_JOBS, usd, type PackageKey } from './plans';
import type { Fix } from './market';
import { changeWithUndo, getState, nextId, notify, update, updateJob } from './store';
import { addRound } from './invites';
import { draftTranslation, langOf, redraftTranslation } from './translate';
import type { ApplySettings, ChatMsg, Delivery, DemoJob, Facts, Format, Lang, Person, Plan, ReachPlan, Recipient, Review, State, Tone } from './types';

function msg(from: ChatMsg['from'], text: string, quick?: string[], ask?: ChatMsg['ask']): ChatMsg {
  return { id: `m${Math.random().toString(36).slice(2, 9)}`, from, text, quick, ask };
}

function who(s: State): string {
  return s.reviewerAs ? (s.team.find((p) => p.id === s.reviewerAs)?.name ?? 'Reviewer') : s.me.name;
}

export function formatOf(s: State, key: string): Format {
  return s.formats.find((f) => f.key === key) ?? s.formats[0];
}

export function defaultFormatKey(s: State): string {
  return s.formats.some((f) => f.key === 'house') ? 'house' : FORMAT_FOR_TYPE[s.org.orgType];
}

export function ctxFor(s: State, j: DemoJob): BuildContext {
  return { facts: j.facts, roleKey: j.family, org: s.org, tone: j.tone, format: formatOf(s, j.format), commitments: j.commitments, applyLines: applyLines(j.apply, j.facts, s.org) };
}

/** Rebuilds every section not edited by hand, keeping the user's order and headings from the job's format. Placeholders in edited sections are filled once the fact is known. */
function rebuilt(s: State, j: DemoJob): DemoJob {
  if (!j.sections.length) return j;
  const ctx = ctxFor(s, j);
  const fill = (l: string) => l.replace('[Duty station]', j.facts.location || '[Duty station]').replace('[Closing date]', j.facts.deadline ? longDate(j.facts.deadline) : '[Closing date]');
  return { ...j, sections: j.tags.map((k) => {
    const own = j.sections.find((x) => x.key === k && x.edited);
    return own ? { ...own, lines: own.lines.map(fill) } : buildSection(k, ctx);
  }) };
}

/** Whether any approval stands on the job's current text: a full approval, an override, or one reviewer's under the "any" rule. */
function hasApproval(j: DemoJob): boolean {
  return j.status === 'approved' || j.review.state === 'approved' || j.review.reviewers.some((r) => r.decision === 'approved');
}

/** A change to the text of an approved job withdraws every approval given so far and sends it back to review. */
function reopenApproval(j: DemoJob): DemoJob {
  if (!hasApproval(j)) return j;
  return {
    ...j,
    status: j.status === 'approved' ? 'review' : j.status,
    review: { ...j.review, state: j.review.state === 'none' ? 'none' : 'open', approvedVersion: undefined, reviewers: j.review.reviewers.map((r) => (r.decision === 'approved' ? { ...r, decision: undefined } : r)) },
  };
}

/** Any change to a job's content: reopens an approval, and the last chat change can no longer be undone on its own. */
function touched(j: DemoJob): DemoJob {
  return { ...reopenApproval(j), lastChange: undefined };
}

/** Reviewers comment and decide; only the job's owner changes it. */
function ownerOnly(): boolean {
  return !getState().reviewerAs;
}

export function approvalRequired(s: State, j: DemoJob): boolean {
  if (s.org.approval === 'all') return true;
  if (s.org.approval === 'senior') return /^(P[45]|D\d)/.test(j.facts.grade);
  return false;
}

export function isApproved(j: DemoJob): boolean {
  return j.review.state === 'approved' || (j.review.rule === 'any' ? j.review.reviewers.some((r) => r.decision === 'approved') : j.review.reviewers.length > 0 && j.review.reviewers.every((r) => r.decision === 'approved'));
}

const ASK_TEXT: Record<NonNullable<ChatMsg['ask']>, string> = {
  title: 'What is the job title?',
  place: 'Where is the job based?',
  deadline: 'When do applications close?',
  contract: 'What kind of contract is it?',
};

function missingFacts(f: Facts): Array<NonNullable<ChatMsg['ask']>> {
  const out: Array<NonNullable<ChatMsg['ask']>> = [];
  if (!f.title) out.push('title');
  if (!f.location && f.arrangement !== 'remote') out.push('place');
  if (!f.deadline) out.push('deadline');
  if (!f.contract && f.engagement === 'job') out.push('contract');
  return out;
}

/** The next question AidJobs needs answered, if any. */
function nextAsk(f: Facts): ChatMsg[] {
  const kind = missingFacts(f)[0];
  return kind ? [msg('ai', ASK_TEXT[kind], undefined, kind)] : [];
}

/** Whether a fact asked about is now known. */
function answered(kind: NonNullable<ChatMsg['ask']>, f: Facts): boolean {
  return kind === 'title' ? Boolean(f.title) : kind === 'place' ? Boolean(f.location) || f.arrangement === 'remote' : kind === 'deadline' ? Boolean(f.deadline) : Boolean(f.contract);
}

/** Keeps a question open until it is answered: after any message, if a fact is still missing and no question is waiting, ask it. */
function ensureAsk(id: string) {
  updateJob(id, (x) => {
    const last = x.chat[x.chat.length - 1];
    if (last?.from === 'ai' && last.ask) return x;
    const ask = nextAsk(x.facts);
    return ask.length ? { ...x, chat: [...x.chat, ...ask] } : x;
  });
}
/** The live draft: once the role is known, the job description is written straight away and fills in as facts arrive. */
function withLiveDraft(s: State, j: DemoJob): DemoJob {
  if (j.sections.length || !j.facts.title || j.tags.length < 3) return j;
  const sections = buildSections(j.tags, ctxFor(s, j));
  return { ...j, sections, versions: [...j.versions, { n: j.versions.length + 1, at: Date.now(), note: 'First draft', sections }] };
}

function memoryHint(s: State, title: string): string | null {
  const past = s.jobs.find((j) => j.status === 'closed' && title && j.facts.title.toLowerCase() === title.toLowerCase());
  return past ? `You hired ${article(past.facts.title)} ${past.facts.title} before (${past.facts.location}). Say "start from last time" to reuse it.` : null;
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
    audit: [{ at: Date.now(), who: s.me.name, what: 'Started in the chat' }],
  };
}

/** Starts a job conversation from the first message. Returns the new job's id. */
export function startJob(text: string, formatKey?: string, extra: string[] = []): string {
  const s = getState();
  const id = nextId('job');
  const { facts, role } = extractFacts(text, s.today);
  if (facts.salaryMode === 'hidden') facts.salaryMode = s.org.orgType === 'charity' ? 'range' : s.org.orgType === 'un' ? 'grade' : s.org.orgType === 'ingo' ? 'scale' : 'hidden';
  const job = newJob(s, id, facts, role?.key ?? 'programme', formatKey ?? defaultFormatKey(s));
  if (extra.length) job.tags = orderSections([...job.tags, ...extra.filter((k) => !job.tags.includes(k))], formatOf(s, job.format));
  const live = withLiveDraft(s, job);
  live.chat = [msg('user', text), ...replyAfterFacts(s, live, true)];
  update((st) => ({ ...st, jobs: [live, ...st.jobs] }));
  return id;
}

function replyAfterFacts(s: State, j: DemoJob, first: boolean): ChatMsg[] {
  const out: ChatMsg[] = [];
  const mem = first ? memoryHint(s, j.facts.title) : null;
  if (first) {
    const what = j.facts.title ? `**${j.facts.title}**${j.facts.location ? ` in ${j.facts.location}` : ''}` : '';
    if (what) out.push(msg('ai', `Got it: ${what}, in ${formatOf(s, j.format).label}. The job description is taking shape on the left, and fills in as you answer.`));
    const better = j.facts.title ? suggestTitle(j.facts.title) : null;
    if (better) out.push(msg('ai', `Did you mean **${better}**?`, [`Use "${better}"`]));
    if (mem) out.push(msg('ai', mem, ['Start from last time']));
  }
  const ask = nextAsk(j.facts);
  out.push(...(ask.length ? ask : [msg('ai', "That's everything I need. Ask for any change, or edit the job description directly.")]));
  return out;
}
/** Short answers become text the fact reader understands, using the question they answer. */
function answerToText(text: string, ask: ChatMsg['ask']): string {
  const t = text.trim();
  if (/^remote$/i.test(t)) return 'remote';
  if (/^in \d weeks?$/i.test(t)) return `closing ${t.toLowerCase()}`;
  if (ask === 'place' && /^\p{L}[\p{L}' ,.-]*$/u.test(t) && t.split(/\s+/).length <= 5) return `based in ${t}`;
  if (ask === 'deadline' && !/clos/i.test(t)) return `closing ${t}`;
  if (ask === 'contract') {
    if (/fixed|staff|\bfta\b/i.test(t)) return 'fixed-term';
    if (/temp|short/i.test(t)) return 'temporary';
    if (/permanent|open[- ]ended|indefinite/i.test(t)) return 'open-ended';
  }
  return t;
}

/** Sets facts and keeps the job in step: the live draft, placeholders, and a reopened approval. */
function withFacts(s: State, j: DemoJob, facts: Facts): DemoJob {
  const format = formatOf(s, j.format);
  const tags = j.sections.length ? j.tags : orderSections(Array.from(new Set([...j.tags, ...recommendSections(format, facts)])), format);
  return touched(withLiveDraft(s, rebuilt(s, { ...j, facts, tags, updatedAfterPublish: j.status === 'live' ? true : j.updatedAfterPublish })));
}

/** Answers a question with a fact picked in the chat (a place, a date, a contract) and asks the next one. */
export function answerFact(id: string, patch: Partial<Facts>, said: string) {
  if (!ownerOnly()) return;
  update((s) => ({
    ...s,
    jobs: s.jobs.map((j) => {
      if (j.id !== id) return j;
      const next = withFacts(s, j, { ...j.facts, ...patch });
      return { ...next, chat: [...j.chat, msg('user', said), ...replyAfterFacts(s, next, false)] };
    }),
  }));
}

const EDIT_WORDS = /\b(shorter|shorten|longer|expand|add|remove|drop|delete|formal|warm|plain|simple|make|change|rewrite|undo)\b/i;
const ASK_HINT: Record<NonNullable<ChatMsg['ask']>, string> = {
  title: 'a job title',
  place: 'a duty station. Pick one above, search for it, or write it like "Kampala, Uganda"',
  deadline: 'a closing date. Pick one above, choose it on the calendar, or write it like "30 November 2026"',
  contract: 'a contract type. Pick one above, or write "fixed-term", "temporary", or "open-ended"',
};

const UNDO = /^(please\s+)?(undo|revert|go back)( it| that| (the )?last change| to the previous version)?([\s,]+please)?[.!]?$/;

/** A request about the text (tone, length, undo), which a waiting question must not swallow as its answer. */
function isRequest(text: string): boolean {
  return Boolean(toneRequest(text) || lengthRequest(text.toLowerCase()) || UNDO.test(text.toLowerCase().trim()));
}

export function sendChat(id: string, text: string) {
  if (!ownerOnly()) return;
  chatTurn(id, text);
  ensureAsk(id);
}

function chatTurn(id: string, text: string) {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || !text.trim()) return;
  const userMsg = msg('user', text);
  const lower = text.toLowerCase();
  const lastMsg = j.chat[j.chat.length - 1];
  const pending = lastMsg?.from === 'ai' ? lastMsg.ask : undefined;
  const use = text.match(/^use "(.+)"$/i);
  if (use) {
    update((st) => ({ ...st, jobs: st.jobs.map((x) => (x.id === id ? { ...withFacts(st, x, { ...x.facts, title: use[1] }), chat: [...x.chat, userMsg, msg('ai', `The title is now **${use[1]}**.`)] } : x)) }));
    return;
  }
  if (lower === 'start from last time') {
    const past = s.jobs.find((x) => x.status === 'closed' && x.facts.title.toLowerCase() === j.facts.title.toLowerCase());
    if (past) {
      const facts: Facts = { ...past.facts, deadline: j.facts.deadline || addDays(s.today, 27), location: j.facts.location || past.facts.location, country: j.facts.country || past.facts.country, iso: j.facts.iso || past.facts.iso };
      update((st) => ({ ...st, jobs: st.jobs.map((x) => (x.id === id ? { ...touched(withLiveDraft(st, { ...x, facts, tags: past.tags, format: past.format, tone: past.tone, family: past.family, sections: [] })), chat: [...x.chat, userMsg, msg('ai', `Started from your ${past.facts.title}, with a new closing date. The job description is updated on the left.`)] } : x)) }));
      return;
    }
  }
  if (pending === 'title' && !EDIT_WORDS.test(text) && !isRequest(text) && text.trim().split(/\s+/).length <= 8) {
    const { facts, role } = extractFacts(`hiring a ${text.trim()}`, s.today, j.facts);
    const title = facts.title || text.trim().replace(/\b\p{Ll}/gu, (ch) => ch.toUpperCase());
    update((st) => ({
      ...st,
      jobs: st.jobs.map((x) => {
        if (x.id !== id) return x;
        const next = withFacts(st, { ...x, family: x.family === 'programme' && role ? role.key : x.family }, { ...facts, title });
        return { ...next, chat: [...x.chat, userMsg, ...replyAfterFacts(st, next, true).filter((m) => m.from === 'ai')] };
      }),
    }));
    return;
  }
  if (pending && pending !== 'title' && !EDIT_WORDS.test(text) && !isRequest(text)) {
    const { facts, role } = extractFacts(answerToText(text, pending), s.today, j.facts);
    if (!answered(pending, facts)) {
      updateJob(id, (x) => ({ ...x, chat: [...x.chat, userMsg, msg('ai', `I couldn't read that as ${ASK_HINT[pending]}.`, undefined, pending)] }));
      return;
    }
    update((st) => ({
      ...st,
      jobs: st.jobs.map((x) => {
        if (x.id !== id) return x;
        const next = withFacts(st, { ...x, family: x.family === 'programme' && role ? role.key : x.family }, facts);
        return { ...next, chat: [...x.chat, userMsg, ...replyAfterFacts(st, next, false)] };
      }),
    }));
    return;
  }
  if (UNDO.test(lower.trim())) {
    updateJob(id, (x) => {
      if (x.lastChange) return { ...undone(x), chat: [...x.chat, userMsg, msg('ai', 'Undone: the job description is back as it was.')] };
      const prev = x.versions[x.versions.length - 2];
      return prev ? { ...atVersion(x, prev.sections, `Back to version ${prev.n}`), chat: [...x.chat, userMsg, msg('ai', `Back to version ${prev.n}.`)] } : { ...x, chat: [...x.chat, userMsg, msg('ai', 'There is no earlier version to go back to.')] };
    });
    return;
  }
  if (!j.sections.length) {
    const { facts, role } = extractFacts(text, s.today, j.facts);
    update((st) => ({
      ...st,
      jobs: st.jobs.map((x) => {
        if (x.id !== id) return x;
        const next = withFacts(st, { ...x, family: x.family === 'programme' && role ? role.key : x.family }, facts);
        return { ...next, chat: [...x.chat, userMsg, ...replyAfterFacts(st, next, false)] };
      }),
    }));
    return;
  }
  const edit = applyEdit(text, j.tags, j.sections, ctxFor(s, j), s.today);
  const factsChanged = JSON.stringify(edit.facts) !== JSON.stringify(j.facts);
  const result = factsChanged ? { ...edit, sections: rebuilt(s, { ...j, sections: edit.sections, tags: edit.tags, tone: edit.tone, facts: edit.facts }).sections } : edit;
  if (JSON.stringify([result.sections, result.tags, result.tone, result.facts]) === JSON.stringify([j.sections, j.tags, j.tone, j.facts])) {
    updateJob(id, (x) => ({ ...x, chat: [...x.chat, userMsg, msg('ai', result.reply, result.quick)] }));
    return;
  }
  updateJob(id, (x) => ({
    ...reopenApproval(x),
    sections: result.sections,
    tags: result.tags,
    tone: result.tone,
    facts: result.facts,
    updatedAfterPublish: x.status === 'live' ? true : x.updatedAfterPublish,
    versions: [...x.versions, { n: x.versions.length + 1, at: Date.now(), note: text.slice(0, 60), sections: result.sections }],
    chat: [...x.chat, userMsg, msg('ai', result.reply + (hasApproval(x) ? ' This changes the approved version, so the approval is reset.' : ''), result.quick)],
    lastChange: changedKeys(x.sections, result.sections).length ? { keys: changedKeys(x.sections, result.sections), text: result.reply, before: x.sections, beforeTags: x.tags, beforeFacts: x.facts, beforeTone: x.tone } : undefined,
  }));
}
/** Sections whose text is new or different after a change. */
function changedKeys(before: DemoJob['sections'], after: DemoJob['sections']): string[] {
  return after.filter((a) => JSON.stringify(before.find((b) => b.key === a.key)?.lines) !== JSON.stringify(a.lines)).map((a) => a.key);
}

/** The job as it was before the last change asked for in the chat: text, outline, facts, and tone. */
function undone(x: DemoJob): DemoJob {
  if (!x.lastChange) return x;
  const { before, beforeTags, beforeFacts, beforeTone } = x.lastChange;
  return { ...touched(x), sections: before, tags: beforeTags, facts: beforeFacts, tone: beforeTone, versions: [...x.versions, { n: x.versions.length + 1, at: Date.now(), note: 'Undid the last change', sections: before }] };
}

/** The job with an earlier version's text; the outline follows the text, so the two never disagree. */
function atVersion(x: DemoJob, sections: DemoJob['sections'], note: string): DemoJob {
  const tags = outlineOrder(sections.map((sec) => sec.key));
  return { ...touched(x), tags, sections: inOutlineOrder(sections, tags), versions: [...x.versions, { n: x.versions.length + 1, at: Date.now(), note, sections }] };
}

/** Puts back the sections as they were before the last change asked for in the chat. */
export function undoLastChange(id: string) {
  if (!ownerOnly()) return;
  updateJob(id, (x) => (x.lastChange ? { ...undone(x), chat: [...x.chat, msg('ai', 'Undone: the job description is back as it was.')] } : x));
  ensureAsk(id);
}

export function dismissChange(id: string) {
  updateJob(id, (x) => ({ ...x, lastChange: undefined }));
}

export function setFacts(id: string, patch: Partial<Facts>) {
  if (!ownerOnly()) return;
  const j = getState().jobs.find((x) => x.id === id);
  if (j && (Object.keys(patch) as Array<keyof Facts>).every((k) => JSON.stringify(j.facts[k]) === JSON.stringify(patch[k]))) return;
  update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? withFacts(s, j, { ...j.facts, ...patch }) : j)) }));
}

export function setApply(id: string, patch: Partial<ApplySettings>) {
  if (!ownerOnly()) return;
  const j = getState().jobs.find((x) => x.id === id);
  if (j && (Object.keys(patch) as Array<keyof ApplySettings>).every((k) => JSON.stringify(j.apply[k]) === JSON.stringify(patch[k]))) return;
  update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? rebuilt(s, touched({ ...j, apply: { ...j.apply, ...patch } })) : j)) }));
}

export function toggleSection(id: string, key: string) {
  if (!ownerOnly()) return;
  update((s) => ({
    ...s,
    jobs: s.jobs.map((j) => {
      if (j.id !== id) return j;
      const has = j.tags.includes(key);
      const tags = has ? j.tags.filter((t) => t !== key) : outlineOrder([...j.tags, key]);
      const next = touched({ ...j, tags });
      if (!j.sections.length) return next;
      const sections = has ? j.sections.filter((x) => x.key !== key) : inOutlineOrder([...j.sections, buildSection(key, ctxFor(s, next))], tags);
      const title = has ? j.sections.find((x) => x.key === key)?.title : sections.find((x) => x.key === key)?.title;
      return { ...next, sections, versions: [...j.versions, { n: j.versions.length + 1, at: Date.now(), note: `${has ? 'Removed' : 'Added'} ${title ?? key}`, sections }] };
    }),
  }));
}

/** Puts some of a job's sections in a new order, keeping the places the others hold. */
export function reorderSections(id: string, keys: string[]) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => {
    const queue = [...keys];
    const tags = outlineOrder(j.tags.map((t) => (keys.includes(t) ? (queue.shift() ?? t) : t)));
    if (tags.join() === j.tags.join()) return j;
    const sections = inOutlineOrder(j.sections, tags);
    return { ...touched(j), tags, sections: j.sections.length ? sections : j.sections };
  });
}

export function applyFormat(id: string, formatKey: string) {
  if (!ownerOnly()) return;
  update((s) => ({
    ...s,
    jobs: s.jobs.map((j) => {
      if (j.id !== id) return j;
      const format = formatOf(s, formatKey);
      const extras = j.tags.filter((t) => !format.order.some((o) => o.key === t) && (['deliverables', 'learning', 'deployment', 'funding', 'conditions', 'languages'].includes(t) || j.sections.some((x) => x.key === t && x.edited)));
      const tags = orderSections([...format.order.map((o) => o.key), ...extras], format);
      const next = { ...touched(j), format: format.key, tone: format.tone, tags, commitments: format.commitments.filter((c) => c !== 'mds' || s.org.mdsMember), chat: [...j.chat, msg('ai', `Applied ${format.label}: its headings, order, and tone. Sections you edited by hand keep your text.`)] };
      return rebuilt(s, { ...next, sections: j.sections.length ? j.sections.map((x) => ({ ...x, title: headingFor(x.key, format) })) : [] });
    }),
  }));
}

export function toggleCommitment(id: string, key: string) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => ({ ...touched(j), commitments: j.commitments.includes(key) ? j.commitments.filter((c) => c !== key) : [...j.commitments, key] }));
}

export function markGenuine(id: string, hitKey: string, reason: string) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => ({ ...j, genuine: { ...j.genuine, [hitKey]: reason }, audit: [...j.audit, { at: Date.now(), who: getState().me.name, what: `Kept highlighted wording as a genuine requirement: "${reason}"` }] }));
}

export function editSection(id: string, key: string, text: string) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => {
    const lines = text.split('\n').map((l) => l.replace(/^[•*]\s*/, '- ')).filter((l) => l.trim());
    if (JSON.stringify(lines) === JSON.stringify(j.sections.find((x) => x.key === key)?.lines)) return j;
    const sections = j.sections.map((x) => (x.key === key ? { ...x, lines, edited: true } : x));
    return { ...touched(j), sections, versions: [...j.versions, { n: j.versions.length + 1, at: Date.now(), note: `Edited ${j.sections.find((x) => x.key === key)?.title ?? key}`, sections }], updatedAfterPublish: j.status === 'live' ? true : j.updatedAfterPublish };
  });
}

export function restoreVersion(id: string, n: number) {
  if (!ownerOnly()) return;
  const v = getState().jobs.find((j) => j.id === id)?.versions.find((x) => x.n === n);
  if (!v) return;
  updateJob(id, (j) => atVersion(j, v.sections, `Restored version ${n}`));
  notify(`Restored version ${n}`);
}

/** An uploaded job description becomes a job in its own JD format, keeping its wording and headings. `fromHost` marks text that stands in for a web page (the demo never fetches). */
export function importPasted(text: string, fromHost?: string): string | null {
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
  const format: Format = {
    key: fkey,
    label: fromHost ? 'JD format of the linked job description' : 'JD format of your uploaded job description',
    family: 'Your organisation',
    usedBy: fromHost ? `Read from ${merged.length} headings on ${fromHost}` : `Read from ${merged.length} headings in your job description`,
    tone: 'warm',
    order: merged.map((m) => ({ key: m.key, heading: m.heading })),
    commitments: [],
  };
  const id = nextId('job');
  update((st) => ({ ...st, formats: [...st.formats, format] }));
  const st2 = getState();
  const job = newJob(st2, id, facts, role?.key ?? 'programme', fkey);
  job.tags = outlineOrder(merged.map((m) => m.key));
  job.sections = inOutlineOrder(merged.map((m) => ({ key: m.key, title: m.heading, lines: m.lines, edited: true })), job.tags);
  job.versions = [{ n: 1, at: Date.now(), note: fromHost ? `Imported from ${fromHost}` : 'Imported from an uploaded job description', sections: job.sections }];
  const read = fromHost ? `I read ${merged.length} sections from the page on ${fromHost} (simulated in the demo: a sample job description stands in for the page)` : `I read ${merged.length} sections from your job description`;
  job.chat = [msg('ai', `${read} and kept the wording and headings. Check the facts in the top row, then ask for any changes.`, ['Shorter', 'More formal'])];
  job.audit = [{ at: Date.now(), who: st2.me.name, what: fromHost ? `Imported from a link on ${fromHost}` : 'Imported from an uploaded job description' }];
  update((st) => ({ ...st, jobs: [job, ...st.jobs] }));
  return id;
}

/** Uploads a job description for a new job; with a name, its headings are also saved as a JD format for reuse. */
export function importJobDescription(text: string, opts: { host?: string; saveAs?: string } = {}): string | null {
  const id = importPasted(text, opts.host);
  const name = opts.saveAs?.trim();
  if (!id || !name) return id;
  const j = getState().jobs.find((x) => x.id === id);
  if (!j) return id;
  const key = createFormat(name, j.sections.map((x) => ({ key: x.key, heading: x.title })), j.tone);
  updateJob(id, (x) => ({ ...x, format: key }));
  return id;
}

/** Saves a format the organisation built itself, for reuse. Returns its key. */
export function createFormat(label: string, order: Format['order'], tone: Tone): string {
  const key = nextId('format');
  update((s) => ({
    ...s,
    formats: [...s.formats, { key, label, family: 'Your organisation', usedBy: `Created by ${s.me.name}`, tone, order, commitments: formatOf(s, 'house').commitments }],
    notice: { text: `Saved ${label}. It is under Your organisation in Select a JD format.` },
  }));
  return key;
}
/**
 * A free job counts the first time it is used (published, sent for review, or downloaded), against the allowance of the month it is used in.
 * Exploring and editing are free; with the month's free jobs used, nothing is counted and the job is paid for or scheduled when it is published.
 */
function useFree(s: State, id: string, month = currentMonth(s)): State {
  const j = s.jobs.find((x) => x.id === id);
  if (!j || j.plan === 'amplify' || hasFreeUse(s, id) || freeLeft(s, month) === 0) return s;
  return { ...s, freeUses: [...s.freeUses, { jobId: id, month }] };
}

/** Uses one paid job on hand, the soonest to lapse first. */
function takePaidJob(s: State): State {
  const pick = nextPaidJob(s);
  if (!pick) return s;
  if (pick.kind === 'subscription') return s.subscription ? { ...s, subscription: { ...s.subscription, left: s.subscription.left - 1 } } : s;
  return { ...s, packs: s.packs.map((p) => (p.id === pick.pack.id ? { ...p, left: p.left - 1 } : p)) };
}

export function acceptFreeTerms() {
  update((s) => ({ ...s, org: { ...s.org, freeTermsAccepted: true } }));
}

/**
 * Pays at the simulated checkout: one job, an extra job on the subscription, a pack of jobs, or the subscription.
 * A pack or the subscription adds paid jobs on hand; one job or an extra job pays for the job named.
 */
export function buy(key: PackageKey | 'extra', jobTitle = '') {
  update((s) => {
    const today = isoDay(s.today);
    const p = packageOf(key === 'extra' ? 'one' : key);
    const amount = key === 'extra' ? EXTRA_JOB : p.price;
    const ends = addMonths(today, p.months);
    const item =
      key === 'one' ? `Amplify: ${jobTitle}` : key === 'extra' ? `Extra job on “Always hiring”: ${jobTitle}` : key === 'always' ? '“Always hiring” subscription, one month' : `${p.jobs} jobs, to use by ${longDate(ends)}`;
    const next: State = {
      ...s,
      packs: key === 'three' || key === 'five' ? [...s.packs, { id: `pk${Date.now()}`, jobs: p.jobs, left: p.jobs, ends, at: Date.now() }] : s.packs,
      subscription: key === 'always' ? { since: today, renews: ends, left: SUBSCRIPTION_JOBS, cancelled: false } : s.subscription,
      receipts: [{ id: `rc${Date.now()}`, at: Date.now(), item, amount: `${usd(amount)} (placeholder)` }, ...s.receipts],
      inbox: [{ id: `i${Date.now()}`, kind: 'receipt', title: `Receipt: ${item}`, body: 'Simulated payment: in the real product the receipt and invoice are emailed to the address used at checkout.', at: Date.now() }, ...s.inbox],
    };
    return next;
  });
}

export function cancelSubscription() {
  update((s) =>
    s.subscription ? { ...s, subscription: { ...s.subscription, cancelled: true }, notice: { text: `Cancelled. This month's jobs stay until ${longDate(s.subscription.renews)}, and nothing more is charged.` } } : s,
  );
}

export function sendForReview(id: string, reviewers: Array<{ name: string; email: string; outside: boolean }>, due: string, rule: 'any' | 'all', note: string) {
  update((s0) => {
    const s = useFree(s0, id);
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
  if (!ownerOnly()) return;
  updateJob(id, (j) => {
    const r = j.review.remarks.find((x) => x.id === remarkId);
    if (!r) return j;
    const accepted = outcome === 'accepted' && Boolean(r.suggestion);
    const sections = accepted ? j.sections.map((sec) => (sec.key === r.section ? { ...sec, lines: [...sec.lines, r.suggestion as string], edited: true } : sec)) : j.sections;
    return {
      ...(accepted ? touched(j) : j),
      sections,
      versions: outcome === 'accepted' ? [...j.versions, { n: j.versions.length + 1, at: Date.now(), note: `Accepted ${r.author.split(' ')[0]}'s suggestion`, sections }] : j.versions,
      review: { ...j.review, remarks: j.review.remarks.map((x) => (x.id === remarkId ? { ...x, state: outcome } : x)) },
    };
  });
}

/** A one-tap fix from the market or advert check. Like any change it can be undone, and it withdraws an approval. */
export function applyFix(id: string, fix: Fix, label: string) {
  if (!ownerOnly()) return;
  const j = getState().jobs.find((x) => x.id === id);
  if (!j) return;
  changeWithUndo(`${label}: done`, (st) => ({
    ...st,
    jobs: st.jobs.map((x) => {
      if (x.id !== id) return x;
      if (fix.kind === 'deadline') return withFacts(st, x, { ...x.facts, deadline: fix.date });
      if (fix.kind === 'facts') return withFacts(st, x, { ...x.facts, ...fix.patch });
      if (fix.kind === 'language') {
        const langs = x.facts.languages.length ? x.facts.languages : ['English'];
        const tags = x.tags.includes('languages') ? x.tags : outlineOrder([...x.tags, 'languages']);
        const next = withFacts(st, { ...x, tags }, { ...x.facts, languages: langs.includes(fix.lang) ? langs : [...langs, fix.lang] });
        return { ...next, versions: [...next.versions, { n: next.versions.length + 1, at: Date.now(), note: label, sections: next.sections }] };
      }
      const sections = x.sections.map((sec) => (sec.key === fix.section ? { ...sec, lines: fix.lines, edited: true } : sec));
      return { ...touched(x), sections, updatedAfterPublish: x.status === 'live' ? true : x.updatedAfterPublish, versions: [...x.versions, { n: x.versions.length + 1, at: Date.now(), note: label, sections }] };
    }),
  }));
}

/** A first draft of a language version, for the employer to review. */
export function addTranslation(id: string, lang: Lang) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => ({ ...j, translations: { ...j.translations, [lang]: draftTranslation(j, lang) }, audit: [...j.audit, { at: Date.now(), who: getState().me.name, what: `${langOf(lang).label} version drafted (simulated)` }] }));
}

/** Brings a version up to date after the English changed, keeping the wording of lines whose English did not change. */
export function refreshTranslation(id: string, lang: Lang) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => {
    const t = j.translations?.[lang];
    return t ? { ...j, translations: { ...j.translations, [lang]: redraftTranslation(j, t, lang) } } : j;
  });
}

export function removeTranslation(id: string, lang: Lang) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => {
    const rest = { ...j.translations };
    delete rest[lang];
    return { ...j, translations: rest };
  });
}

/** An edit to a version needs a new review. */
export function editTranslation(id: string, lang: Lang, key: string, index: number | 'title', text: string) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => {
    const t = j.translations?.[lang];
    if (!t) return j;
    const sections = t.sections.map((sec) => (sec.key !== key ? sec : index === 'title' ? { ...sec, title: text } : { ...sec, lines: sec.lines.map((l, i) => (i === index ? text : l)) }));
    return { ...j, translations: { ...j.translations, [lang]: { ...t, sections, reviewed: false } } };
  });
}

export function reviewTranslation(id: string, lang: Lang) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => {
    const t = j.translations?.[lang];
    return t ? { ...j, translations: { ...j.translations, [lang]: { ...t, reviewed: true } }, audit: [...j.audit, { at: Date.now(), who: getState().me.name, what: `${langOf(lang).label} version reviewed` }] } : j;
  });
}

/** Who may publish without approval: only where approval is required, only the owner, and never when the organisation says nobody can skip it. */
export function canSkipApproval(s: State, j: DemoJob): boolean {
  return !s.reviewerAs && s.me.role === 'owner' && !s.org.noSkip && approvalRequired(s, j) && !isApproved(j);
}

/** Publishing without approval: the reason is kept in the job's history (never public), and the reviewers asked are told. */
export function overrideApproval(id: string, reason: string): boolean {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || !canSkipApproval(s, j) || reason.trim().length < 5) return false;
  const asked = j.review.reviewers.map((r) => r.name.split(' ')[0]);
  update((st) => ({
    ...st,
    jobs: st.jobs.map((x) => (x.id === id ? { ...x, status: 'approved', review: { ...x.review, state: 'approved' }, audit: [...x.audit, { at: Date.now(), who: st.me.name, what: `Published without approval. Reason: "${reason.trim()}"` }] } : x)),
    notice: asked.length ? { text: `${asked.join(' and ')} ${asked.length === 1 ? 'is' : 'are'} told it was published without their approval (simulated).` } : st.notice,
  }));
  return true;
}

/**
 * How a paid job is paid for: `direct` when this job was just paid for at the checkout (one job, or an extra job on the subscription),
 * `onHand` to use a job from a pack or the subscription.
 */
export type Paid = 'direct' | 'onHand';

export type PublishOptions = { plan: Plan; schedule: string | null; paid?: Paid };

/** Whether the job can be published with these options; the reason when it cannot. */
export function publishBlock(s: State, id: string, o: PublishOptions): string | null {
  const j = s.jobs.find((x) => x.id === id);
  if (!j || s.reviewerAs) return 'Only your organisation can publish';
  if (j.status === 'live' || j.status === 'scheduled' || j.status === 'closed') return 'Already published';
  if (approvalRequired(s, j) && !isApproved(j)) return 'Waiting for approval';
  if (o.plan === 'free' && !canGoFree(s, id, o.schedule)) return 'No free job left for that month';
  if (o.plan === 'amplify' && !o.paid) return 'Not paid';
  if (o.plan === 'amplify' && o.paid === 'onHand' && !nextPaidJob(s)) return 'No paid job on hand';
  return null;
}

/** The Reach round prepared for a paid job, sent when it goes live: now, or on its scheduled date. Free jobs send nothing. */
function reachAtGoLive(j: DemoJob, sendsOn: string | null): Partial<DemoJob> {
  const plan = j.reachPlan;
  const reach = plan ? addRound(j, plan, 'At go-live', sendsOn) : null;
  if (!reach) return {};
  const round = reach.rounds[reach.rounds.length - 1];
  const count = reach.candidates.filter((r) => r.round === round.n).length + reach.team.filter((r) => r.round === round.n).length;
  return {
    reach,
    reachPlan: undefined,
    audit: [...j.audit, { at: Date.now(), who: getState().me.name, what: `Reach: ${count} ${count === 1 ? 'email' : 'emails'} ${sendsOn ? `to send on ${longDate(sendsOn)}, when it goes live` : 'queued at go-live'} (simulated)` }],
  };
}

/** Publishes, then queues the prepared Reach emails. Publishing never waits for, or depends on, the emails. */
export function publish(id: string, o: PublishOptions): boolean {
  if (publishBlock(getState(), id, o)) return false;
  let sending = false;
  update((s0) => {
    let s = o.plan === 'free' ? useFree(s0, id, monthFor(s0, o.schedule)) : s0;
    if (o.plan === 'amplify' && o.paid === 'onHand') s = takePaidJob(s);
    const how = o.plan === 'amplify' ? `Amplified (${o.paid === 'onHand' ? 'a package job' : 'paid'}), listed ${LISTED_DAYS.amplify} days` : `Free, listed ${LISTED_DAYS.free} days`;
    return {
      ...s,
      jobs: s.jobs.map((x) => {
        if (x.id !== id) return x;
        const next: DemoJob = {
          ...x,
          status: o.schedule ? 'scheduled' : 'live',
          plan: o.plan,
          scheduledFor: o.schedule ?? undefined,
          publishedAt: o.schedule ? undefined : Date.now(),
          audit: [...x.audit, { at: Date.now(), who: s.me.name, what: `${o.schedule ? `Scheduled for ${longDate(o.schedule)}` : 'Published'}: ${how}` }],
        };
        if (o.plan !== 'amplify') return next;
        const reach = reachAtGoLive(next, o.schedule);
        sending = Boolean(reach.reach && !o.schedule);
        return { ...next, ...reach };
      }),
    };
  });
  if (sending) simulateDelivery(id);
  return true;
}

/** Saves the people and the messages for the next Reach round. Team emails go only to the organisation's own domain. */
export function setReachPlan(id: string, plan: ReachPlan) {
  if (!ownerOnly()) return;
  const domain = getState().org.domain;
  updateJob(id, (j) => ({ ...j, reachPlan: { ...plan, team: plan.team.filter((e) => e.endsWith(`@${domain}`)) } }));
}

/** "Invite more" for a live amplified job: the prepared round is sent now. */
export function sendReach(id: string, why: string): number {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || s.reviewerAs || j.plan !== 'amplify' || j.status !== 'live' || !j.reachPlan) return 0;
  const reach = addRound(j, j.reachPlan, why, null);
  if (!reach) return 0;
  const n = reach.rounds.length;
  const count = reach.candidates.filter((r) => r.round === n).length + reach.team.filter((r) => r.round === n).length;
  updateJob(id, (x) => ({ ...x, reach, reachPlan: undefined, audit: [...x.audit, { at: Date.now(), who: s.me.name, what: `Reach: ${count} more ${count === 1 ? 'email' : 'emails'} queued (${why.toLowerCase()}, simulated)` }] }));
  simulateDelivery(id);
  return count;
}

/** "Not now" on a reminder: it does not come back; the next moment still does. */
export function dismissMoment(id: string, key: string) {
  updateJob(id, (j) => ({ ...j, reachDismissed: [...(j.reachDismissed ?? []), key] }));
}

export function setReachReminders(id: string, on: boolean) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => ({ ...j, reachReminders: on }));
}

/** Amplifies a live or scheduled free job: listed 100 days from publishing, and featured. The free job it used stays used. */
export function amplifyLive(id: string, paid: Paid): boolean {
  const s0 = getState();
  const j = s0.jobs.find((x) => x.id === id);
  if (!j || s0.reviewerAs || j.plan !== 'free' || (j.status !== 'live' && j.status !== 'scheduled')) return false;
  if (paid === 'onHand' && !nextPaidJob(s0)) return false;
  const sendsOn = j.status === 'scheduled' ? (j.scheduledFor ?? null) : null;
  let sending = false;
  update((s1) => {
    const s = paid === 'onHand' ? takePaidJob(s1) : s1;
    return {
      ...s,
      jobs: s.jobs.map((x) => {
        if (x.id !== id) return x;
        const next: DemoJob = { ...x, plan: 'amplify', audit: [...x.audit, { at: Date.now(), who: s.me.name, what: `Amplified (${paid === 'onHand' ? 'a package job' : 'paid'}): listed ${LISTED_DAYS.amplify} days from publishing` }] };
        const reach = reachAtGoLive(next, sendsOn);
        sending = Boolean(reach.reach && !sendsOn);
        return { ...next, ...reach };
      }),
    };
  });
  if (sending) simulateDelivery(id);
  return true;
}

/** Simulated email progress for emails queued now: sending, then sent. Labelled as simulated everywhere it is shown. */
function simulateDelivery(id: string) {
  const step = (from: Delivery, status: Delivery, delay: number) =>
    setTimeout(() => {
      const move = (r: Recipient): Recipient => (r.status === from ? { ...r, status } : r);
      update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id && j.reach ? { ...j, reach: { ...j.reach, candidates: j.reach.candidates.map(move), team: j.reach.team.map(move) } } : j)) }), true);
    }, delay);
  step('queued', 'sending', 1200);
  step('sending', 'sent', 3200);
}

function movedDeadline(today: number, current: string, days: number): string {
  const base = current && daysUntil(today, current) >= 0 ? current : addDays(today, 0);
  return addDays(parseIso(base) + 12 * 3_600_000, days);
}

/** A new closing date is a change to the job's facts and text, like any other. */
function extended(s: State, j: DemoJob, deadline: string, what: string): DemoJob {
  return rebuilt(s, { ...touched(j), facts: { ...j.facts, deadline }, updatedAfterPublish: j.status === 'live' ? true : j.updatedAfterPublish, audit: [...j.audit, { at: Date.now(), who: s.me.name, what }] });
}

export function extend(id: string, days: number) {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j) return;
  const deadline = movedDeadline(s.today, j.facts.deadline, days);
  changeWithUndo(`${j.facts.title}: closing date moved to ${longDate(deadline)}`, (st) => ({
    ...st,
    jobs: st.jobs.map((x) => (x.id === id ? extended(st, x, deadline, `Extended to ${longDate(deadline)}`) : x)),
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
  if (!ownerOnly()) return;
  const j = getState().jobs.find((x) => x.id === id);
  const inReview = j?.status === 'review' || j?.status === 'approved';
  const what = inReview ? `Withdrawn from review and deleted: ${j?.facts.title || 'untitled'}. Reviewers were told (simulated)` : `Job draft deleted: ${j?.facts.title || 'untitled'}`;
  changeWithUndo(what, (s) => ({ ...s, jobs: s.jobs.filter((x) => x.id !== id) }));
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
    translations: undefined,
    reachPlan: undefined,
    reachDismissed: undefined,
    lastChange: undefined,
    audit: [{ at: Date.now(), who: s.me.name, what: place ? `Created from ${j.facts.title} (${j.facts.location})` : `Reopened from ${j.facts.title}` }],
  };
  copy.versions = [{ n: 1, at: Date.now(), note: place ? `Variant for ${facts.location}` : 'Reopened', sections: copy.sections }];
  update((st) => ({ ...st, jobs: [copy, ...st.jobs] }));
  return nid;
}

export function downloadCopy(j: DemoJob, orgName: string) {
  update((s) => useFree(s, j.id));
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
        return extended(st, j, deadline, `Extended to ${longDate(deadline)} from the chat`);
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

/**
 * The headings most of the organisation's own job descriptions share, when at least two share them in the same order and they differ from its
 * base JD format. Only the organisation's own job descriptions in AidJobs are looked at; nothing is read from elsewhere.
 */
export function basePattern(s: State): { order: Format['order']; count: number; sig: string } | null {
  const groups = new Map<string, { order: Format['order']; count: number }>();
  for (const j of s.jobs) {
    if (j.sections.length < 3) continue;
    const order = inOutlineOrder(j.sections, j.tags).map((x) => ({ key: x.key, heading: x.title }));
    const key = order.map((o) => o.heading.toLowerCase()).join('|');
    const g = groups.get(key);
    groups.set(key, { order, count: (g?.count ?? 0) + 1 });
  }
  const best = [...groups.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (!best || best[1].count < 2) return null;
  const house = s.formats.find((f) => f.key === 'house');
  if (house && house.order.map((o) => o.heading.toLowerCase()).join('|') === best[0]) return null;
  return { order: best[1].order, count: best[1].count, sig: `${best[0]}#${best[1].count}` };
}

/** Makes headings the organisation's base JD format: the default start for new jobs. Each job can still change its own sections. */
export function setBaseFormat(order: Format['order'], from: string, tone?: Tone, count = 1) {
  update((s) => {
    const old = s.formats.find((f) => f.key === 'house');
    const house: Format = { key: 'house', label: `${s.org.short} format`, family: 'Your organisation', usedBy: `Your base JD format, ${from}`, tone: tone ?? old?.tone ?? 'warm', order, commitments: old?.commitments ?? formatOf(s, FORMAT_FOR_TYPE[s.org.orgType]).commitments };
    return { ...s, formats: [house, ...s.formats.filter((f) => f.key !== 'house')], org: { ...s.org, learned: { source: 'history', adverts: count, confirmed: true } }, notice: { text: `Saved as your base JD format. New jobs start from it.` } };
  });
}

export function notNowBase(sig: string) {
  update((s) => ({ ...s, baseDismissed: sig }));
}

/** "Edit it": the edited headings become the base, and the offer they answered is not made again. */
export function saveEditedBase(pattern: { count: number; sig: string }, order: Format['order'], tone: Tone) {
  setBaseFormat(order, `from ${pattern.count} of your own job descriptions`, tone, pattern.count);
  notNowBase(pattern.sig);
}

/** Makes a job's outline the organisation's base JD format; offered from the job's menu, never applied automatically. */
export function updateBaseFromJob(id: string) {
  if (!ownerOnly()) return;
  const j = getState().jobs.find((x) => x.id === id);
  if (j?.sections.length) setBaseFormat(inOutlineOrder(j.sections, j.tags).map((x) => ({ key: x.key, heading: x.title })), `from "${j.facts.title || 'a job description'}"`, j.tone);
}

/** Forgets the base JD format: it stays as an ordinary saved format, and new jobs start from the closest standard JD format again. */
export function forgetBase() {
  update((s) => {
    const house = s.formats.find((f) => f.key === 'house');
    if (!house) return s;
    const key = `format-forgotten-${s.seq + 1}`;
    const next: State = {
      ...s,
      seq: s.seq + 1,
      formats: s.formats.map((f) => (f.key === 'house' ? { ...f, key, label: `${f.label} (no longer the base)`, usedBy: 'A saved JD format; no longer the base' } : f)),
      jobs: s.jobs.map((j) => (j.format === 'house' ? { ...j, format: key } : j)),
      org: { ...s.org, learned: null },
      notice: { text: 'Forgotten. New jobs start from the closest standard JD format again.' },
    };
    return { ...next, baseDismissed: basePattern(next)?.sig };
  });
}