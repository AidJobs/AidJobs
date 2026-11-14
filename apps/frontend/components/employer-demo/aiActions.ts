'use client';

import {
  acceptPoint,
  aiExchange,
  applyOrgSdgs,
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
  toggleSection,
  undoLastChange,
  writeSections,
  addTranslation,
  addVersionSection,
  applyFix,
  chooseBlock,
  keepForAll,
  keepTranslation,
  leaveAmplifyPoint,
  refreshTranslation,
  removeTranslation,
  removeVersionSection,
  reviewTranslation,
  scheduleBlock,
  setChoice,
  setJobLang,
  setPayWith,
  setPublishOn,
  setReachPlan,
  startAsUsual,
  startFromProfile,
  writeVersionSection,
  changeSub,
  headingOf,
  isApprovalReply,
  groupingOf,
  outlineOp,
  bringBackFixed,
  editFixed,
  leaveOutFixed,
  translateFixed,
  followLinks,
} from './actions';
import { GROUP_KEYS, groupOfKey, KEPT } from './outline';
import { canWord, fixedLabel, isLocked, ORG_LANG, orgWording } from './fixed';
import { approvalRequired } from './approval';
import { checkSuggestion, offerSuggestion, showPageDraft } from './context';
import { pageFor } from './pageMemory';
import { canAmplifyFree } from './plans';
import { profileFor } from './profiles';
import { COMMITMENTS, CONTRACTS, daysUntil, extractFacts, headingFor, LANGUAGES, SECTION_BY_KEY, emptyFacts } from './engine';
import { amplifying, ASKS, asksOf, checkPoints, DECLINABLE, FIXED_SECTIONS, fullPoints, isSettled, isWritten, keepToOffer, LATER, LEFT, marketPoints, nextStep, reachOpen, stepKey } from './flow';
import { planFor } from './invites';
import { isPublished, STATE_LABEL, stateActionsOf, type StateAction } from './lifecycle';
import { sdgsOf, STYLES, usualTemplate } from './setup';
import { getState } from './store';
import { jobLang, langOf } from './translate';
import type { AskKind, ChatMsg, DemoJob, Engagement, Facts, JobLang, Message, ReachPlan, State } from './types';

const LANG_KEYS: JobLang[] = ['en', 'fr', 'ar', 'es', 'pt'];
const EMAIL = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/;

/** An address or link given whole in the text, not as part of a longer one ("data@x.org" is not in "maria.data@x.org"). */
function givenWhole(text: string, token: string): boolean {
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w.+-])${esc}(?![\\w/-]|\\.[\\w-])`).test(text);
}

/**
 * The Reach invitations from a reach action: only addresses the user gave, team emails only on the organisation's own domain (the
 * rules drop others too), and the two messages checked like any text the AI writes: no pay or contacts nobody gave.
 */
function reachIn(a: Record<string, unknown>, s: State, j: DemoJob, said: string): { plan: ReachPlan } | { refused: string } {
  const base = j.reachPlan ?? planFor(j, s.org);
  const given = known(s, j, said);
  const list = (v: unknown, current: string[]): string[] | null => {
    if (v === undefined) return current;
    if (!Array.isArray(v) || v.length > 50) return null;
    const out = v.filter((e): e is string => typeof e === 'string').map((e) => e.trim().toLowerCase());
    return out.every((e) => EMAIL.test(e) && givenWhole(given, e)) ? Array.from(new Set(out)) : null;
  };
  const candidates = list(a.candidates, base.candidates);
  const team = list(a.team, base.team);
  if (!candidates || !team) return { refused: 'email addresses that were not given' };
  if (team.some((e) => !e.endsWith(`@${s.org.domain}`))) return { refused: `team emails outside @${s.org.domain}` };
  const message = (v: unknown, current: Message, label: string): Message | string => {
    if (v === undefined) return current;
    if (!v || typeof v !== 'object') return `the ${label}`;
    const m = v as Record<string, unknown>;
    const next = { subject: typeof m.subject === 'string' ? m.subject.slice(0, 160) : current.subject, body: typeof m.body === 'string' ? m.body.slice(0, 2000) : current.body, closing: typeof m.closing === 'string' ? m.closing.slice(0, 600) : current.closing };
    const out = checkLines([next.subject, ...next.body.split('\n'), ...next.closing.split('\n')].filter((l) => l.trim()), 'about', s, j, said);
    return 'refused' in out ? `the ${label}: ${out.refused.replace(/^[^:]+: /, '')}` : next;
  };
  const candidateMsg = message(a.candidateMessage, base.candidateMsg, 'invitation');
  const teamMsg = message(a.teamMessage, base.teamMsg, 'team email');
  if (typeof candidateMsg === 'string') return { refused: candidateMsg };
  if (typeof teamMsg === 'string') return { refused: teamMsg };
  return { plan: { candidates, team, candidateMsg, teamMsg } };
}

export { FIXED_SECTIONS };

/**
 * The demo's side of the AI chat (employer-side plan, section 19, "The AI chat in the demo"): the AI understands and writes; the demo
 * checks each action it returns against the job and carries it out with its existing functions, so dates, prices, the fixed text, the
 * checks, and the free and paid rules stay exact. Anything unknown or unsafe is refused, and the reply says what was not done.
 */
export const OPEN_TARGETS = ['outline', 'templates', 'own', 'details', 'fixed', 'check', 'plan', 'market', 'full', 'langs', 'flyer', 'reach', 'review', 'payment', 'publish', 'preview', 'versions', 'download', 'delete'] as const;
/** The dialogs of section 17's actions (section 19, phase 4): the AI may open one the job's state allows, never act on its own. */
export const STATE_DIALOGS: Record<string, StateAction> = { publish_now: 'publishNow', reschedule: 'reschedule', back_to_draft: 'backToDraft', extend: 'extend', share: 'share', filled: 'filled', withdraw: 'withdraw', reopen: 'reopen' };
export type OpenTarget = (typeof OPEN_TARGETS)[number] | 'publish_now' | 'reschedule' | 'back_to_draft' | 'extend' | 'share' | 'filled' | 'withdraw' | 'reopen' | `section:${string}` | `lang:${string}`;
const CARDS = ['plan', 'publish', 'review', 'live', 'state', 'website', 'project', 'social'] as const;
const PACKAGE_KEYS = ['one', 'three', 'five', 'always'] as const;

const ENGAGEMENT_KEYS: Engagement[] = ['job', 'consultancy', 'internship', 'volunteer'];
const ORDER = [
  'undo',
  'confirm_change',
  'set_facts',
  'set_apply',
  'settle',
  'use_profile',
  'start',
  'use_template',
  'set_style',
  'keep_style',
  'set_pace',
  'add_section',
  'remove_section',
  'reorder_sections',
  'move_section',
  'move_group',
  'rename_section',
  'write_section',
  'sub',
  'approve_section',
  'fixed_text',
  'use_org_sdgs',
  'leave_point',
  'accept_point',
  'keep',
  'set_language',
  'choose_plan',
  'pay_with',
  'publish_on',
  'fix_point',
  'leave_amplify_point',
  'add_language',
  'remove_language',
  'version_sections',
  'write_version_section',
  'update_version',
  'review_version',
  'reach',
  'page_draft',
  'suggest_fact',
  'open',
  'show',
  'ask',
];
const METHODS = ['system', 'email', 'form', 'formOnly'] as const;

/** The user asked to move or reorder something, so the AI may move a section across groups: a verb of moving, not a word like "first". */
export const MOVE_ASKED = /\b(?:move|moving|put|place|swap|switch|reorder|re-order|rearrange)\b|\b(?:come|go|goes|be|sit)s? (?:first|last|before|after|above|below|earlier|later|at the (?:top|bottom|end|start))\b/i;

/** The user approved every section at once: "approve the rest", "all of them are good", not "all good" about one section. */
export const ALL_ASKED = /\bapprove (?:them )?all\b|\bapprove (?:the rest|everything|every section|both|all (?:of them|the sections|sections))\b|\b(?:all (?:of them|the sections|sections)|the rest|everything|every section|both) (?:is |are |looks? )?(?:good|fine|ok|okay|approved)\b/i;

/** Words that name a later question, so the user's own answer to it ahead of time can settle it. */
const SETTLE_WORDS: Record<string, RegExp> = {
  details: /\b(position|direct report|start|donor|details?)\b/i,
  sdgs: /\b(sdgs?|goals?)\b/i,
  fixed: /\b(fixed text|safeguarding|psea|commitments?|misconduct|equal opportunit)/i,
  suggest: /\b(suggest|sections?)\b/i,
  market: /\bmarket\b/i,
  full: /\b(full|advert) check\b/i,
  langs: /\b(languages?|translat|versions?|french|arabic|spanish|portuguese|english)\b/i,
  review: /\breview/i,
  reach: /\b(reach|invit)/i,
  flyer: /\bflyer\b/i,
  again: /\b(nothing else|no other changes?|same as before)\b/i,
  grade: /\b(grade|band|level|scale)\b/i,
  eligibility: /\b(eligib\w*|who can apply|anyone|nationals?|right to work|internal)\b/i,
  languages: /\b(languages?|french|arabic|spanish|portuguese|english|swahili)\b/i,
  safeguarding: /\bsafeguard/i,
  salary: /\b(pay|salary|salaries|wage|remuneration|range)\b/i,
  method: /\b(apply|application|careers? (?:site|page)|e-?mail|form)\b/i,
};

/**
 * Whether the AI's question is not the one the window is on (section 19, phase 5: the open question): a fact asked other than the one
 * open, or, at an approve step, a reply that does not name the section being approved. The rules then ask the open question again.
 */
export function asksAhead(reply: string, askFact: AskKind | undefined, want: ReturnType<typeof nextStep>, heading: string, wrote: string[] = []): boolean {
  if (!want) return false;
  if (want.kind === 'ask') return askFact ? askFact !== want.fact : !FACT_WORDS[want.fact].test(reply);
  // A reply in the turn that wrote the section being approved is about that section.
  if (want.kind === 'approve') return Boolean(askFact) || (!wrote.includes(want.section) && !reply.toLowerCase().includes(heading.toLowerCase()));
  // Any later step (round 7 review): a question that names a step still to come, and nothing of the one open, asks ahead.
  const now = want.kind === 'version' ? 'langs' : want.kind === 'waiting' ? 'review' : want.kind;
  const at = STEP_ORDER.indexOf(now);
  if (at < 0) return false;
  if (askFact) return true;
  if (STEP_WORDS[now]?.test(reply)) return false;
  return STEP_ORDER.slice(at + 1).some((k) => STEP_WORDS[k]?.test(reply));
}

/** The window's steps after the sections, in order, and the words that name each in a reply. */
const STEP_ORDER = ['details', 'sdgs', 'fixed', 'keep', 'suggest', 'check', 'plan', 'market', 'full', 'langs', 'review', 'reach', 'flyer', 'publish'];
const STEP_WORDS: Record<string, RegExp> = {
  details: SETTLE_WORDS.details,
  sdgs: SETTLE_WORDS.sdgs,
  fixed: SETTLE_WORDS.fixed,
  keep: /\b(every (?:new )?job|for every|keep (?:it|them|these|this))\b/i,
  suggest: /\b(suggest\w*|more sections?|add (?:a |any )?sections?)\b/i,
  check: /\b(check|fill (?:it )?in|placeholder|still to fill)\b/i,
  plan: /\b(free|amplify|plan)\b/i,
  market: SETTLE_WORDS.market,
  full: SETTLE_WORDS.full,
  langs: SETTLE_WORDS.langs,
  review: SETTLE_WORDS.review,
  reach: SETTLE_WORDS.reach,
  flyer: /\b(flyer|notice boards?|qr code)\b/i,
  publish: /\b(publish|go(?:es)? live|schedul\w*)\b/i,
};

const FACT_WORDS: Record<AskKind, RegExp> = {
  title: /\btitle\b/i,
  place: /\b(based|where|duty station|location|city|place)\b/i,
  contract: /\b(contract|fixed-term|permanent|consultan)/i,
  grade: /\bgrade\b/i,
  eligibility: /\b(who can apply|eligib|nationals|right to work|anyone)\b/i,
  languages: /\blanguages?\b/i,
  safeguarding: /\bsafeguard/i,
  salary: /\b(pay|salary|range)\b/i,
  deadline: /\b(clos|deadline|applications? close)/i,
  method: /\b(apply|application|careers site|email|form)\b/i,
};

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
  // What the user gave, and what they accepted (section 19, phase 5, A): the About us and project text, and accepted suggestions.
  const pack = [job.pack?.about?.text ?? '', job.pack?.project?.text ?? '', ...(job.pack?.facts ?? []).map((f) => f.value)];
  return [JSON.stringify(job.facts), JSON.stringify(job.apply), s.org.website, s.org.careersUrl, s.org.domain, s.org.about, ...pack, ...job.chat.filter((m) => m.from === 'user').map((m) => m.text), said].join(' ').toLowerCase();
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
export function applyAiTurn(id: string, said: string | null, turn: AiTurn, open: (t: OpenTarget) => void, by?: string, inVersionTab?: JobLang, fromPage?: boolean, carrying?: boolean): Applied {
  const inVersion = inVersionTab && getState().jobs.find((j) => j.id === id)?.translations?.[inVersionTab] ? inVersionTab : undefined;
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
  const wrote: string[] = [];
  const note = said ? said.slice(0, 60) : 'Written by AidJobs';
  let ask: { fact?: ChatMsg['ask']; quick?: string[] } = {};
  let card: ChatMsg['card'];
  for (const a of actions) {
    // A turn that read an outside page may only draft from it: the page's text never changes the job by itself (section 19, phase 5, A).
    if (fromPage && a.type !== 'page_draft') {
      refused.push(`${String(a.type).replace(/_/g, ' ')}: a page is used only for its draft`);
      continue;
    }
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
        // A fact given answers its question even when it is the default ("anyone can apply").
        if (j.walk) for (const k of asksOf(Object.keys(patch))) settleQuestion(id, k);
        break;
      }
      case 'use_profile': {
        const p = profileFor(s, j);
        if (j.setup !== 'template' || !p || a.profile !== p.id) refused.push('a saved job profile that is not offered for this job');
        else startFromProfile(id, p.id);
        break;
      }
      case 'start':
        if (j.setup !== 'template' || !usualTemplate(s, id)) refused.push('starting as usual: there is no usual template yet');
        else startAsUsual(id);
        break;
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
        if (a.all === true && s.org.styleKept) refused.push('keeping the style for every job: it is kept already, and changed only in Organisation settings');
        else if (a.all === true && j.style) keepStyleForAll(id);
        break;
      case 'add_section':
        if (!SECTION_BY_KEY[section]) refused.push(`a section the demo does not have ("${section.slice(0, 30)}")`);
        else if (inVersion) addVersionSection(id, inVersion, section);
        else if (section === 'languages' && ['langs', 'version'].includes(nextStep(j, s)?.kind ?? '')) refused.push('the Languages section: a language version is added by naming the language');
        else if (!j.tags.includes(section)) toggleSection(id, section);
        break;
      case 'remove_section':
        // How to apply is part of every job, by every route (section 19, phase 6, D).
        if (KEPT.includes(section)) refused.push(`removing ${name}: every job has it; change its text or method with the pencil`);
        else if (inVersion) removeVersionSection(id, inVersion, section);
        else if (!j.tags.includes(section) || j.tags.length < 2) refused.push(`removing ${name || 'a section'}`);
        else toggleSection(id, section);
        break;
      case 'reorder_sections': {
        // Within their groups only; a section goes into another group with move_section (section 19, phase 6, B).
        const order = Array.isArray(a.order) ? a.order.filter((k): k is string => typeof k === 'string') : [];
        if (order.length < 2 || new Set(order).size !== order.length || !order.every((k) => j.tags.includes(k))) refused.push('the new order');
        else reorderSections(id, order);
        break;
      }
      case 'move_section': {
        const group = oneOf(a.group, GROUP_KEYS);
        const after = a.after === null || a.after === undefined ? null : typeof a.after === 'string' && j.tags.includes(a.after) ? a.after : undefined;
        if (!j.tags.includes(section) || !group || after === undefined || (after && groupOfKey(groupingOf(j), after) !== group)) refused.push(`moving ${name || 'a section'}`);
        else if (!MOVE_ASKED.test(said ?? '')) refused.push('moving a section into another group: only when you ask for it');
        else if (after) outlineOp(id, { op: 'drop', key: section, after, group });
        else outlineOp(id, { op: 'toGroup', key: section, group });
        break;
      }
      case 'move_group': {
        const group = oneOf(a.group, GROUP_KEYS);
        const before = a.before === null || a.before === undefined ? null : oneOf(a.before, GROUP_KEYS);
        if (!group || before === undefined || (a.before !== null && a.before !== undefined && !before)) refused.push('moving a group');
        else if (!MOVE_ASKED.test(said ?? '')) refused.push('moving a group: only when you ask for it');
        else outlineOp(id, { op: 'groupBefore', group, before });
        break;
      }
      case 'sub': {
        const op = oneOf(a.op, ['add', 'rename', 'write', 'remove'] as const);
        const sec = j.sections.find((x) => x.key === section);
        const want = typeof a.sub === 'string' ? a.sub.toLowerCase() : '';
        const sub = sec?.subs?.find((x) => x.id === a.sub || x.title.toLowerCase() === want);
        if (!op || !sec || !isWritten(j, section)) refused.push(`a sub-section of ${name || 'a section'}: it is not written yet`);
        else if (op === 'add') {
          const heading = str(a.heading, 60);
          if (!heading) refused.push('a sub-section without a heading');
          else changeSub(id, section, { add: heading });
        } else if (!sub) refused.push(`a sub-section ${name} does not have`);
        else if (op === 'remove') changeSub(id, section, { remove: sub.id });
        else if (op === 'rename') {
          const heading = str(a.heading, 60);
          if (!heading) refused.push('renaming a sub-section');
          else changeSub(id, section, { rename: sub.id, title: heading });
        } else {
          const out = checkLines(a.lines, section, s, j, said ?? '');
          if ('refused' in out) refused.push(out.refused);
          else changeSub(id, section, { write: sub.id, lines: out.lines });
        }
        break;
      }
      case 'rename_section': {
        const heading = str(a.heading, 60);
        if (!heading || !j.tags.includes(section) || j.setup) refused.push(`renaming ${name || 'a section'}`);
        else renameSection(id, section, heading);
        break;
      }
      case 'write_section': {
        if (inVersion) {
          // With a language version's tab open, the discussion is about that version (section 19): its own sections are written.
          // A version's About us and How to apply are translations of the organisation's own text, checked like any other line.
          const out = checkLines(a.lines, section, s, j, said ?? '');
          if (!SECTION_BY_KEY[section]) refused.push(`${name || 'a section'}: not one the version can have written`);
          else if ('refused' in out) refused.push(out.refused);
          else {
            if (!getState().jobs.find((x) => x.id === id)?.translations?.[inVersion]?.sections.some((x) => x.key === section)) addVersionSection(id, inVersion, section);
            writeVersionSection(id, inVersion, section, out.lines);
          }
        } else if (j.setup) refused.push(`${name}: written before the template and style are chosen`);
        else if (!j.tags.includes(section)) refused.push(`${name || 'a section'}: not in this job`);
        else if (FIXED_SECTIONS.includes(section)) refused.push(`${name}: written from your settings`);
        // "Good" approves the section and adds nothing (section 19, phase 5): no text goes into the section being approved.
        else if (said && isApprovalReply(said) && (() => { const on = nextStep(j, s); return on?.kind === 'approve' && on.section === section; })()) refused.push(`${name}: you approved it as it is, so nothing was added`);
        else {
          const out = checkLines(a.lines, section, s, j, said ?? '');
          if ('refused' in out) refused.push(out.refused);
          else {
            writes.push({ key: section, lines: out.lines });
            wrote.push(section);
          }
        }
        break;
      }
      case 'open': {
        const t = typeof a.target === 'string' ? a.target : '';
        const dialog = STATE_DIALOGS[t];
        if (dialog && !stateActionsOf(s, j).includes(dialog)) {
          refused.push(`${STATE_LABEL[dialog].toLowerCase()}: not for a job that is ${j.status === 'review' ? 'in review' : j.status}`);
          break;
        }
        const ok = Boolean(dialog) || (OPEN_TARGETS as readonly string[]).includes(t) || (t.startsWith('section:') && j.tags.includes(t.slice(8))) || (t.startsWith('lang:') && Boolean(j.translations?.[t.slice(5) as JobLang]));
        if ((t === 'reach' || t === 'flyer') && !reachOpen(j, s)) refused.push(`the ${t === 'reach' ? 'Reach invitations' : 'flyer'}: ${amplifying(j) ? 'they open once review is done' : 'they come only with Amplify'}`);
        else if (ok && !opened.length) opened.push(t as OpenTarget);
        else if (!ok) refused.push(`opening "${t.slice(0, 30)}"`);
        break;
      }
      case 'show': {
        // Publishing, paying, and sending happen only from the card's own button, which states the whole outcome.
        const c = oneOf(a.card, CARDS);
        if (!c) refused.push('a card the window does not have');
        else card = c;
        break;
      }
      case 'keep': {
        const what = oneOf(a.what, ['fixed', 'apply'] as const);
        if (!what || typeof a.all !== 'boolean' || s.me.role !== 'owner') refused.push('keeping it for every job: only the owner can change what every job starts with');
        else if (keepToOffer(j, s) !== what) refused.push('keeping it for every job: it is offered once, at its step; afterwards it is changed only in Organisation settings');
        else keepForAll(id, what, a.all);
        break;
      }
      case 'set_language': {
        const l = oneOf(a.language, LANG_KEYS);
        if (!l) refused.push('the job’s language');
        else setJobLang(id, l);
        break;
      }
      case 'choose_plan': {
        const p = oneOf(a.plan, ['free', 'amplify'] as const);
        const no = p ? chooseBlock(s, j, p) : 'Free or Amplify';
        if (no || !p) refused.push(no ?? 'the plan');
        else setChoice(id, p);
        break;
      }
      case 'pay_with': {
        const k = oneOf(a.package, [...PACKAGE_KEYS, 'free'] as const);
        if (!k || j.paidFor || (isPublished(j) && j.plan !== 'free')) refused.push('how it is paid');
        else if (k === 'free' && !canAmplifyFree(s, j.id)) refused.push('the free Amplify: it is used, once per organisation');
        else setPayWith(id, k);
        break;
      }
      case 'publish_on': {
        const d = a.date === null ? null : typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : undefined;
        const no = d === undefined ? 'the date' : d && scheduleBlock(s, j, d);
        if (no) refused.push(`publishing on that date: ${no.toString().toLowerCase()}`);
        else setPublishOn(id, d ?? null);
        break;
      }
      case 'fix_point':
      case 'leave_amplify_point': {
        const kind = oneOf(a.check, ['market', 'full'] as const);
        const point = kind ? (kind === 'market' ? marketPoints(j, s) : fullPoints(j, s)).find((p) => p.key === a.point) : undefined;
        if (!kind || !point || j.choice !== 'amplify') refused.push('a check point that is not open');
        else if (a.type === 'leave_amplify_point') leaveAmplifyPoint(id, kind, point.key);
        else if (!point.fix) refused.push(`${point.title}: it has no one-tap fix`);
        else applyFix(id, point.fix.fix, point.fix.label);
        break;
      }
      case 'add_language':
      case 'remove_language':
      case 'review_version':
      case 'update_version': {
        const l = oneOf(a.language, LANG_KEYS);
        if (!l || l === jobLang(j)) refused.push('a language version in that language');
        else if (a.type === 'add_language') {
          if (j.choice !== 'amplify' && j.plan !== 'amplify') refused.push('a language version: they come with Amplify');
          else addTranslation(id, l);
        } else if (!j.translations?.[l]) refused.push(`the ${langOf(l).label} version: there is none`);
        else if (a.type === 'remove_language') removeTranslation(id, l);
        else if (a.type === 'review_version') reviewTranslation(id, l);
        else if (a.apply === true) refreshTranslation(id, l);
        else if (a.apply === false) keepTranslation(id, l);
        else refused.push('updating the version');
        break;
      }
      case 'version_sections': {
        const l = oneOf(a.language, LANG_KEYS);
        const t = l ? j.translations?.[l] : undefined;
        const keys = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []);
        if (!l || !t) refused.push('the sections of a version that does not exist');
        else {
          for (const k of keys(a.remove)) if (t.sections.some((x) => x.key === k)) removeVersionSection(id, l, k);
          for (const k of keys(a.add)) {
            if (!SECTION_BY_KEY[k] || FIXED_SECTIONS.includes(k)) refused.push(`a section the demo does not have ("${k.slice(0, 30)}")`);
            else addVersionSection(id, l, k);
          }
        }
        break;
      }
      case 'write_version_section': {
        const l = oneOf(a.language, LANG_KEYS);
        const t = l ? getState().jobs.find((x) => x.id === id)?.translations?.[l] : undefined;
        // As with a version's tab open: its About us and How to apply are translations, checked like any other line.
        if (!l || !t) refused.push('a version that does not exist');
        else if (!SECTION_BY_KEY[section]) refused.push(`a section the demo does not have ("${section.slice(0, 30)}")`);
        else {
          if (!t.sections.some((x) => x.key === section)) addVersionSection(id, l, section);
          const out = checkLines(a.lines, section, s, j, said ?? '');
          if ('refused' in out) refused.push(out.refused);
          else writeVersionSection(id, l, section, out.lines);
        }
        break;
      }
      case 'page_draft': {
        // A draft from the page the window is reading for this job, and nothing else: its numbers must be the page's own.
        const page = pageFor(id);
        const out = page ? checkLines(a.lines, page.kind === 'about' ? 'about' : 'background', s, j, `${said ?? ''} ${page.text}`) : null;
        if (!page || !out) refused.push('a draft from a page: no page is being read');
        else if ('refused' in out) refused.push(out.refused);
        else {
          const given = new Set(plainNumbers(page.text).match(/\d+/g) ?? []);
          const strange = (plainNumbers(out.lines.join(' ')).match(/\d+/g) ?? []).filter((n) => !given.has(n));
          if (strange.length) refused.push(`the draft: a number the page does not give (${strange[0]})`);
          else {
            showPageDraft(id, { kind: page.kind, lines: out.lines, used: str(a.used, 300) || 'The page.', missing: str(a.missing, 300) ?? '', source: page.source, social: page.social }, '');
            card = 'page';
          }
        }
        break;
      }
      case 'suggest_fact': {
        const sg = checkSuggestion(s, j, a);
        if (typeof sg === 'string') refused.push(sg);
        else {
          offerSuggestion(id, sg);
          card = 'suggest';
        }
        break;
      }
      case 'reach': {
        const plan = reachIn(a, s, j, said ?? '');
        if (!reachOpen(j, s)) refused.push(amplifying(j) ? 'Reach: it opens once review is done' : 'Reach: it comes only with Amplify');
        else if ('refused' in plan) refused.push(plan.refused);
        else setReachPlan(id, plan.plan);
        break;
      }
      case 'set_pace': {
        const pace = oneOf(a.pace, ['step', 'all'] as const);
        if (!pace || !j.walk) refused.push('the pace');
        else if (j.setup === 'template') refused.push('the pace, before the template');
        else setPace(id, pace);
        break;
      }
      case 'approve_section': {
        // Only the section the window is on, unless the user approved them all (section 19, phase 5: the open question).
        const on = nextStep(j, s);
        // A question left for later is answered whenever the user names it (section 19, phase 6, A).
        const parked = Boolean(j.walk?.parked?.includes(`approve:${section}`));
        if (!j.walk || !j.tags.includes(section) || !isWritten(j, section)) refused.push(`approving ${name || 'a section'}: it is not written yet`);
        else if (!(on?.kind === 'approve' && on.section === section) && !parked && !ALL_ASKED.test(said ?? '')) refused.push(`approving ${name}: the open question comes first`);
        else approveSection(id, section);
        break;
      }
      case 'settle': {
        const what = typeof a.fact === 'string' ? a.fact : '';
        const on = nextStep(j, s);
        const onKind = on?.kind === 'version' ? 'langs' : on?.kind === 'waiting' ? 'review' : on?.kind;
        // A declinable fact is open only while its own question is asked; any other step makes it "later" for this rule.
        const openFact = on?.kind === 'ask' ? on.fact : undefined;
        const later = ([...LEFT, ...LATER, 'again'] as string[]).includes(what) || ((DECLINABLE as string[]).includes(what) && what !== openFact);
        if (!j.walk || !([...DECLINABLE, ...LEFT, ...LATER, ...(j.walk.again ? ['again'] : [])] as string[]).includes(what) || what === 'plan' || (what === 'review' && approvalRequired(s, j))) refused.push(`settling "${what.slice(0, 30)}"${what === 'plan' ? ': Free or Amplify is settled by choosing one' : ''}`);
        // The AI may not settle a later question; only the user, by naming it, answers one early.
        else if (later && what !== onKind && !j.walk.parked?.includes(what) && !(SETTLE_WORDS[what] ?? /$^/).test(said ?? '')) refused.push(`settling "${what}": the open question comes first`);
        else settleQuestion(id, what);
        break;
      }
      case 'set_apply': {
        const method = oneOf(a.method, METHODS);
        const address = a.address === undefined ? undefined : str(a.address, 120);
        const given = address ? givenWhole(known(s, j, said ?? ''), address.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')) : true;
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
        const lang = a.language === undefined ? (inVersion ?? jobLang(j)) : oneOf(a.language, LANG_KEYS);
        const remove = keys(a.remove);
        const add = keys(a.add);
        const texts = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v as Raw).filter((e): e is [string, string] => typeof e[1] === 'string' && Boolean(e[1].trim()) && e[1].length <= 2000) : []);
        const word = texts(a.word);
        const translate = texts(a.translate);
        if (!lang || [...remove, ...add, ...word.map((w) => w[0]), ...translate.map((w) => w[0])].some((k) => !valid(k))) {
          refused.push('a fixed text the organisation does not have');
          break;
        }
        // A locked text stays on the job (section 19, phase 6, D); its wording is changed only in Organisation settings.
        const locked = remove.filter((k) => isLocked(s.org, k));
        if (locked.length) refused.push(`leaving out ${locked.map(fixedLabel).join(' and ')}: it is locked by your organisation`);
        for (const k of remove.filter((x) => !locked.includes(x))) leaveOutFixed(id, k, lang);
        for (const k of add) bringBackFixed(id, k, lang);
        // A wording for this job only with the words the user typed; the AI never rewrites a fixed text in the job's own language.
        for (const [k, text] of word) {
          if (!canWord(s.org, k, lang)) refused.push(`${fixedLabel(k)}: it is locked; change it for every job in Organisation settings`);
          else if (!(said ?? '').toLowerCase().includes(text.trim().toLowerCase().slice(0, 200))) refused.push(`${fixedLabel(k)}: a wording for this job needs your own words`);
          else editFixed(id, k, text, lang);
        }
        // Translated only where the organisation has no wording for that language, marked until approved.
        for (const [k, text] of translate) {
          if (lang === ORG_LANG || orgWording(s.org, k, lang)) refused.push(`${fixedLabel(k)}: your organisation has its wording in ${langOf(lang).label}`);
          else translateFixed(id, k, text, lang);
        }
        break;
      }
      case 'use_org_sdgs':
        if (!s.org.sdgs.length || sdgsOf(j).length) refused.push("the organisation's goals: the job already has goals, or the organisation has none");
        else applyOrgSdgs(id);
        break;
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
  // The AI's changes in the language in view follow into the languages linked to it (section 19, phase 6, F); a carry is the following.
  if (!carrying) followLinks(id, start, inVersion ?? jobLang(start));
  const now = job();
  if (!now) return { refused, opened };
  const before = said === null ? now.chat.slice(0, firstUser + 1) : start.chat;
  const notDone = refused.length ? `\n\nNot done: ${refused.slice(0, 3).join('; ')}.` : '';
  const asks = /\?/.test(turn.reply) || actions.some((a) => a.type === 'ask') || Boolean(card);
  // A reply that asks a question, or shows a card, stands for the step the job is now at, so the rules do not ask it again; unless it
  // asked about another step than the open one (section 19, phase 5), when the rules ask the open question after it.
  const want = now.walk ? nextStep(now, getState()) : null;
  const ahead = asks && !card && want ? asksAhead(turn.reply, ask.fact, want, want.kind === 'approve' ? headingOf(getState(), now, want.section) : '', wrote) : false;
  const step = asks && now.walk && !ahead ? stepKey(want) : undefined;
  aiExchange(id, before, said, { text: `${turn.reply.trim() || 'Done.'}${notDone}`, quick: ahead ? undefined : ask.quick, ask: ahead ? undefined : ask.fact, by, step, card }, !asks || ahead);
  for (const t of opened) open(t);
  return { refused, opened };
}
