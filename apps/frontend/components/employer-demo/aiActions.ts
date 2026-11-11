'use client';

import {
  acceptPoint,
  aiExchange,
  applyFormat,
  applyTemplate,
  approveSection,
  chooseStyle,
  confirmChange,
  keepStyleForAll,
  leavePoint,
  missingFacts,
  renameSection,
  reorderSections,
  setApply,
  setFactsFromChat,
  setPace,
  setStyle,
  settleQuestion,
  toggleCommitment,
  toggleSection,
  undoLastChange,
  writeSections,
} from './actions';
import { COMMITMENTS, CONTRACTS, daysUntil, extractFacts, headingFor, LANGUAGES, SECTION_BY_KEY, emptyFacts } from './engine';
import { ASKS, checkPoints, DECLINABLE, FIXED_SECTIONS, isSettled, isWritten, LEFT, nextStep, stepKey } from './flow';
import { STYLES } from './setup';
import { getState } from './store';
import type { AskKind, ChatMsg, DemoJob, Engagement, Facts, State } from './types';

export { FIXED_SECTIONS };

/**
 * The demo's side of the AI chat (employer-side plan, section 19, "The AI chat in the demo"): the AI understands and writes; the demo
 * checks each action it returns against the job and carries it out with its existing functions, so dates, prices, the fixed text, the
 * checks, and the free and paid rules stay exact. Anything unknown or unsafe is refused, and the reply says what was not done.
 */
export const OPEN_TARGETS = ['outline', 'templates', 'own', 'details', 'fixed', 'check', 'publish', 'preview', 'versions', 'download', 'delete', 'review'] as const;
export type OpenTarget = (typeof OPEN_TARGETS)[number] | `section:${string}`;

const ENGAGEMENT_KEYS: Engagement[] = ['job', 'consultancy', 'internship', 'volunteer'];
const ORDER = [
  'undo',
  'confirm_change',
  'set_facts',
  'set_apply',
  'settle',
  'use_template',
  'set_style',
  'keep_style',
  'set_pace',
  'add_section',
  'remove_section',
  'reorder_sections',
  'rename_section',
  'write_section',
  'approve_section',
  'fixed_text',
  'leave_point',
  'accept_point',
  'open',
  'ask',
];
const METHODS = ['system', 'email', 'form', 'formOnly'] as const;

const PAY = /(?:\b(?:USD|US\$|EUR|GBP|KES|UGX|TZS|ETB|NGN|ZAR|INR|BDT|PKR|AUD|CAD|CHF|SEK|NOK|DKK|XOF|XAF)|[$€£])\s?\d[\d,.]*\s?k?\b/gi;
const CONTACT = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b|\bhttps?:\/\/[^\s)]+|\bwww\.[^\s)]+/gi;

export type AiTurn = { reply: string; actions: unknown[] };

type Raw = Record<string, unknown>;
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() && v.length <= max && !/[\n\r]/.test(v) ? v.trim() : null);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null);

/** Facts from a set_facts action, each checked; what does not pass is named in `refused`. */
export function checkFacts(raw: unknown, job: DemoJob, today: number): { patch: Partial<Facts>; refused: string[] } {
  const patch: Partial<Facts> = {};
  const refused: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { patch, refused: ['the facts'] };
  const f = raw as Raw;
  const no = (k: string) => refused.push(k);
  for (const k of Object.keys(f)) {
    const v = f[k];
    switch (k) {
      case 'title': {
        const t = str(v, 120);
        if (t && t.length >= 2) patch.title = t;
        else no('the job title');
        break;
      }
      case 'location': {
        const t = str(v, 80);
        if (!t) no('the duty station');
        else if (/^remote$/i.test(t)) patch.arrangement = 'remote';
        else {
          const read = extractFacts(`based in ${t}`, today, emptyFacts()).facts;
          if (!read.location) no('the duty station');
          else Object.assign(patch, { location: read.location, country: read.country, iso: read.iso, timezone: read.timezone, ...(read.currency && !job.facts.currency ? { currency: read.currency } : {}) });
        }
        break;
      }
      case 'arrangement': {
        const a = oneOf(v, ['onsite', 'hybrid', 'remote'] as const);
        if (a) patch.arrangement = a;
        else no('the work arrangement');
        break;
      }
      case 'engagement': {
        const e = oneOf(v, ENGAGEMENT_KEYS);
        if (e) patch.engagement = e;
        else no('the kind of job');
        break;
      }
      case 'contract':
        break;
      case 'hours': {
        const h = oneOf(v, ['full', 'part'] as const);
        if (h) patch.hours = h;
        else no('the hours');
        break;
      }
      case 'recruitment': {
        const r = oneOf(v, ['vacancy', 'roster', 'proposal'] as const);
        if (r) patch.recruitment = r;
        else no('the kind of recruitment');
        break;
      }
      case 'subjectToFunding':
      case 'keyPersonnel':
        if (typeof v === 'boolean') patch[k] = v;
        else no(k === 'keyPersonnel' ? 'key personnel' : 'subject to funding');
        break;
      case 'grade': {
        const g = str(v, 12);
        if (g && /^[\p{L}\p{N} .-]+$/u.test(g)) patch.grade = g.toUpperCase().replace(/^([PDG])-(\d)$/, '$1$2');
        else no('the grade');
        break;
      }
      case 'deadline': {
        const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
        const [y, m, day] = d.split('-').map(Number);
        const real = d && new Date(y, m - 1, day).getDate() === day && new Date(y, m - 1, day).getMonth() === m - 1;
        const days = real ? daysUntil(today, d) : NaN;
        if (real && days >= 0 && days <= 366) patch.deadline = d;
        else no('the closing date');
        break;
      }
      case 'closingTime': {
        const t = typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;
        if (t) patch.closingTime = t;
        else no('the closing time');
        break;
      }
      case 'salaryMode': {
        const s = oneOf(v, ['range', 'exact', 'scale', 'grade', 'competitive', 'daily', 'hidden'] as const);
        if (s) patch.salaryMode = s;
        else no('how pay is shown');
        break;
      }
      case 'salaryMin':
      case 'salaryMax': {
        const n = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
        if (/^\d[\d,.]{0,11}k?$/i.test(n)) patch[k] = n;
        else no('the salary');
        break;
      }
      case 'currency': {
        const c = typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? v : null;
        if (c) patch.currency = c;
        else no('the currency');
        break;
      }
      case 'period': {
        const p = oneOf(v, ['hour', 'day', 'month', 'year'] as const);
        if (p) patch.period = p;
        else no('the pay period');
        break;
      }
      case 'languages': {
        const list = Array.isArray(v) ? v.map((x) => LANGUAGES.find((l) => typeof x === 'string' && l.toLowerCase() === x.trim().toLowerCase())) : [];
        if (list.length && list.length <= 6 && list.every(Boolean)) patch.languages = Array.from(new Set(list as string[]));
        else no('the languages');
        break;
      }
      case 'eligibility': {
        const e = oneOf(v, ['anyone', 'nationals', 'internal', 'righttowork'] as const);
        if (e) patch.eligibility = e;
        else no('who can apply');
        break;
      }
      case 'safeguarding': {
        const s = oneOf(v, ['', 'low', 'medium', 'high'] as const);
        if (s !== null) patch.safeguarding = s;
        else no('the safeguarding level');
        break;
      }
      case 'positions':
      case 'directReports': {
        const n = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
        if (/^\d{1,3}$/.test(n) || (k === 'directReports' && /^none$/i.test(n))) patch[k] = n.toLowerCase();
        else no(k === 'positions' ? 'the number of positions' : 'the direct reports');
        break;
      }
      case 'duration':
      case 'startDate':
      case 'availability': {
        const t = str(v, 60);
        if (t) patch[k] = t;
        else no(`the ${k === 'startDate' ? 'start date' : k}`);
        break;
      }
      case 'donor':
      case 'client': {
        const t = str(v, 80);
        if (t) patch[k] = t;
        else no(`the ${k}`);
        break;
      }
      default:
        no(`"${k}"`);
    }
  }
  const engagement = patch.engagement ?? job.facts.engagement;
  if ('contract' in f) {
    const want = typeof f.contract === 'string' ? f.contract.trim().toLowerCase() : '';
    const hit = want ? CONTRACTS[engagement].find((c) => c.toLowerCase() === want || c.toLowerCase().startsWith(want)) : undefined;
    if (hit) patch.contract = hit;
    else no('the contract');
  }
  if (patch.engagement && !patch.contract && !CONTRACTS[engagement].includes(job.facts.contract)) patch.contract = CONTRACTS[engagement][0];
  if ((patch.salaryMin || patch.salaryMax) && !(patch.currency ?? job.facts.currency)) {
    delete patch.salaryMin;
    delete patch.salaryMax;
    no('the salary, without its currency');
  }
  if ((patch.salaryMin || patch.salaryMax) && !patch.salaryMode) patch.salaryMode = patch.salaryMax ? 'range' : 'exact';
  return { patch, refused };
}

/** "2,500" and "2500" as the same number. */
const plainNumbers = (t: string) => t.replace(/(\d)[,.\s](?=\d{3}\b)/g, '$1');

/** Everything the job, the organisation, and the user already say, which a written section may quote; `said`: the message being answered. */
function known(s: State, job: DemoJob, said = ''): string {
  return [JSON.stringify(job.facts), JSON.stringify(job.apply), s.org.website, s.org.careersUrl, s.org.domain, s.org.about, ...job.chat.filter((m) => m.from === 'user').map((m) => m.text), said].join(' ').toLowerCase();
}

/** A written section's lines, cleaned, or the reason it is refused. */
export function checkLines(raw: unknown, key: string, s: State, job: DemoJob, said = ''): { lines: string[] } | { refused: string } {
  const label = job.sections.find((x) => x.key === key)?.title ?? SECTION_BY_KEY[key]?.label ?? key;
  if (!Array.isArray(raw)) return { refused: `${label}: no text` };
  const headings = [label, SECTION_BY_KEY[key]?.label ?? key].map((h) => h.toLowerCase());
  const lines = raw
    .filter((l): l is string => typeof l === 'string')
    .map((l) => l.replace(/^\s*(?:[•*–]|-)\s+/, '- ').replace(/^#+\s*/, '').replace(/[\u2010-\u2013\u2011]/g, '-').replace(/\u00a0/g, ' ').trimEnd())
    .filter((l) => l.trim() && !headings.includes(l.trim().replace(/[:*]+$/, '').replace(/^\*+/, '').toLowerCase()));
  if (!lines.length || lines.length > 60 || lines.some((l) => l.length > 2000)) return { refused: `${label}: not usable text` };
  const text = lines.join('\n');
  const facts = plainNumbers(known(s, job, said));
  const pay = (text.match(PAY) ?? []).filter((m) => !facts.includes(plainNumbers(m).match(/\d+/)?.[0] ?? '\u0000'));
  if (pay.length) return { refused: `${label}: it named pay that was not given (${pay[0]})` };
  const contact = (text.match(CONTACT) ?? []).filter((m) => !facts.includes(m.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')));
  if (contact.length) return { refused: `${label}: it named a contact that was not given (${contact[0]})` };
  return { lines };
}

export type Applied = { refused: string[]; opened: OpenTarget[] };

/**
 * Carries out one AI turn on a job: each action checked against the job as it stands at that point, in a fixed order (undo, facts, the
 * template, the style, the outline, the text, then what to open), and the conversation gets the message and the AI's reply. `said` is
 * null for the reply to the first message, and empty when the window asked the AI to go on by itself (to write the next section). `open`
 * brings a part, a panel, or a dialog into view in the window.
 */
export function applyAiTurn(id: string, said: string | null, turn: AiTurn, open: (t: OpenTarget) => void, by?: string): Applied {
  const refused: string[] = [];
  const opened: OpenTarget[] = [];
  const job = () => getState().jobs.find((j) => j.id === id);
  const start = job();
  if (!start) return { refused: ['the job is gone'], opened };
  const firstUser = start.chat.findIndex((m) => m.from === 'user');
  const valid = turn.actions.filter((a): a is Raw => Boolean(a) && typeof a === 'object' && !Array.isArray(a));
  const actions = valid.filter((a) => ORDER.includes(String(a.type))).sort((a, b) => ORDER.indexOf(String(a.type)) - ORDER.indexOf(String(b.type)));
  for (const a of valid) if (!ORDER.includes(String(a.type))) refused.push(`an action the demo does not have ("${String(a.type).slice(0, 30)}")`);
  const writes: Array<{ key: string; lines: string[] }> = [];
  const note = said ? said.slice(0, 60) : 'Written by AidJobs';
  let ask: { fact?: ChatMsg['ask']; quick?: string[] } = {};
  for (const a of actions) {
    // The text is written before anything that follows it in the order, so a section written and approved in one answer is approved as written.
    if (writes.length && ORDER.indexOf(String(a.type)) > ORDER.indexOf('write_section')) writeSections(id, writes.splice(0), note);
    const s = getState();
    const j = job();
    if (!j) break;
    const section = typeof a.section === 'string' ? a.section : '';
    const format = s.formats.find((f) => f.key === j.format) ?? s.formats[0];
    const name = j.sections.find((x) => x.key === section)?.title ?? j.renamed?.[section] ?? (SECTION_BY_KEY[section] ? headingFor(section, format) : section);
    switch (a.type) {
      case 'undo':
        if (j.lastChange) undoLastChange(id);
        else refused.push('undo: there is no change to undo');
        break;
      case 'set_facts': {
        const { patch, refused: no } = checkFacts(a.facts, j, s.today);
        refused.push(...no);
        if (Object.keys(patch).length) setFactsFromChat(id, patch);
        break;
      }
      case 'use_template': {
        const key = typeof a.template === 'string' ? a.template : '';
        if (!s.formats.some((f) => f.key === key && !f.key.startsWith('pasted-'))) refused.push('a template the demo does not have');
        else if (j.setup) applyTemplate(id, key);
        else if (j.format !== key) applyFormat(id, key);
        break;
      }
      case 'set_style': {
        const style = Array.isArray(a.style) ? STYLES.filter((x) => (a.style as unknown[]).some((y) => typeof y === 'string' && y.toLowerCase() === x.toLowerCase())) : [];
        if (!style.length) refused.push('the writing style');
        else if (j.setup === 'template') refused.push('the writing style, before the template');
        else if (j.setup === 'style') chooseStyle(id, style);
        else setStyle(id, style);
        break;
      }
      case 'keep_style':
        if (a.all === true && j.style) keepStyleForAll(id);
        break;
      case 'add_section':
        if (!SECTION_BY_KEY[section]) refused.push(`a section the demo does not have ("${section.slice(0, 30)}")`);
        else if (!j.tags.includes(section)) toggleSection(id, section);
        break;
      case 'remove_section':
        if (!j.tags.includes(section) || j.tags.length < 2) refused.push(`removing ${name || 'a section'}`);
        else toggleSection(id, section);
        break;
      case 'reorder_sections': {
        const order = Array.isArray(a.order) ? a.order.filter((k): k is string => typeof k === 'string') : [];
        if (order.length < 2 || new Set(order).size !== order.length || !order.every((k) => j.tags.includes(k))) refused.push('the new order');
        else reorderSections(id, order);
        break;
      }
      case 'rename_section': {
        const heading = str(a.heading, 60);
        if (!heading || !j.tags.includes(section) || j.setup) refused.push(`renaming ${name || 'a section'}`);
        else renameSection(id, section, heading);
        break;
      }
      case 'write_section': {
        if (j.setup) refused.push(`${name}: written before the template and style are chosen`);
        else if (!j.tags.includes(section)) refused.push(`${name || 'a section'}: not in this job`);
        else if (FIXED_SECTIONS.includes(section)) refused.push(`${name}: written from your settings`);
        else {
          const out = checkLines(a.lines, section, s, j, said ?? '');
          if ('refused' in out) refused.push(out.refused);
          else writes.push({ key: section, lines: out.lines });
        }
        break;
      }
      case 'open': {
        const t = typeof a.target === 'string' ? a.target : '';
        const ok = (OPEN_TARGETS as readonly string[]).includes(t) || (t.startsWith('section:') && j.tags.includes(t.slice(8)));
        if (ok && !opened.length) opened.push(t as OpenTarget);
        else if (!ok) refused.push(`opening "${t.slice(0, 30)}"`);
        break;
      }
      case 'set_pace': {
        const pace = oneOf(a.pace, ['step', 'all'] as const);
        if (!pace || !j.walk) refused.push('the pace');
        else if (j.setup === 'template') refused.push('the pace, before the template');
        else setPace(id, pace);
        break;
      }
      case 'approve_section':
        if (!j.walk || !j.tags.includes(section) || !isWritten(j, section)) refused.push(`approving ${name || 'a section'}: it is not written yet`);
        else approveSection(id, section);
        break;
      case 'settle': {
        const what = typeof a.fact === 'string' ? a.fact : '';
        if (!j.walk || !([...DECLINABLE, ...LEFT] as string[]).includes(what)) refused.push(`settling "${what.slice(0, 30)}"`);
        else settleQuestion(id, what);
        break;
      }
      case 'set_apply': {
        const method = oneOf(a.method, METHODS);
        const address = a.address === undefined ? undefined : str(a.address, 120);
        const given = address ? known(s, j, said ?? '').includes(address.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')) : true;
        if (!method) refused.push('the way to apply');
        else if (a.address !== undefined && (!address || !given)) refused.push('an application address that was not given');
        else {
          setApply(id, { method, ...(address ? { address } : {}) });
          settleQuestion(id, 'method');
        }
        break;
      }
      case 'fixed_text': {
        const keys = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []);
        const valid = (k: string) => COMMITMENTS.some((c) => c.key === k) && (k !== 'mds' || s.org.mdsMember);
        const remove = keys(a.remove);
        const add = keys(a.add);
        if ([...remove, ...add].some((k) => !valid(k))) refused.push('a fixed text the organisation does not have');
        else {
          for (const k of remove) if (j.commitments.includes(k)) toggleCommitment(id, k);
          for (const k of add) if (!job()?.commitments.includes(k)) toggleCommitment(id, k);
        }
        break;
      }
      case 'leave_point': {
        const point = checkPoints(j, s).find((p) => p.key === a.point);
        if (!point) refused.push('leaving a check point that is not open');
        else leavePoint(id, point.key);
        break;
      }
      case 'accept_point': {
        const point = checkPoints(j, s).find((p) => p.key === a.point);
        const reason = str(a.reason, 200);
        if (!point?.hit || !reason || reason.length < 5) refused.push('keeping wording as a genuine requirement, without its reason');
        else acceptPoint(id, point.key, point.hit, reason);
        break;
      }
      case 'confirm_change':
        if (!j.walk?.pending || typeof a.apply !== 'boolean') refused.push('the changed lines');
        else confirmChange(id, a.apply);
        break;
      case 'ask': {
        const fact = oneOf(a.fact, ASKS);
        const quick = Array.isArray(a.quick) ? a.quick.filter((q): q is string => typeof q === 'string' && q.trim().length > 0 && q.length <= 60 && !/[\n\r]/.test(q)).slice(0, 6) : [];
        const unanswered = (k: AskKind) => (j.walk ? !isSettled(k, j) : (missingFacts(j.facts) as AskKind[]).includes(k));
        ask = { fact: fact && unanswered(fact) ? fact : undefined, quick: quick.length ? quick : undefined };
        break;
      }
    }
  }
  if (writes.length) writeSections(id, writes, note);
  const now = job();
  if (!now) return { refused, opened };
  const before = said === null ? now.chat.slice(0, firstUser + 1) : start.chat;
  const notDone = refused.length ? `\n\nNot done: ${refused.slice(0, 3).join('; ')}.` : '';
  const asks = /\?\s*$/.test(turn.reply);
  // A reply that asks a question stands for the step the job is now at, so the rules do not ask it again.
  const step = asks && now.walk ? stepKey(nextStep(now, getState())) : undefined;
  aiExchange(id, before, said, { text: `${turn.reply.trim() || 'Done.'}${notDone}`, quick: ask.quick, ask: ask.fact, by, step }, !asks);
  for (const t of opened) open(t);
  return { refused, opened };
}
