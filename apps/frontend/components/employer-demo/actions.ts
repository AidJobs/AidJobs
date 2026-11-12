'use client';

import { applyLines, defaultApply } from './apply';
import { approvalRequired, approvedFor, isApproved, pausedByChanges } from './approval';
import {
  addDays,
  applyEdit,
  article,
  buildSection,
  buildSections,
  COMMITMENTS,
  roleByKey,
  SECTION_BY_KEY,
  daysUntil,
  detectRole,
  emptyFacts,
  ENGAGEMENTS,
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
import { addMonths, canGoFree, countedFor, currentMonth, EXTRA_JOB, freeLeft, LANGUAGE_PRICE, langsToPay, LISTED_DAYS, listingEnd, monthFor, monthName, nextPaidJob, packageOf, SUBSCRIPTION_JOBS, usd, viaFor, type PackageKey } from './plans';
import { workingDay, type Fix } from './market';
import { MARKET_SAMPLE } from './sample';
import { changeWithUndo, getState, go, nextId, notify, update, updateJob } from './store';
import { changeSummary, tellOffer } from './changes';
import { addRound, invitedCount, planFor, REACH_EMAILS, reachRoom, reachUsed } from './invites';
import { canReopen, isPublished } from './lifecycle';
import { detectLang, draftTranslation, draftVersionSection, headingIn, inLanguage, jobLang, keptTranslation, langOf, redraftTranslation, versionChoices, versionsOf } from './translate';
import { contentOf, describeStyle, proposedStyle, recommendation, styleFromReply, toneOf, TYPE_REASONS, wordsFor } from './setup';
import { aiWrites, asksOf, checkPoints, FIXED_SECTIONS, isSettled, isWritten, nextStep, stepKey } from './flow';
import { INVITE, KEEP_ALL, MARK_REVIEWED, NO_MORE_LANGS, NO_REVIEW, NOT_NOW, REMIND, SEND_REVIEW, SHOW_FLYER, THIS_JOB } from './walkChat';
import { ALL_GOOD, ASK_TEXT as WALK_ASK, CHANGE_NO, CHANGE_YES, CHOOSE_SDGS, fixedNamed, NO_SDGS, orgGoalsAnswer, GENUINE, GOOD, KEEP_FIXED, LEAVE_IT, NO_THANKS, NONE_OF_THESE, OTHER_WORDING, overview, paceIn, PACE_QUICK, promptFor, readAnswer, readDetails, STYLE_QUICK, styleQuestion } from './walkChat';
import type { ApplySettings, AskKind, ChatMsg, DeletedJob, Delivery, DemoJob, Facts, Format, JobLang, JobProfile, Pace, PayRequest, Person, Plan, ReachPlan, Recipient, Review, Section, State, Tone, Translation } from './types';

function msg(from: ChatMsg['from'], text: string, quick?: string[], ask?: ChatMsg['ask']): ChatMsg {
  return { id: `m${Math.random().toString(36).slice(2, 9)}`, from, text, quick, ask };
}

/** Fills the two fact slots the rules leave in text ("[Duty station]", "[Closing date]") once the fact is known. */
function fillSlots(l: string, f: Facts): string {
  return l.replace('[Duty station]', f.location || '[Duty station]').replace('[Closing date]', f.deadline ? longDate(f.deadline) : '[Closing date]');
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

/** A section written by the rules, in the job's own language (simulated in the demo by the table, like the language versions). */
function built(k: string, ctx: BuildContext, j: DemoJob): Section {
  return inLanguage(buildSection(k, ctx), ctx.facts, jobLang(j));
}

/** The rules' own English for a section they wrote, as the source of a version of a job in another language; null for text written by hand or by the AI. */
function englishFor(s: State, j: DemoJob): (sec: Section) => Section | null {
  const ctx = ctxFor(s, j);
  return (sec) => (sec.edited || sec.ai ? null : buildSection(sec.key, ctx));
}

/** Rebuilds every section not edited by hand, keeping the user's order and headings from the job's format. Placeholders in edited sections are filled once the fact is known. */
function rebuilt(s: State, j: DemoJob): DemoJob {
  if (!j.sections.length) return j;
  const ctx = ctxFor(s, j);
  const fill = (l: string) => fillSlots(l, j.facts);
  // A job written step by step has only the sections written so far; the others are written when they are reached.
  const keys = j.walk ? j.tags.filter((k) => j.sections.some((x) => x.key === k)) : j.tags;
  return { ...j, sections: keys.map((k) => {
    const own = j.sections.find((x) => x.key === k && (x.edited || x.ai));
    if (own) return { ...own, lines: own.lines.map(fill) };
    const sec = built(k, ctx, j);
    return j.renamed?.[k] ? { ...sec, title: j.renamed[k] } : sec;
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
    review: { ...j.review, state: j.review.state === 'none' ? 'none' : 'open', approvedVersion: undefined, skipped: undefined, overruled: undefined, reviewers: j.review.reviewers.map((r) => (r.decision === 'approved' ? { ...r, decision: undefined } : r)) },
  };
}

/** Any change to a job's content: reopens an approval, and the last chat change can no longer be undone on its own. */
function touched(j: DemoJob): DemoJob {
  return { ...reopenApproval(j), lastChange: undefined };
}

/** A change to a live job: the public page says "Updated", with the day. */
function liveEdit(j: DemoJob): Partial<DemoJob> {
  return j.status === 'live' ? { updatedAfterPublish: true, editedAt: Date.now() } : {};
}

/** Reviewers comment and decide; only the job's owner changes it. */
function ownerOnly(): boolean {
  return !getState().reviewerAs;
}

export { approvalRequired, approvedFor, isApproved, pausedByChanges };

/** The four facts the earlier workspace asks for, in order. */
type LegacyAsk = 'title' | 'place' | 'deadline' | 'contract';
const LEGACY_ASKS: AskKind[] = ['title', 'place', 'deadline', 'contract'];

const ASK_TEXT: Record<LegacyAsk, string> = {
  title: 'What is the job title?',
  place: 'Where is the job based?',
  deadline: 'When do applications close?',
  contract: 'What kind of contract is it?',
};

export function missingFacts(f: Facts): LegacyAsk[] {
  const out: LegacyAsk[] = [];
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
function answered(kind: AskKind, f: Facts): boolean {
  return kind === 'title' ? Boolean(f.title) : kind === 'place' ? Boolean(f.location) || f.arrangement === 'remote' : kind === 'deadline' ? Boolean(f.deadline) : Boolean(f.contract);
}

/**
 * Keeps a question open until it is answered: after any message, if a fact is still missing and no question is waiting, ask it. A job
 * written step by step is taken to its next step instead.
 */
function ensureAsk(id: string) {
  if (getState().jobs.find((j) => j.id === id)?.walk) return ensurePrompt(id);
  updateJob(id, (x) => {
    const last = x.chat[x.chat.length - 1];
    if (x.setup || (last?.from === 'ai' && last.ask)) return x;
    const ask = nextAsk(x.facts);
    return ask.length ? { ...x, chat: [...x.chat, ...ask] } : x;
  });
}

/**
 * Takes a job written step by step to its next step (section 19, steps 3 to 7): the fixed sections are written by the rules as they are
 * reached; the others by the AI when it is on (the window asks it), otherwise by the rules at once; and the step's question is asked
 * unless the last message already asks it.
 */
function ensurePrompt(id: string) {
  for (let i = 0; i < 12; i++) {
    const s = getState();
    const j = s.jobs.find((x) => x.id === id);
    const step = j ? nextStep(j, s) : null;
    if (!j || !step || (step.kind === 'setup' && step.stage === 'template')) return;
    if (step.kind === 'write') {
      const fixed = step.sections.filter((k) => FIXED_SECTIONS.includes(k));
      if (fixed.length) {
        writeByRules(id, fixed);
        continue;
      }
      if (aiWrites()) return;
      writeByRules(id, step.sections);
      continue;
    }
    const key = stepKey(step);
    const last = j.chat[j.chat.length - 1];
    if (step.kind === 'live' ? j.chat.some((m) => m.step === 'live') : last?.from === 'ai' && last.step === key) return;
    const prompts = promptFor(s, j, formatOf(s, j.format), step, key, aiWrites());
    if (prompts.length) updateJob(id, (x) => ({ ...x, chat: [...x.chat, ...prompts] }));
    return;
  }
}

/** Sections written by the rules, in the job's order: the fixed ones as they are reached, and the others when the AI is off. */
function writeByRules(id: string, keys: string[]) {
  update((s) => ({
    ...s,
    jobs: s.jobs.map((x) => {
      if (x.id !== id) return x;
      const ctx = ctxFor(s, x);
      const add = keys
        .filter((k) => x.tags.includes(k) && !isWritten(x, k))
        .map((k) => {
          const sec = built(k, ctx, x);
          return x.renamed?.[k] ? { ...sec, title: x.renamed[k] } : sec;
        });
      if (!add.length) return x;
      const sections = inOutlineOrder([...x.sections.filter((sec) => !add.some((a) => a.key === sec.key)), ...add], x.tags);
      const written = add.filter((a) => !FIXED_SECTIONS.includes(a.key));
      if (!written.length) return { ...x, sections };
      return { ...x, sections, versions: [...x.versions, { n: x.versions.length + 1, at: Date.now(), note: written.length > 1 ? 'First draft' : `Wrote ${written[0].title}`, sections }] };
    }),
  }));
}

/** The sections the job has reached, written by the rules now: when the AI could not write them. */
export function writeNow(id: string) {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  const step = j ? nextStep(j, s) : null;
  if (step?.kind !== 'write' || !ownerOnly()) return;
  writeByRules(id, step.sections);
  ensureAsk(id);
}

/** The live draft: once the role is known, the job description is written straight away and fills in as facts arrive. */
function withLiveDraft(s: State, j: DemoJob): DemoJob {
  if (j.walk || j.setup || j.sections.length || !j.facts.title || j.tags.length < 3) return j;
  const sections = buildSections(j.tags, ctxFor(s, j));
  return { ...j, sections, versions: [...j.versions, { n: j.versions.length + 1, at: Date.now(), note: 'First draft', sections }] };
}

function memoryHint(s: State, title: string): string | null {
  const past = s.jobs.find((j) => j.status === 'closed' && title && j.facts.title.toLowerCase() === title.toLowerCase());
  return past ? `You hired ${article(past.facts.title)} ${past.facts.title} before (${past.facts.location}). Say "start from last time" to reuse it.` : null;
}

/** The fixed text a job starts with: what the organisation kept for every job, or the template's own. */
function fixedFor(s: State, format: Format): string[] {
  return s.org.keptFixed ? [...s.org.keptFixed] : format.commitments.filter((c) => c !== 'mds' || s.org.mdsMember);
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
    commitments: fixedFor(s, format),
    apply: s.org.keptApply ? { ...s.org.keptApply } : defaultApply(s.org.orgType, s.org.careersUrl),
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

/**
 * Starts a job conversation from the first message. Returns the new job's id. `inWindow`: the job waits for its template and style, and
 * the chat asks for the template first (section 19, phase 1 revised).
 */
export function startJob(text: string, formatKey?: string, extra: string[] = [], inWindow = false): string {
  const s = getState();
  const id = nextId('job');
  const { facts, role, engagement } = extractFacts(text, s.today);
  if (facts.salaryMode === 'hidden') facts.salaryMode = s.org.orgType === 'charity' ? 'range' : s.org.orgType === 'un' ? 'grade' : s.org.orgType === 'ingo' ? 'scale' : 'hidden';
  const job = newJob(s, id, facts, role?.key ?? 'programme', formatKey ?? defaultFormatKey(s));
  if (extra.length) job.tags = orderSections([...job.tags, ...extra.filter((k) => !job.tags.includes(k))], formatOf(s, job.format));
  if (inWindow) {
    const lang = detectLang(text);
    const waiting: DemoJob = { ...job, setup: 'template', walk: { approved: [], settled: [] }, ...(lang !== 'en' ? { lang } : {}) };
    waiting.chat = [msg('user', text), ...templateQuestion(s, waiting, Boolean(engagement) || Boolean(facts.contract))];
    update((st) => ({ ...st, jobs: [waiting, ...st.jobs] }));
    return id;
  }
  const live = withLiveDraft(s, job);
  live.chat = [msg('user', text), ...replyAfterFacts(s, live, true)];
  update((st) => ({ ...st, jobs: [live, ...st.jobs] }));
  return id;
}

const KEEP_QUICK = ['Keep it for all jobs', 'Just this job'];
export const SEE_ALL = 'See all formats';
export const CREATE_OWN = 'Create my own';
export const USE_MINE = 'Use one of my job descriptions';
export const DOC_QUICK = ['Only its headings and order', 'Its headings, saved as our JD format', 'Its wording too'];
const LINK = /^\s*(?:https?:\/\/|www\.)\S+\s*$/i;
export const LINK_REPLY = "I can't read links here: many career sites can't be read automatically. Paste the text of the job description, or drop the file in the box.";

/** Why the job type brings in a section the template does not have ("Deliverables, because consultancies list them"). */
function addedFor(format: Format, facts: Facts): string[] {
  return orderSections(recommendSections(format, facts), format).filter((k) => !format.order.some((o) => o.key === k) && TYPE_REASONS[k]);
}

/**
 * The first question in the window: which template, with the recommendation and its reason, the sections this role adds, the market
 * line (sample figures), and the close matches as answers; the job type read so far.
 */
function templateQuestion(s: State, j: DemoJob, typeClear: boolean): ChatMsg[] {
  const rec = recommendation(s, j.format);
  const format = formatOf(s, rec.key);
  const count = orderSections(recommendSections(format, j.facts), format).length;
  const what = j.facts.title ? `**${j.facts.title}**${j.facts.location ? ` in ${j.facts.location}` : ''}` : 'a new job';
  const type = `${ENGAGEMENTS.find((e) => e.key === j.facts.engagement)?.label.toLowerCase() ?? 'job'}${j.facts.contract ? `, ${j.facts.contract.toLowerCase()}` : ''}`;
  const added = addedFor(format, j.facts);
  const adds = added.length ? `, with ${added.map((k) => `**${headingFor(k, format)}** (${TYPE_REASONS[k].charAt(0).toLowerCase()}${TYPE_REASONS[k].slice(1)})`).join(' and ')}` : '';
  const sector = roleByKey(j.family).sector.toLowerCase();
  const market = j.facts.title ? `\n\n${MARKET_SAMPLE.similar} similar ${sector} roles are on AidJobs: usually ${MARKET_SAMPLE.grade}, ${MARKET_SAMPLE.showPay}% show a salary, open about ${MARKET_SAMPLE.daysOpen} days (sample figures in the demo).` : '';
  const out: ChatMsg[] = [];
  const better = j.facts.title ? suggestTitle(j.facts.title) : null;
  if (better) out.push(msg('ai', `Did you mean **${better}**?`, [`Use "${better}"`]));
  const others = rec.others.slice(0, 2).map((k) => formatOf(s, k).label);
  out.push({
    ...msg(
      'ai',
      `Got it: ${what}. I read it as a ${type}${typeClear ? '' : ", though I couldn't tell the contract: tap it in the sentence at the top of the template panel, or tell me"}.${market}\n\nFirst, the template. I'd use **${format.label}**, ${rec.reason}: ${count} sections for this job${adds}, about ${wordsFor(count)} words. Shall I use it, or one of the others?`,
      [`Use ${format.label}`, ...others.map((l) => `Use ${l}`), SEE_ALL, CREATE_OWN, USE_MINE],
    ),
    step: 'setup:template',
  });
  return out;
}

/** The pace is chosen: the fixed sections are written from the settings, and the writing begins. */
function startWriting(s: State, j: DemoJob, pace: Pace): DemoJob {
  const walk = { ...(j.walk ?? { approved: [], settled: [] }), pace };
  const base: DemoJob = { ...j, setup: undefined, walk, part: undefined };
  const ctx = ctxFor(s, base);
  const fixed = j.tags.filter((k) => FIXED_SECTIONS.includes(k) && !isWritten(j, k)).map((k) => built(k, ctx, j));
  return { ...base, sections: inOutlineOrder([...j.sections, ...fixed], j.tags) };
}

/** "One section at a time" or "write it all": chosen once, remembered for the next job, and changed whenever the user says so. */
export function setPace(id: string, pace: Pace, said?: string) {
  if (!ownerOnly()) return;
  update((s) => ({
    ...s,
    pace,
    jobs: s.jobs.map((j) => {
      if (j.id !== id || !j.walk) return j;
      const user = said ? [msg('user', said)] : [];
      if (j.setup === 'pace') {
        const reply = pace === 'step' ? "One section at a time, then. I'll ask what each part needs just before writing it." : "I'll write it all, then we'll go through it section by section.";
        return { ...startWriting(s, j, pace), chat: [...j.chat, ...user, msg('ai', reply)] };
      }
      if (j.setup) return { ...j, walk: { ...j.walk, pace }, chat: [...j.chat, ...user] };
      return { ...j, walk: { ...j.walk, pace }, chat: [...j.chat, ...user, msg('ai', pace === 'all' ? "I'll write the rest now." : 'One section at a time from here.')] };
    }),
  }));
  ensureAsk(id);
}

/** Puts the chosen template on a job that is waiting for one, and asks for the style. `tags`: the sections of a template the user built. */
export function applyTemplate(id: string, formatKey: string, said?: string, tags?: string[]) {
  if (!ownerOnly()) return;
  update((s) => ({
    ...s,
    jobs: s.jobs.map((j) => {
      if (j.id !== id) return j;
      const format = formatOf(s, formatKey);
      const keys = outlineOrder(tags ?? orderSections(recommendSections(format, j.facts), format));
      const next: DemoJob = { ...j, format: format.key, tone: format.tone, tags: keys, commitments: fixedFor(s, format), part: undefined };
      const user = said ? [msg('user', said)] : [];
      if (!j.setup) return j;
      const text = j.walk ? overview(format, keys.length, wordsFor(keys.length), contentOf(format, s.org.orgType), styleQuestion(s)) : `**${format.label}** it is: ${keys.length} sections. ${styleQuestion(s)}`;
      return { ...next, setup: 'style', chat: [...j.chat, ...user, { ...msg('ai', text, STYLE_QUICK), step: 'setup:style' }] };
    }),
  }));
}

/** The style is chosen: the first draft is written in it, and the fact questions begin. */
export function chooseStyle(id: string, style: string[], said?: string) {
  if (!ownerOnly()) return;
  update((s) => ({
    ...s,
    jobs: s.jobs.map((j) => {
      if (j.id !== id) return j;
      if (j.walk) {
        const offer = !s.org.styleKept;
        const user = said ? [msg('user', said)] : [];
        const base: DemoJob = { ...j, style, tone: toneOf(style) };
        const keep = `I'll write it ${describeStyle(style)}.${offer ? ' Shall I keep this style for all your jobs?' : ''}`;
        // A job description brought with its wording is already written: it is gone through section by section.
        const pace = j.tags.every((k) => isWritten(j, k)) ? 'all' : (j.walk.pace ?? s.pace);
        if (!pace) return { ...base, setup: 'pace', chat: [...j.chat, ...user, msg('ai', keep, offer ? KEEP_QUICK : undefined)] };
        const how = j.tags.every((k) => isWritten(j, k)) ? '' : j.walk.pace ? '' : pace === 'step' ? ' One section at a time, as last time (say "write it all" to change).' : ' All of it first, as last time (say "one section at a time" to change).';
        return { ...startWriting(s, base, pace), chat: [...j.chat, ...user, msg('ai', `${keep}${how}`, offer ? KEEP_QUICK : undefined)] };
      }
      const written = withLiveDraft(s, { ...j, style, tone: toneOf(style), setup: undefined });
      const offer = !s.org.styleKept;
      const reply = written.sections.length ? `Here is the first draft, written ${describeStyle(style)}.` : `I'll write it ${describeStyle(style)} as soon as I know the job title.`;
      return {
        ...written,
        part: written.sections.length ? `s:${written.tags[0]}` : undefined,
        chat: [...j.chat, ...(said ? [msg('user', said)] : []), msg('ai', `${reply}${offer ? ' Shall I keep this style for all your jobs?' : ''}`, offer ? KEEP_QUICK : undefined), ...nextAsk(written.facts)],
      };
    }),
  }));
  if (getState().jobs.find((j) => j.id === id)?.walk) ensureAsk(id);
}

/** The goals a job serves, corrected by hand (at most three); `null` goes back to reading them from the role. */
export function setSdgs(id: string, sdgs: number[] | null) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => withSdgsAnswered({ ...touched(j), sdgs: sdgs ? sdgs.slice(0, 3) : undefined, sdgsFrom: undefined }));
  if (getState().jobs.find((j) => j.id === id)?.walk) ensureAsk(id);
}

/** No goal is clear from the role: the user chooses the organisation's own goals (at most three), never applied without asking. */
export function applyOrgSdgs(id: string, said?: string) {
  const goals = getState().org.sdgs.slice(0, 3);
  if (!ownerOnly() || !goals.length) return;
  updateJob(id, (j) => withSdgsAnswered({ ...touched(j), sdgs: goals, sdgsFrom: 'org', chat: said ? [...j.chat, msg('user', said), msg('ai', `Done: the job page says ${getState().org.name} works towards SDG ${goals.join(', ')}.`)] : j.chat }));
  if (getState().jobs.find((j) => j.id === id)?.walk) ensureAsk(id);
}

/** In a job written step by step, choosing the goals in any way answers the chat's question about them (step 6). */
function withSdgsAnswered(j: DemoJob): DemoJob {
  return j.walk && !j.walk.settled.includes('sdgs') ? { ...j, walk: { ...j.walk, settled: [...j.walk.settled, 'sdgs'] } } : j;
}

/** "Keep it for all jobs": the job's style becomes the organisation's, and is not offered again. */
export function keepStyleForAll(id: string) {
  const style = getState().jobs.find((j) => j.id === id)?.style;
  if (!ownerOnly() || !style) return;
  update((s) => ({ ...s, org: { ...s.org, voice: style, styleKept: true } }));
}

/** The style changed after the first draft: the rules' sections follow it; sections written by the AI or by hand keep their words. */
export function setStyle(id: string, style: string[]) {
  if (!ownerOnly()) return;
  update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? rebuilt(s, touched({ ...j, style, tone: toneOf(style) })) : j)) }));
}

/** Facts read by the AI chat; a title also gives the role family when the job has none yet. */
export function setFactsFromChat(id: string, patch: Partial<Facts>) {
  if (!ownerOnly()) return;
  update((s) => ({
    ...s,
    jobs: s.jobs.map((j) => {
      if (j.id !== id) return j;
      const role = patch.title ? detectRole(patch.title).role : null;
      return withFacts(s, { ...j, family: j.family === 'programme' && role ? role.key : j.family }, { ...j.facts, ...patch });
    }),
  }));
}

/** A heading renamed for this job only. */
export function renameSection(id: string, key: string, heading: string) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => (j.tags.includes(key) ? { ...touched(j), renamed: { ...j.renamed, [key]: heading }, sections: j.sections.map((x) => (x.key === key ? { ...x, title: heading } : x)) } : j));
}

/** A section's heading as the job shows it: its own, a rename for this job, or the template's. */
export function headingOf(s: State, j: DemoJob, key: string): string {
  return j.sections.find((x) => x.key === key)?.title ?? j.renamed?.[key] ?? headingFor(key, formatOf(s, j.format));
}

/**
 * The job's outline as edited in the template panel (the user, 12 November 2026: any template can be adjusted, as in the earlier
 * outline editor): sections added, removed, put in order within their groups, and renamed for this job. Text already written is kept
 * where its section stays.
 */
export function applyOutline(id: string, order: Format['order']) {
  if (!ownerOnly()) return;
  const job = () => getState().jobs.find((x) => x.id === id);
  const start = job();
  if (!start) return;
  const want = order.map((o) => o.key);
  for (const k of start.tags) if (!want.includes(k) && (job()?.tags.length ?? 0) > 1) toggleSection(id, k);
  for (const k of want) if (!job()?.tags.includes(k)) toggleSection(id, k);
  reorderSections(id, want.filter((k) => job()?.tags.includes(k)));
  for (const o of order) {
    const j = job();
    const heading = o.heading.trim();
    if (j && heading && heading !== headingOf(getState(), j, o.key)) renameSection(id, o.key, heading);
  }
}

/**
 * Sections written by the AI chat: kept when the facts change, with a version, and shown as the last change with its undo. With no
 * draft yet, the other sections are written by the rules so the job description is whole.
 */
export function writeSections(id: string, writes: Array<{ key: string; lines: string[] }>, note: string) {
  if (!ownerOnly()) return;
  update((s) => ({
    ...s,
    jobs: s.jobs.map((x) => {
      if (x.id !== id) return x;
      const base = x.walk || x.sections.length ? x.sections : buildSections(x.tags, ctxFor(s, x));
      const format = formatOf(s, x.format);
      const fresh: Section[] = writes.filter((w) => x.tags.includes(w.key) && !base.some((b) => b.key === w.key)).map((w) => ({ key: w.key, title: x.renamed?.[w.key] ?? headingFor(w.key, format), lines: w.lines, ai: true }));
      const sections = inOutlineOrder(
        [
          ...base.map((sec) => {
            const w = writes.find((v) => v.key === sec.key);
            return w ? { ...sec, lines: w.lines, ai: true, edited: undefined } : sec;
          }),
          ...fresh,
        ],
        x.tags,
      );
      const keys = changedKeys(x.sections, sections);
      if (!keys.length) return x;
      return {
        ...reopenApproval(x),
        sections,
        ...liveEdit(x),
        versions: [...x.versions, { n: x.versions.length + 1, at: Date.now(), note, sections }],
        lastChange: { keys, text: note, before: x.sections, beforeTags: x.tags, beforeFacts: x.facts, beforeTone: x.tone },
      };
    }),
  }));
}

/**
 * One turn of the AI chat in the conversation: what was said and the AI's reply, in place of anything the actions' own rules said
 * along the way. `said` is null for the first reply, whose message is already there. `askNext`: a reply that asks nothing is followed
 * by the next missing fact's question, as the rules do.
 */
export function aiExchange(id: string, before: ChatMsg[], said: string | null, reply: { text: string; quick?: string[]; ask?: ChatMsg['ask']; by?: string; step?: string; card?: ChatMsg['card'] }, askNext = true) {
  updateJob(id, (x) => ({ ...x, chat: [...before, ...(said ? [msg('user', said)] : []), { ...msg('ai', reply.text, reply.quick, reply.ask), ai: true, ...(reply.by ? { by: reply.by } : {}), ...(reply.step ? { step: reply.step } : {}), ...(reply.card ? { card: reply.card } : {}) }] }));
  if (askNext || getState().jobs.find((j) => j.id === id)?.walk) ensureAsk(id);
}

/** A template matched by name in a message: "use the UN one", "INGO role profile". */
function templateIn(s: State, text: string): string | null {
  const t = text.toLowerCase().replace(/^use\s+/, '').replace(/[.!?]$/, '').trim();
  const usable = s.formats.filter((f) => !f.key.startsWith('pasted-'));
  const exact = usable.find((f) => f.label.toLowerCase() === t);
  if (exact) return exact.key;
  const words = t.split(/[\s-]+/).filter((w) => w.length > 1 && !['the', 'one', 'format', 'template', 'please', 'a', 'an', 'it'].includes(w));
  if (!words.length) return null;
  const hit = usable.find((f) => words.every((w) => f.label.toLowerCase().includes(w)));
  return hit?.key ?? null;
}

const YES = /^(yes|yep|yeah|ok|okay|sure|fine|go ahead|sounds good|use it|that one|do it|please do|perfect|great)\b/i;

/** A message while the job waits for its template or its style. Returns true when it was handled. */
function setupTurn(s: State, j: DemoJob, text: string): boolean {
  const userMsg = msg('user', text);
  const say = (reply: string, quick?: string[]) => updateJob(j.id, (x) => ({ ...x, chat: [...x.chat, userMsg, msg('ai', reply, quick)] }));
  if (j.setup === 'pace') {
    const t = text.trim();
    const pace = t === PACE_QUICK[0] ? 'step' : t === PACE_QUICK[1] ? 'all' : paceIn(t);
    if (pace) setPace(j.id, pace, text);
    else say('Shall I write one section at a time, or all of it for you to review?', PACE_QUICK);
    return true;
  }
  if (j.setup === 'template' && j.walk?.doc) {
    const t = text.trim().toLowerCase();
    const choice = t === DOC_QUICK[0].toLowerCase() || /\bonly\b.*\bheadings?\b|\bjust the headings\b/.test(t) ? 'headings' : t === DOC_QUICK[1].toLowerCase() || /\bsave\b/.test(t) ? 'save' : t === DOC_QUICK[2].toLowerCase() || /\bwording\b|\btext too\b|\bkeep (the|its) text\b/.test(t) ? 'wording' : null;
    if (choice) {
      takeDocument(j.id, choice, text);
      return true;
    }
  }
  if (j.setup === 'template') {
    const rec = recommendation(s, j.format);
    if (LINK.test(text)) {
      say(LINK_REPLY);
      return true;
    }
    if (text.trim() === USE_MINE) {
      say("Paste it here, or drop the file (text, Word, or PDF) in the box. Then I'll ask whether to use only its headings or its wording too.");
      return true;
    }
    if (text.length > 150 && readPasted(text).length >= 2) {
      updateJob(j.id, (x) => ({ ...x, chat: [...x.chat, msg('user', `${text.slice(0, 80).trim()}…`)] }));
      bringDocument(j.id, text);
      return true;
    }
    if (text.trim() === SEE_ALL || /\bsee all\b|\ball (the )?(formats|templates)\b/i.test(text)) {
      say('All the formats are in the template panel, by family, each with its sections and length. Choose one there, or tell me which.', [`Use ${formatOf(s, rec.key).label}`, CREATE_OWN]);
      return true;
    }
    if (/\b(own|scratch|myself|build|custom)\b/i.test(text)) {
      say("Let's build it: give it a name, then add, remove, rename, and order the sections. They show in the job description as you go; choose \"Use\" when it looks right.");
      return true;
    }
    const named = templateIn(s, text);
    if (named) {
      applyTemplate(j.id, named, text);
      return true;
    }
    if (YES.test(text.trim())) {
      applyTemplate(j.id, rec.key, text);
      return true;
    }
    if (/\b(other|others|more|show|options|different|alternatives?|else)\b/i.test(text)) {
      const list = rec.others.map((k) => formatOf(s, k));
      say(`Close matches: ${list.map((f) => `**${f.label}** (${f.usedBy.toLowerCase()})`).join('; ')}. All of them are in the template panel, by family, each with its sections.`, list.map((f) => `Use ${f.label}`));
      return true;
    }
    say(`Which template shall I use? I'd suggest **${formatOf(s, rec.key).label}**, or pick one in the template panel, or create your own.`, [`Use ${formatOf(s, rec.key).label}`, ...(j.walk ? [SEE_ALL, CREATE_OWN, USE_MINE] : ['Show me others', 'Create my own'])]);
    return true;
  }
  if (j.setup === 'style') {
    const style = YES.test(text.trim()) ? proposedStyle(s) : styleFromReply(proposedStyle(s), text);
    chooseStyle(j.id, style, text);
    return true;
  }
  return false;
}

function replyAfterFacts(s: State, j: DemoJob, first: boolean): ChatMsg[] {
  if (j.walk) return [];
  const out: ChatMsg[] = [];
  const mem = first ? memoryHint(s, j.facts.title) : null;
  if (first) {
    const what = j.facts.title ? `**${j.facts.title}**${j.facts.location ? ` in ${j.facts.location}` : ''}` : '';
    if (what) out.push(msg('ai', `Got it: ${what}, in ${formatOf(s, j.format).label}. The job description is taking shape, and fills in as you answer.`));
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

const FACT_WORDS: Partial<Record<keyof Facts, string>> = { title: 'job title', location: 'duty station', arrangement: 'work arrangement', contract: 'contract', grade: 'grade', deadline: 'closing date', salaryMin: 'pay', salaryMax: 'pay', salaryMode: 'pay', currency: 'pay', languages: 'languages', eligibility: 'who can apply', safeguarding: 'safeguarding level', duration: 'duration', engagement: 'kind of job' };

/** An old fact's words replaced by the new one's in text written by the AI or by hand ("Juba" becomes "Wau"). */
function replaceOld(lines: string[], was: Facts, now: Facts): string[] {
  const pairs: Array<[string, string]> = [];
  if (was.location && now.location && was.location !== now.location) pairs.push([was.location, now.location], [was.location.split(',')[0], now.location.split(',')[0]]);
  if (was.deadline && now.deadline && was.deadline !== now.deadline) pairs.push([longDate(was.deadline), longDate(now.deadline)]);
  for (const k of ['title', 'contract', 'grade', 'duration'] as const) if (was[k] && now[k] && was[k] !== now[k]) pairs.push([was[k], now[k]]);
  if (!pairs.length) return lines;
  return lines.map((l) => pairs.reduce((acc, [a, b]) => acc.replace(new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), b), l));
}

/**
 * Sets facts and keeps the job in step: the live draft, placeholders, and a reopened approval. In a job written step by step, the facts
 * set answer their questions; text written by the AI or by hand takes the new fact in place of the old; and a section already approved
 * keeps its text until the user agrees to the changed lines (section 19, step 4).
 */
function withFacts(s: State, j: DemoJob, facts: Facts): DemoJob {
  const format = formatOf(s, j.format);
  const tags = j.sections.length ? j.tags : orderSections(Array.from(new Set([...j.tags, ...recommendSections(format, facts)])), format);
  const own = j.walk ? { ...j, sections: j.sections.map((x) => (x.ai || x.edited ? { ...x, lines: replaceOld(x.lines, j.facts, facts) } : x)) } : j;
  const next = touched(withLiveDraft(s, rebuilt(s, { ...own, facts, tags, ...liveEdit(j) })));
  if (!j.walk || !next.walk) return next;
  const changed = (Object.keys(facts) as Array<keyof Facts>).filter((k) => JSON.stringify(facts[k]) !== JSON.stringify(j.facts[k]));
  const walk = { ...next.walk, settled: Array.from(new Set([...next.walk.settled, ...asksOf(changed)])) };
  const changes = next.sections
    .filter((x) => walk.approved.includes(x.key))
    .map((x) => ({ key: x.key, was: (j.sections.find((y) => y.key === x.key)?.lines ?? []).map((l) => fillSlots(l, facts)), now: x.lines }))
    .filter((c) => JSON.stringify(c.was) !== JSON.stringify(c.now));
  if (!changes.length) return { ...next, walk };
  const what = Array.from(new Set(changed.map((k) => FACT_WORDS[k]).filter(Boolean))).join(' and ') || 'details';
  const earlier = (walk.pending?.changes ?? []).filter((c) => !changes.some((x) => x.key === c.key));
  return {
    ...next,
    sections: next.sections.map((x) => {
      const c = changes.find((y) => y.key === x.key);
      return c ? { ...x, lines: c.was } : x;
    }),
    walk: { ...walk, pending: { what, changes: [...earlier, ...changes.map((c) => ({ key: c.key, lines: c.now }))] } },
  };
}

/** The changed lines of approved sections, put in or left out as the user says. */
export function confirmChange(id: string, apply: boolean, said?: string) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => {
    const p = j.walk?.pending;
    if (!p) return j;
    const sections = apply ? j.sections.map((x) => ({ ...x, lines: p.changes.find((c) => c.key === x.key)?.lines ?? x.lines })) : j.sections;
    const chat = said ? [...j.chat, msg('user', said), msg('ai', apply ? 'Changed there too.' : 'Kept the text as it was.')] : j.chat;
    return { ...j, sections, walk: { ...j.walk!, pending: undefined }, chat, versions: apply ? [...j.versions, { n: j.versions.length + 1, at: Date.now(), note: `Updated the ${p.what}`, sections }] : j.versions };
  });
  ensureAsk(id);
}

/**
 * Answers a question with a fact picked in the chat (a place, a date, a contract) and asks the next one. `kind`: the question it answers,
 * settled even when the answer keeps the default ("Anyone", "No grade").
 */
export function answerFact(id: string, patch: Partial<Facts>, said: string, kind?: AskKind) {
  if (!ownerOnly()) return;
  update((s) => ({
    ...s,
    jobs: s.jobs.map((j) => {
      if (j.id !== id) return j;
      const next = withFacts(s, j, { ...j.facts, ...patch });
      const walk = next.walk && kind ? { ...next.walk, settled: Array.from(new Set([...next.walk.settled, kind])) } : next.walk;
      return { ...next, walk, chat: [...j.chat, msg('user', said), ...replyAfterFacts(s, next, false)] };
    }),
  }));
  ensureAsk(id);
}

/** How people apply, chosen in the chat; an email address is kept only when the user gave one. */
export function setMethod(id: string, method: ApplySettings['method'], said: string, address?: string) {
  if (!ownerOnly()) return;
  update((s) => ({
    ...s,
    jobs: s.jobs.map((j) => {
      if (j.id !== id) return j;
      const apply = { ...j.apply, method, ...(address ? { address } : {}) };
      const next = rebuilt(s, touched({ ...j, apply }));
      const walk = next.walk ? { ...next.walk, settled: Array.from(new Set([...next.walk.settled, 'method'])) } : next.walk;
      return { ...next, walk, chat: [...j.chat, msg('user', said)] };
    }),
  }));
  ensureAsk(id);
}

/** A part of step 6 answered ("None of these", "Keep them", "No, thanks"). */
function settle(id: string, what: string, said: string, reply?: string) {
  updateJob(id, (j) => (j.walk ? { ...j, walk: { ...j.walk, settled: Array.from(new Set([...j.walk.settled, what])) }, chat: [...j.chat, ...(said ? [msg('user', said)] : []), ...(reply ? [msg('ai', reply)] : [])] } : j));
}

/** A question answered or declined in the AI chat ("there is no grade", "anyone can apply"). */
export function settleQuestion(id: string, what: string) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => (j.walk && !j.walk.settled.includes(what) ? { ...j, walk: { ...j.walk, settled: [...j.walk.settled, what] } } : j));
}

/** A section the user is happy with; the chat goes on to the next step. Also from the section's own button. */
export function approveSection(id: string, key: string, said?: string) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => (!j.walk || !isWritten(j, key) || j.walk.approved.includes(key) ? j : { ...j, walk: { ...j.walk, approved: [...j.walk.approved, key] }, chat: said ? [...j.chat, msg('user', said)] : j.chat }));
  ensureAsk(id);
}

/** "All good, approve the rest": every section written so far. */
export function approveRest(id: string, said?: string) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => (j.walk ? { ...j, walk: { ...j.walk, approved: Array.from(new Set([...j.walk.approved, ...j.tags.filter((k) => isWritten(j, k))])) }, chat: said ? [...j.chat, msg('user', said)] : j.chat } : j));
  ensureAsk(id);
}

/** A check point left as it is: nothing changes, and the check moves on. */
export function leavePoint(id: string, key: string, said?: string) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => (j.walk ? { ...j, walk: { ...j.walk, skipped: Array.from(new Set([...(j.walk.skipped ?? []), key])), awaiting: undefined }, chat: said ? [...j.chat, msg('user', said), msg('ai', 'Left as it is.')] : j.chat } : j));
  ensureAsk(id);
}

/** Highlighted wording kept as a genuine requirement, with its one-line reason. */
export function acceptPoint(id: string, key: string, hit: string, reason: string, said?: string) {
  if (!ownerOnly()) return;
  markGenuine(id, hit, reason);
  updateJob(id, (j) => (j.walk ? { ...j, walk: { ...j.walk, skipped: Array.from(new Set([...(j.walk.skipped ?? []), key])), awaiting: undefined }, chat: said ? [...j.chat, msg('user', said), msg('ai', 'Kept, with your reason in the job’s history.')] : j.chat } : j));
  ensureAsk(id);
}

const EDIT_WORDS = /\b(shorter|shorten|longer|expand|add|remove|drop|delete|formal|warm|plain|simple|make|change|rewrite|undo)\b/i;
const ASK_HINT: Record<LegacyAsk, string> = {
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

/**
 * `focus`: the section open in the window, which a request that names no section is about. `version`: a language version's tab is
 * open, so a request is about that version (section 19); the rules answer the step's own answers, and leave the job's text alone.
 */
export function sendChat(id: string, text: string, focus?: string, version?: JobLang) {
  if (!ownerOnly()) return;
  const j = getState().jobs.find((x) => x.id === id);
  if (version && j?.translations?.[version]) {
    if (!(j.walk && walkTurn(getState(), j, text))) updateJob(id, (x) => ({ ...x, chat: [...x.chat, msg('user', text), msg('ai', `That is about the ${langOf(version).label} version: change its lines in its tab, and add or remove its sections from the line. The AI can write it for you when it is on.`)] }));
    ensureAsk(id);
    return;
  }
  chatTurn(id, text, focus);
  ensureAsk(id);
}

/** A request the window answers itself (open the preview, earlier versions): the message and the reply join the conversation. */
export function chatNote(id: string, said: string, reply: string, quick?: string[], card?: ChatMsg['card']) {
  if (!ownerOnly()) return;
  updateJob(id, (x) => ({ ...x, chat: [...x.chat, msg('user', said), { ...msg('ai', reply, quick), ...(card ? { card } : {}) }] }));
  if (!card) ensureAsk(id);
}

/** After something done by a button (published, paid, sent for review), the chat goes on to what comes next. */
export function goOn(id: string) {
  ensureAsk(id);
}

/**
 * Opens the window at one of its parts: what Overview, Manage jobs, and the earlier workspace link to (section 19, Scope). For a live
 * or scheduled free job, publishing can only mean amplifying it, so that is what its Publish part then offers.
 */
export function openWindowAt(id: string, part: string) {
  const amplifyIt = (j: DemoJob) => part === 'publish' && j.plan === 'free' && (j.status === 'live' || j.status === 'scheduled');
  update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, part, ...(amplifyIt(j) ? { choice: 'amplify' as const } : {}) } : j)) }), true);
  go('job', id);
}

const ASK_SET: Record<AskKind, string> = { title: 'job title', place: 'duty station', deadline: 'closing date', contract: 'contract', grade: 'grade', eligibility: 'who can apply', languages: 'languages', safeguarding: 'safeguarding level', salary: 'pay', method: 'way to apply' };

/** In the window, a fact the chat asked for and then set by hand: the chat says so and goes on to the next question. */
export function settleAsk(id: string) {
  const j = getState().jobs.find((x) => x.id === id);
  const last = j?.chat[j.chat.length - 1];
  if (!j || !ownerOnly() || last?.from !== 'ai' || !last.ask) return;
  const kind = last.ask;
  if (!(j.walk ? isSettled(kind, j) : LEGACY_ASKS.includes(kind) && answered(kind, j.facts))) return;
  update((s) => ({ ...s, jobs: s.jobs.map((x) => (x.id === id ? { ...x, chat: [...x.chat, msg('ai', `You set the ${ASK_SET[kind]} by hand.`), ...replyAfterFacts(s, x, false)] } : x)) }));
  ensureAsk(id);
}

/** The part open in the window. Moving around changes nothing in the job, so an offered undo stays. */
export function setPart(id: string, part: string) {
  if (getState().jobs.find((j) => j.id === id)?.part === part) return;
  update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, part } : j)) }), true);
}

const APPROVE = /^(?:yes|yep|yeah|ok|okay|good|great|fine|perfect|lovely|looks good|that'?s (?:good|fine|great)|that works|next|approve(?:d)?|done|all good|happy with (?:it|that)|move on|go on|continue)(?:[,.!\s]+(?:thanks|thank you|next|please|move on|go on|good))*[.!]?$/i;
const NO_MORE = /^(?:none|no|nope|nothing|skip|not now|that'?s all|that is all|all done|no more|no,? thanks?)\b/i;
const OTHER_DATE = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d\d)\b/i;
const FILL = /\[(?!Duty station\]|Closing date\])[^\]\n]{2,40}\]/;

/** A line of a section changed in the chat (a check point's new wording, a placeholder filled), as an edit with its undo. */
function changeLine(id: string, key: string, from: (lines: string[]) => string[], note: string) {
  updateJob(id, (j) => {
    const sections = j.sections.map((x) => (x.key === key ? { ...x, lines: from(x.lines), edited: true } : x));
    if (JSON.stringify(sections) === JSON.stringify(j.sections)) return j;
    return { ...touched(j), sections, ...liveEdit(j), versions: [...j.versions, { n: j.versions.length + 1, at: Date.now(), note, sections }], lastChange: { keys: [key], text: note, before: j.sections, beforeTags: j.tags, beforeFacts: j.facts, beforeTone: j.tone } };
  });
}

/**
 * A message answering the step a job written step by step is at (section 19, steps 3 to 7), read by the rules. Returns false when it is
 * not an answer to the step (a request about the text), which the rest of the chat then handles.
 */
function walkTurn(s: State, j: DemoJob, text: string): boolean {
  const step = nextStep(j, s);
  if (!step || !j.walk) return false;
  const t = text.trim();
  const say = (reply: string, quick?: string[]) => updateJob(j.id, (x) => ({ ...x, chat: [...x.chat, msg('user', text), msg('ai', reply, quick)] }));
  const pace = paceIn(t);
  if (pace && j.walk.pace && pace !== j.walk.pace && j.tags.some((k) => !isWritten(j, k))) {
    setPace(j.id, pace, text);
    return true;
  }
  const format = formatOf(s, j.format);
  switch (step.kind) {
    case 'change':
      if (t === CHANGE_YES || /^(?:yes|yep|ok|okay|sure|please do|change (?:it|them))\b/i.test(t)) confirmChange(j.id, true, text);
      else if (t === CHANGE_NO || /^(?:no|keep|leave)\b/i.test(t)) confirmChange(j.id, false, text);
      else return false;
      return true;
    case 'genuine': {
      const a = j.walk.awaiting;
      if (!a) return false;
      if (/^(?:never ?mind|cancel|forget it)\b/i.test(t)) {
        updateJob(j.id, (x) => ({ ...x, walk: { ...x.walk!, awaiting: undefined }, chat: [...x.chat, msg('user', text)] }));
        return true;
      }
      if (t.length < 5) return false;
      acceptPoint(j.id, a.point, a.hit, t, text);
      return true;
    }
    case 'ask': {
      if (LEGACY_ASKS.includes(step.fact)) return false;
      const read = readAnswer(step.fact, t, s, j);
      if (read?.method) setMethod(j.id, read.method, text, read.address);
      else if (read) answerFact(j.id, read.patch, text, step.fact);
      else if (!EDIT_WORDS.test(t) && !isRequest(t) && t.split(/\s+/).length <= 6) updateJob(j.id, (x) => ({ ...x, chat: [...x.chat, msg('user', text), { ...msg('ai', `I couldn't read that. ${WALK_ASK[step.fact]}`, undefined, step.fact), step: stepKey(step) }] }));
      else return false;
      return true;
    }
    case 'approve':
      if (t === ALL_GOOD || /\bapprove (?:all|the rest|everything)\b/i.test(t)) approveRest(j.id, text);
      else if (t === GOOD || APPROVE.test(t)) approveSection(j.id, step.section, text);
      else return false;
      return true;
    case 'details': {
      if (t === NONE_OF_THESE || NO_MORE.test(t)) {
        settle(j.id, 'details', text);
        return true;
      }
      const d = readDetails(t);
      if (!Object.keys(d).length) return false;
      update((st) => ({ ...st, jobs: st.jobs.map((x) => (x.id === j.id ? { ...withFacts(st, x, { ...x.facts, ...d }), chat: [...x.chat, msg('user', text)] } : x)) }));
      settle(j.id, 'details', '', `Added: ${Object.keys(d).map((k) => ({ positions: 'positions', directReports: 'direct reports', startDate: 'the start date', donor: 'the donor' })[k]).join(', ')}.`);
      return true;
    }
    case 'sdgs':
      if (t === orgGoalsAnswer(s) || /^(?:yes|ok|okay|sure|please do|use (?:them|our|the organisation'?s|your))\b/i.test(t)) applyOrgSdgs(j.id, text);
      else if (t === CHOOSE_SDGS) updateJob(j.id, (x) => ({ ...x, chat: [...x.chat, msg('user', text), { ...msg('ai', "Pick up to three in the dialog; I'll go on once they're set."), step: 'sdgs' }] }));
      else if (t === NO_SDGS || /^(?:no|none|nope|skip|not now)\b/i.test(t)) settle(j.id, 'sdgs', text, 'Fine: no SDGs on this job. You can add them from Details at any time.');
      else return false;
      return true;
    case 'fixed': {
      if (t === KEEP_FIXED || /^(?:yes|ok|okay|keep|fine|good|sure)\b/i.test(t)) {
        const lang = jobLang(j);
        if (lang !== 'en' && !s.org.fixedLangs?.includes(lang)) update((st) => ({ ...st, org: { ...st.org, fixedLangs: [...(st.org.fixedLangs ?? []), lang] } }));
        settle(j.id, 'fixed', text, lang !== 'en' && !s.org.fixedLangs?.includes(lang) ? `Kept, word for word, and confirmed for every ${langOf(lang).label} job.` : 'Kept, word for word.');
        return true;
      }
      if (t === 'Add them') {
        updateJob(j.id, (x) => ({ ...touched(x), commitments: Array.from(new Set([...x.commitments, 'safeguarding', 'psea', 'fraud'])) }));
        settle(j.id, 'fixed', text, 'Added, word for word from your settings.');
        return true;
      }
      if (t === 'No fixed text') {
        settle(j.id, 'fixed', text, 'Fine: no fixed text on this job.');
        return true;
      }
      const out = /\b(?:remove|without|leave out|drop|take out|no)\b/i.test(t) ? fixedNamed(t, j.commitments) : [];
      if (!out.length) return false;
      updateJob(j.id, (x) => ({ ...touched(x), commitments: x.commitments.filter((c) => !out.includes(c)) }));
      settle(j.id, 'fixed', text, `Left out for this job: ${out.map((k) => COMMITMENTS.find((c) => c.key === k)?.label ?? k).join(', ')}.`);
      return true;
    }
    case 'keep':
      if (t === KEEP_ALL || /^(?:yes|ok|okay|sure|keep (?:it|them)|every job|all jobs)\b/i.test(t)) keepForAll(j.id, step.what, true, text);
      else if (t === THIS_JOB || /^(?:no|just this|only this|this job)\b/i.test(t)) keepForAll(j.id, step.what, false, text);
      else return false;
      return true;
    case 'suggest': {
      const add = step.sections.find((k) => t.toLowerCase() === `add ${headingFor(k, format).toLowerCase()}` || new RegExp(`\\badd\\b.*\\b${(SECTION_BY_KEY[k]?.label ?? k).toLowerCase()}\\b`).test(t.toLowerCase()));
      if (add) {
        toggleSection(j.id, add);
        updateJob(j.id, (x) => ({ ...x, chat: [...x.chat, msg('user', text), msg('ai', `Added **${headingFor(add, format)}**.`)] }));
        return true;
      }
      if (t === NO_THANKS || NO_MORE.test(t)) {
        settle(j.id, 'suggest', text, 'Fine.');
        return true;
      }
      return false;
    }
    case 'check': {
      const p = step.point;
      if (t === LEAVE_IT || /^(?:leave(?! out\b)|ignore|skip)\b|^(?:keep it|it'?s fine)\b/i.test(t)) {
        leavePoint(j.id, p.key, text);
        return true;
      }
      if (p.hit && (t === GENUINE || /\bgenuine\b/i.test(t))) {
        updateJob(j.id, (x) => ({ ...x, walk: { ...x.walk!, awaiting: { point: p.key, hit: p.hit!, label: p.title.replace(/ in .*$/, '').replace(/[“”]/g, '') } }, chat: [...x.chat, msg('user', text)] }));
        return true;
      }
      if (t === OTHER_WORDING) {
        say('Write the new wording here, or edit the line with the pencil.');
        return true;
      }
      if (/^Move it to /.test(t) && j.facts.deadline) {
        const to = workingDay(j.facts.deadline, j.facts.iso);
        update((st) => ({ ...st, jobs: st.jobs.map((x) => (x.id === j.id ? { ...withFacts(st, x, { ...x.facts, deadline: to }), chat: [...x.chat, msg('user', text), msg('ai', `The closing date is now ${longDate(to)}.`)] } : x)) }));
        return true;
      }
      if (p.section && t === 'Remove the repeat') {
        changeLine(j.id, p.section, (ls) => ls.filter((l, i) => !l.startsWith('- ') || ls.indexOf(l) === i), 'Removed a repeated line');
        updateJob(j.id, (x) => ({ ...x, chat: [...x.chat, msg('user', text), msg('ai', 'Removed the repeat.')] }));
        return true;
      }
      if (p.section && t === 'Use the closing date' && j.facts.deadline) {
        changeLine(j.id, p.section, (ls) => ls.map((l) => l.replace(OTHER_DATE, longDate(j.facts.deadline))), 'Used the closing date');
        updateJob(j.id, (x) => ({ ...x, chat: [...x.chat, msg('user', text), msg('ai', `Changed to ${longDate(j.facts.deadline)}.`)] }));
        return true;
      }
      if (p.section && t.split(/\s+/).length >= 2 && !EDIT_WORDS.test(t.split(/\s+/)[0]) && !isRequest(t)) {
        const sec = p.section;
        if (p.hit && p.line) {
          const line = p.line;
          changeLine(j.id, sec, (ls) => ls.map((l) => (l === line ? `${l.startsWith('- ') ? '- ' : ''}${t.replace(/^- /, '')}` : l)), 'New wording from the check');
        } else if (p.key.startsWith('fill-')) {
          const value = t
            .replace(/^(?:it|this|they|he|she|the (?:post|role|post holder|officer))\s+(?:reports? to|is|are|will be|should (?:say|be))\s+/i, '')
            .replace(/^(?:say|use|put|write)\s+/i, '')
            .replace(/[.!]+$/, '');
          changeLine(j.id, sec, (ls) => {
            const at = ls.findIndex((l) => FILL.test(l));
            return ls.map((l, i) => (i === at ? l.replace(FILL, value) : l));
          }, 'Filled in a placeholder');
        } else return unclear(j, step, text);
        updateJob(j.id, (x) => ({ ...x, chat: [...x.chat, msg('user', text), msg('ai', `Changed in **${x.sections.find((y) => y.key === sec)?.title ?? sec}**.`)] }));
        return true;
      }
      return unclear(j, step, text);
    }
    default:
      return laterTurn(s, j, step, text);
  }
}

const FREE_WORDS = /^(?:publish (?:it )?free|free|the free one|go free|free,? please)\b/i;
const AMPLIFY_WORDS = /^(?:amplify|use a package job|amplify it|go with amplify|the paid one|paid)\b/i;

/** The language versions named in a message ("Add French", "French and Spanish"), not the job's own. */
function langsNamed(j: DemoJob, text: string): JobLang[] {
  const t = text.toLowerCase();
  return versionChoices(j)
    .filter((l) => new RegExp(`\\b${l.label.toLowerCase()}\\b`).test(t) || t.includes(l.native.toLowerCase()))
    .map((l) => l.key);
}

/**
 * Answers to steps 8 and 9 (section 19), read by the rules. Anything that publishes, pays, or sends is left to its card's button. A
 * short reply the rules cannot read is asked again rather than taken as text for the job description, since no section is in view.
 */
function laterTurn(s: State, j: DemoJob, step: NonNullable<ReturnType<typeof nextStep>>, text: string): boolean {
  const handled = laterAnswer(s, j, step, text);
  if (handled || !['plan', 'market', 'full', 'langs', 'version', 'flyer', 'reach', 'review', 'waiting', 'publish'].includes(step.kind)) return handled;
  return unclear(j, step, text);
}

/**
 * A short reply the rules cannot read at a step where no section is being written (the basic check, steps 8 and 9): asked again with
 * the step's answers, never added to the text as a sentence. A request about the text, or a longer message, goes on to the chat.
 */
function unclear(j: DemoJob, step: NonNullable<ReturnType<typeof nextStep>>, text: string): boolean {
  const t = text.trim();
  if (EDIT_WORDS.test(t) || isRequest(t) || t.split(/\s+/).length > 6) return false;
  const last = [...j.chat].reverse().find((m) => m.from === 'ai' && m.step === stepKey(step));
  updateJob(j.id, (x) => ({ ...x, chat: [...x.chat, msg('user', text), { ...msg('ai', "I didn't catch that for this step. Pick an answer, or tell me in your own words.", last?.quick), step: stepKey(step), ...(last?.card ? { card: last.card } : {}) }] }));
  return true;
}

function laterAnswer(s: State, j: DemoJob, step: NonNullable<ReturnType<typeof nextStep>>, text: string): boolean {
  const t = text.trim();
  const say = (reply: string, quick?: string[], card?: ChatMsg['card']) => updateJob(j.id, (x) => ({ ...x, chat: [...x.chat, msg('user', text), { ...msg('ai', reply, quick), ...(card ? { card } : {}) }] }));
  switch (step.kind) {
    case 'plan':
      if (FREE_WORDS.test(t)) return setChoice(j.id, 'free', text) || true;
      if (AMPLIFY_WORDS.test(t)) return setChoice(j.id, 'amplify', text) || true;
      return false;
    case 'market':
    case 'full': {
      const p = step.point;
      if (t === LEAVE_IT || /^(?:leave it|keep it|it'?s fine|ignore|no)\b/i.test(t)) {
        leaveAmplifyPoint(j.id, step.kind, p.key, text);
        return true;
      }
      if (p.fix && (t === p.fix.label || /^(?:yes|ok|okay|do it|fix it|apply it|sure)\b/i.test(t))) {
        applyFix(j.id, p.fix.fix, p.fix.label);
        updateJob(j.id, (x) => ({ ...x, chat: [...x.chat, msg('user', text), msg('ai', `Done: ${p.fix!.label.charAt(0).toLowerCase()}${p.fix!.label.slice(1)}. Undo is in the notice.`)] }));
        return true;
      }
      return false;
    }
    case 'langs': {
      if (t === NO_MORE_LANGS || NO_MORE.test(t)) {
        settle(j.id, 'langs', text, versionsOf(j).length ? 'Fine.' : `Fine: ${langOf(jobLang(j)).label} only.`);
        return true;
      }
      const named = langsNamed(j, t).filter((k) => !j.translations?.[k]);
      if (!named.length) return false;
      for (const k of named) addTranslation(j.id, k);
      const now = getState().jobs.find((x) => x.id === j.id);
      const extra = now ? langsToPay(now, 'amplify', viaFor(s, now)) : 0;
      updateJob(j.id, (x) => ({ ...x, chat: [...x.chat, msg('user', text), msg('ai', `Drafted ${named.map((k) => langOf(k).label).join(' and ')}, each in its own tab.${extra ? ` That is ${extra} beyond what Amplify includes: ${usd(extra * LANGUAGE_PRICE)}, added to the payment.` : ''}`)] }));
      return true;
    }
    case 'version': {
      const label = langOf(step.lang).label;
      if (t === MARK_REVIEWED || /^(?:mark (?:it )?(?:as )?reviewed|reviewed|it'?s (?:good|fine)|looks good|approve it)\b/i.test(t)) {
        reviewTranslation(j.id, step.lang);
        updateJob(j.id, (x) => ({ ...x, chat: [...x.chat, msg('user', text), msg('ai', `The ${label} version is reviewed.`)] }));
        return true;
      }
      if (t === `Remove ${label}` || new RegExp(`^(?:remove|drop|delete)\\b.*\\b${label}\\b`, 'i').test(t)) {
        removeTranslation(j.id, step.lang);
        updateJob(j.id, (x) => ({ ...x, chat: [...x.chat, msg('user', text), msg('ai', `Removed the ${label} version.`)] }));
        return true;
      }
      return false;
    }
    case 'flyer':
      if (t === SHOW_FLYER || /^(?:yes|ok|okay|show|sure)\b/i.test(t)) settle(j.id, 'flyer', text, 'The flyer is in its tab: print it, or save it as a PDF from the print window.');
      else if (t === NO_THANKS || NO_MORE.test(t)) settle(j.id, 'flyer', text, 'Fine. It stays on the line as Flyer if you want it later.');
      else return false;
      return true;
    case 'reach': {
      const emails = Array.from(new Set((t.match(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g) ?? []).map((e) => e.toLowerCase())));
      if (emails.length) {
        const base = j.reachPlan ?? planFor(j, s.org);
        const team = emails.filter((e) => e.endsWith(`@${s.org.domain}`));
        const candidates = emails.filter((e) => !team.includes(e));
        setReachPlan(j.id, { ...base, candidates: Array.from(new Set([...base.candidates, ...candidates])), team: Array.from(new Set([...base.team, ...team])) });
        settle(j.id, 'reach', text, `Added ${[candidates.length ? `${candidates.length} to invite` : '', team.length ? `${team.length} from your team` : ''].filter(Boolean).join(' and ')}. They get the emails when the job goes live; both are in the Reach tab, to check or change.`);
        return true;
      }
      if (t === INVITE || /^(?:yes|ok|okay|sure|invite)\b/i.test(t)) settle(j.id, 'reach', text, 'The invitations are in the Reach tab: add the people, check both emails, and save. They go when the job goes live.');
      else if (t === NOT_NOW || NO_MORE.test(t)) settle(j.id, 'reach', text, 'Fine. You can invite people later from the job’s page while it is live.');
      else return false;
      return true;
    }
    case 'review':
      if (t === NO_REVIEW || (!approvalRequired(s, j) && NO_MORE.test(t))) {
        settle(j.id, 'review', text, 'Fine: no review.');
        return true;
      }
      if (t === SEND_REVIEW || /\breview\b|^(?:yes|ok|okay|sure)\b/i.test(t) || s.team.some((p) => new RegExp(`\\b${p.name.split(' ')[0]}\\b`, 'i').test(t))) {
        say('Choose who reviews it, by when, and under which rule; the email they get is shown before you send.', undefined, 'review');
        return true;
      }
      return false;
    case 'waiting':
      if (t === REMIND || /^remind\b/i.test(t)) {
        remindReviewers(j.id);
        say('Reminded them (simulated).');
        return true;
      }
      if (/^send round \d+$/i.test(t) || /^send (?:it )?(?:back|again)\b/i.test(t)) {
        say('Send it back: they see only what changed since the last round.', undefined, 'review');
        return true;
      }
      return false;
    case 'publish':
      if (/^(?:yes|ok|okay)\b|\b(?:publish|post it|go live|schedule)\b/i.test(t)) {
        say('Here it is: the button says exactly what happens, and nothing goes out until you press it.', undefined, 'publish');
        return true;
      }
      return false;
    default:
      return false;
  }
}

function chatTurn(id: string, text: string, focus?: string) {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || !text.trim()) return;
  const userMsg = msg('user', text);
  const lower = text.toLowerCase();
  const lastMsg = j.chat[j.chat.length - 1];
  const asked = lastMsg?.from === 'ai' ? lastMsg.ask : undefined;
  const pending = asked && LEGACY_ASKS.includes(asked) ? (asked as LegacyAsk) : undefined;
  const use = text.match(/^use "(.+)"$/i);
  if (use) {
    update((st) => ({ ...st, jobs: st.jobs.map((x) => (x.id === id ? { ...withFacts(st, x, { ...x.facts, title: use[1] }), chat: [...x.chat, userMsg, msg('ai', `The title is now **${use[1]}**.`)] } : x)) }));
    return;
  }
  if (text.trim() === KEEP_QUICK[0] && j.style) {
    keepStyleForAll(id);
    updateJob(id, (x) => ({ ...x, chat: [...x.chat, userMsg, msg('ai', 'Kept: every new job starts in this style. You can change it in Organisation settings.')] }));
    return;
  }
  if (text.trim() === KEEP_QUICK[1]) {
    updateJob(id, (x) => ({ ...x, chat: [...x.chat, userMsg, msg('ai', 'Fine: this job only.')] }));
    return;
  }
  if (setupTurn(s, j, text)) return;
  if (j.walk && LINK.test(text)) {
    updateJob(id, (x) => ({ ...x, chat: [...x.chat, userMsg, msg('ai', LINK_REPLY)] }));
    return;
  }
  if (j.walk && walkTurn(s, j, text)) return;
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
  const edit0 = applyEdit(text, j.tags, j.sections, ctxFor(s, j), s.today, focus);
  const edit = { ...edit0, sections: edit0.sections.map((sec) => inLanguage(sec, edit0.facts, jobLang(j))) };
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
    ...liveEdit(x),
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
  if (getState().jobs.find((x) => x.id === id)?.walk?.pending) ensureAsk(id);
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
      const sections = has ? j.sections.filter((x) => x.key !== key) : inOutlineOrder([...j.sections, built(key, ctxFor(s, next), j)], tags);
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
      const extras = j.tags.filter((t) => !format.order.some((o) => o.key === t) && (['deliverables', 'learning', 'deployment', 'funding', 'conditions', 'languages'].includes(t) || j.sections.some((x) => x.key === t && (x.edited || x.ai))));
      const tags = orderSections([...format.order.map((o) => o.key), ...extras], format);
      const next = { ...touched(j), renamed: undefined, format: format.key, tone: format.tone, tags, commitments: fixedFor(s, format), chat: [...j.chat, msg('ai', `Applied ${format.label}: its headings, order, and tone. Sections you edited by hand keep your text.`)] };
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

/** `note`: in the window, the chat notices the hand edit and the edited section becomes the part in view. */
export function editSection(id: string, key: string, text: string, note = false) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => {
    const lines = text.split('\n').map((l) => l.replace(/^[•*]\s*/, '- ')).filter((l) => l.trim());
    if (JSON.stringify(lines) === JSON.stringify(j.sections.find((x) => x.key === key)?.lines)) return j;
    const sections = j.sections.map((x) => (x.key === key ? { ...x, lines, edited: true } : x));
    const title = j.sections.find((x) => x.key === key)?.title ?? key;
    const next: DemoJob = { ...touched(j), sections, versions: [...j.versions, { n: j.versions.length + 1, at: Date.now(), note: `Edited ${title}`, sections }], ...liveEdit(j) };
    return note ? { ...next, part: `s:${key}`, chat: [...j.chat, msg('ai', `You changed **${title}** by hand. I'll keep your wording; ask me if another section should change to match.`)] } : next;
  });
  if (note) ensureAsk(id);
}

export function restoreVersion(id: string, n: number) {
  if (!ownerOnly()) return;
  const v = getState().jobs.find((j) => j.id === id)?.versions.find((x) => x.n === n);
  if (!v) return;
  updateJob(id, (j) => atVersion(j, v.sections, `Restored version ${n}`));
  notify(`Restored version ${n}`);
}

/** A job description's text read into sections by their headings, one section per kind, in the document's order. */
function readDocument(text: string): Array<{ heading: string; key: string; lines: string[] }> {
  const merged: Array<{ heading: string; key: string; lines: string[] }> = [];
  for (const p of readPasted(text)) {
    const same = merged.find((m) => m.key === p.key);
    if (same) same.lines.push(...p.lines);
    else merged.push({ ...p, lines: [...p.lines] });
  }
  return merged;
}

/**
 * "Use one of your job descriptions" in the window (section 19, step 2): the document is read into sections, its facts are taken, and
 * the chat asks whether to use only its headings and order (and save them as the organisation's JD format) or its wording too.
 */
export function bringDocument(id: string, text: string): boolean {
  const s = getState();
  const doc = readDocument(text);
  const j = s.jobs.find((x) => x.id === id);
  if (!j?.walk || !ownerOnly()) return false;
  if (!doc.length) {
    updateJob(id, (x) => ({ ...x, chat: [...x.chat, msg('ai', 'No headings or text were found in it. Headings work best on their own lines.')] }));
    return false;
  }
  const { facts, role } = extractFacts(text, s.today, j.facts);
  update((st) => ({
    ...st,
    jobs: st.jobs.map((x) =>
      x.id === id
        ? {
            ...x,
            facts,
            family: x.family === 'programme' && role ? role.key : x.family,
            walk: { ...x.walk!, doc: doc.map((d) => ({ key: d.key, title: d.heading, lines: d.lines, edited: true })) },
            chat: [...x.chat, { ...msg('ai', `I read ${doc.length} sections from your job description: ${doc.map((d) => d.heading).join(', ')}. Shall I use only its headings and order, or its wording too, which I keep and improve rather than write anew?`, DOC_QUICK), step: 'setup:template' }],
          }
        : x,
    ),
  }));
  return true;
}

/** A job started from a document on the Create a job page: the window opens with the question about how to use it. */
export function startFromDocument(text: string): string | null {
  if (!readDocument(text).length) return null;
  const s = getState();
  const id = nextId('job');
  const job: DemoJob = { ...newJob(s, id, emptyFacts(), 'programme', defaultFormatKey(s)), setup: 'template', walk: { approved: [], settled: [] } };
  job.chat = [msg('user', 'My job description')];
  job.audit = [{ at: Date.now(), who: s.me.name, what: 'Started from an uploaded job description' }];
  update((st) => ({ ...st, jobs: [job, ...st.jobs] }));
  bringDocument(id, text);
  return id;
}

/** How the document is used: its headings as the template (saved as the organisation's JD format if asked), or its wording too. */
function takeDocument(id: string, how: 'headings' | 'save' | 'wording', said: string) {
  const j = getState().jobs.find((x) => x.id === id);
  const doc = j?.walk?.doc;
  if (!j || !doc) return;
  const order = doc.map((d) => ({ key: d.key, heading: d.title }));
  const s = getState();
  const key =
    how === 'save'
      ? createFormat(`${s.org.short} job description format`, order, j.tone)
      : (() => {
          const k = `pasted-${s.seq + 1}`;
          update((st) => ({ ...st, seq: st.seq + 1, formats: [...st.formats, { key: k, label: 'The headings of your job description', family: 'Your organisation', usedBy: `Read from ${order.length} headings in your job description`, tone: j.tone, order, commitments: formatOf(st, 'house').commitments }] }));
          return k;
        })();
  updateJob(id, (x) => ({ ...x, walk: { ...x.walk!, doc: undefined } }));
  applyTemplate(id, key, said, order.map((o) => o.key));
  if (how !== 'wording') return;
  updateJob(id, (x) => {
    const sections = inOutlineOrder(doc.filter((d) => x.tags.includes(d.key)), x.tags);
    return { ...x, sections, versions: [...x.versions, { n: x.versions.length + 1, at: Date.now(), note: 'Your job description, as uploaded', sections }] };
  });
}

/** An uploaded job description becomes a job in its own JD format, keeping its wording and headings. `fromHost` marks text that stands in for a web page (the demo never fetches). */
export function importPasted(text: string, fromHost?: string): string | null {
  const s = getState();
  const merged = readDocument(text);
  if (!merged.length) return null;
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
    notice: { text: `Saved ${label}. It is under Your organisation in the template panel and on the JD formats page.` },
  }));
  return key;
}
/**
 * A free job is used only when it goes live, against the month it goes live in (section 19, 8 November 2026, and the user, 12 November
 * 2026): writing, sending for review, and scheduling are free; a scheduled one only holds its month's place. One used in an earlier
 * month stays used there and does not carry over.
 */
function useFree(s: State, id: string, month = currentMonth(s)): State {
  const j = s.jobs.find((x) => x.id === id);
  if (!j || j.plan === 'amplify' || countedFor(s, id, month) || freeLeft(s, month) === 0) return s;
  return { ...s, freeUses: [...s.freeUses, { jobId: id, month }] };
}

/** A scheduled free job going live now: its hold becomes a use, in the month it goes live in. */
function holdToUse(s: State, id: string, month = currentMonth(s)): State {
  const j = s.jobs.find((x) => x.id === id);
  if (!j || j.plan !== 'free' || s.freeUses.some((u) => u.jobId === id && u.month === month)) return s;
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
export function buy(key: PackageKey | 'extra', jobTitle = '', langs = 0) {
  update((s) => {
    const today = isoDay(s.today);
    const p = packageOf(key === 'extra' ? 'one' : key);
    const amount = (key === 'extra' ? EXTRA_JOB : p.price) + langs * LANGUAGE_PRICE;
    const ends = addMonths(today, p.months);
    const more = langs ? `, with ${langs} more language ${langs === 1 ? 'version' : 'versions'}` : '';
    const item =
      (key === 'one' ? `Amplify: ${jobTitle}` : key === 'extra' ? `Extra job on “Always hiring”: ${jobTitle}` : key === 'always' ? '“Always hiring” subscription, one month' : `${p.jobs} jobs, to use by ${longDate(ends)}`) + more;
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

/** A cancelled subscription can be resumed before it ends, keeping this month's jobs; buying again would replace them. */
export function resumeSubscription() {
  update((s) => (s.subscription?.cancelled ? { ...s, subscription: { ...s.subscription, cancelled: false }, notice: { text: `Resumed. It renews on ${longDate(s.subscription.renews)}.` } } : s));
}

export function cancelSubscription() {
  update((s) =>
    s.subscription ? { ...s, subscription: { ...s.subscription, cancelled: true }, notice: { text: `Cancelled. This month's jobs stay until ${longDate(s.subscription.renews)}, and nothing more is charged.` } } : s,
  );
}

/** Review happens before publishing: a live, scheduled, or closed job is not sent for review. */
export function isReviewable(j: DemoJob): boolean {
  return j.status === 'draft' || j.status === 'review' || j.status === 'approved';
}

export function sendForReview(id: string, reviewers: Array<{ name: string; email: string; outside: boolean }>, due: string, rule: 'any' | 'all', note: string) {
  const j0 = getState().jobs.find((x) => x.id === id);
  if (!j0 || !isReviewable(j0)) return;
  update((s) => {
    const j = s.jobs.find((x) => x.id === id);
    if (!j) return s;
    const review: Review = { state: 'open', reviewers, due, round: j.review.round + 1, rule, remarks: j.review.remarks.filter((r) => r.state === 'open'), approvedVersion: undefined, sent: j.sections, before: j.review.sent };
    return {
      ...s,
      jobs: s.jobs.map((x) => (x.id === id ? { ...x, status: 'review', review, audit: [...x.audit, { at: Date.now(), who: s.me.name, what: `Sent for review to ${reviewers.map((r) => r.name).join(', ')}${note ? `: "${note}"` : ''}` }] } : x)),
      notice: { text: `Sent to ${reviewers.length} ${reviewers.length === 1 ? 'reviewer' : 'reviewers'} (simulated). Outside reviewers get a private link that expires in 7 days.` },
    };
  });
}

/** Sections whose text changed between the last round and this one; empty in the first round. */
export function changedSinceLastRound(j: DemoJob): string[] {
  const { sent, before } = j.review;
  if (!sent || !before) return [];
  return sent.filter((sec) => JSON.stringify(before.find((b) => b.key === sec.key)?.lines) !== JSON.stringify(sec.lines)).map((sec) => sec.key);
}

/** A reminder to the reviewers who have not answered yet (simulated). */
export function remindReviewers(id: string) {
  if (!ownerOnly()) return;
  const j = getState().jobs.find((x) => x.id === id);
  const waiting = j?.review.reviewers.filter((r) => !r.decision).map((r) => r.name.split(' ')[0]) ?? [];
  if (!j || !waiting.length) return;
  update((s) => ({
    ...s,
    jobs: s.jobs.map((x) => (x.id === id ? { ...x, review: { ...x.review, reminded: Date.now() }, audit: [...x.audit, { at: Date.now(), who: s.me.name, what: `Reminded ${waiting.join(' and ')} to review` }] } : x)),
    notice: { text: `Reminded ${waiting.join(' and ')} (simulated)` },
  }));
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
    const approved = isApproved({ ...next, review: { ...next.review, state: 'open' } }) && !pausedByChanges(s, next);
    // A late answer on a job already published is recorded for the author; it changes neither the job nor its review state.
    if (isReviewable(j)) {
      // Under "any one reviewer", an approval already given stands; a later request for changes is a note for the author.
      next.review.state = approved ? 'approved' : decision === 'changes' ? 'changes' : 'open';
      if (approved) next.review.approvedVersion = j.versions.length;
      next.status = approved ? 'approved' : 'review';
      // A reviewer's answer replaces the owner's skip: the job is now approved, or waits again, on its merits.
      next.review.skipped = undefined;
      next.review.overruled = undefined;
    }
    next.audit = [...j.audit, { at: Date.now(), who: name, what: decision === 'approved' ? `Approved version ${j.versions.length}` : 'Requested changes' }];
    return {
      ...s,
      jobs: s.jobs.map((x) => (x.id === id ? next : x)),
      inbox: [
        {
          id: `i${Date.now()}`,
          kind: decision === 'approved' ? 'approved' : 'changes',
          jobId: id,
          title: `${name.split(' ')[0]} ${decision === 'approved' ? 'approved' : 'requested changes on'} ${j.facts.title}`,
          body:
            note ||
            (!isReviewable(j)
              ? 'The job is already published; their answer is in its history.'
              : decision === 'approved'
                ? 'Ready to publish.'
                : approved
                  ? 'An approval already given still stands under your rule; see the comments on the sections.'
                  : 'See the comments on the sections.'),
          at: Date.now(),
        },
        ...s.inbox,
      ],
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
      return { ...touched(x), sections, ...liveEdit(x), versions: [...x.versions, { n: x.versions.length + 1, at: Date.now(), note: label, sections }] };
    }),
  }));
}

/** A first draft of a language version, for the employer to review; never in the job's own language. */
export function addTranslation(id: string, lang: JobLang) {
  if (!ownerOnly()) return;
  const s = getState();
  const j0 = s.jobs.find((x) => x.id === id);
  if (!j0 || lang === jobLang(j0) || j0.translations?.[lang]) return;
  const english = englishFor(s, j0);
  updateJob(id, (j) => ({ ...j, translations: { ...j.translations, [lang]: draftTranslation(j, lang, english) }, audit: [...j.audit, { at: Date.now(), who: getState().me.name, what: `${langOf(lang).label} version drafted (simulated)` }] }));
}

/** "Update the French too": brings a version up to date with the job's own text, keeping the wording of lines whose source did not change. */
export function refreshTranslation(id: string, lang: JobLang) {
  if (!ownerOnly()) return;
  const s = getState();
  const j0 = s.jobs.find((x) => x.id === id);
  if (!j0) return;
  const english = englishFor(s, j0);
  updateJob(id, (j) => {
    const t = j.translations?.[lang];
    return t ? { ...j, translations: { ...j.translations, [lang]: redraftTranslation(j, t, lang, english) } } : j;
  });
}

/** "Keep the French as it is": the version is not changed, and the update is not offered again for this text. */
export function keepTranslation(id: string, lang: JobLang) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => {
    const t = j.translations?.[lang];
    return t ? { ...j, translations: { ...j.translations, [lang]: keptTranslation(j, t) } } : j;
  });
}

export function removeTranslation(id: string, lang: JobLang) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => {
    const rest = { ...j.translations };
    delete rest[lang];
    return { ...j, translations: rest };
  });
}

function withVersion(j: DemoJob, lang: JobLang, fn: (t: Translation) => Translation): DemoJob {
  const t = j.translations?.[lang];
  return t ? { ...j, translations: { ...j.translations, [lang]: { ...fn(t), reviewed: false } } } : j;
}

/** An edit to a version needs a new review. */
export function editTranslation(id: string, lang: JobLang, key: string, index: number | 'title', text: string) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => withVersion(j, lang, (t) => ({ ...t, sections: t.sections.map((sec) => (sec.key !== key ? sec : index === 'title' ? { ...sec, title: text } : { ...sec, lines: sec.lines.map((l, i) => (i === index ? text : l)) })) })));
}

/**
 * A version's own sections (section 19, 8 November 2026): each version can add, remove, and reorder sections within the job's JD format,
 * for content one country needs and another does not; the facts stay shared. A section added is drafted from the job's own text when
 * the job has it, and otherwise starts empty for the user or the AI to write.
 */
export function addVersionSection(id: string, lang: JobLang, key: string) {
  if (!ownerOnly() || !SECTION_BY_KEY[key]) return;
  const s = getState();
  const j0 = s.jobs.find((x) => x.id === id);
  const t0 = j0?.translations?.[lang];
  if (!j0 || !t0 || t0.sections.some((x) => x.key === key)) return;
  const drafted = draftVersionSection(j0, key, lang, englishFor(s, j0));
  const sec: Section = drafted ?? { key, title: headingIn(key, lang) ?? headingFor(key, formatOf(s, j0.format)), lines: [] };
  updateJob(id, (j) => withVersion(j, lang, (t) => ({ ...t, sections: inOutlineOrder([...t.sections, sec], outlineOrder([...t.sections.map((x) => x.key), key])) })));
}

export function removeVersionSection(id: string, lang: JobLang, key: string) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => withVersion(j, lang, (t) => (t.sections.length > 1 ? { ...t, sections: t.sections.filter((x) => x.key !== key) } : t)));
}

/** A version's sections in a new order, within their groups as in every JD format. */
export function reorderVersionSections(id: string, lang: JobLang, keys: string[]) {
  if (!ownerOnly()) return;
  updateJob(id, (j) =>
    withVersion(j, lang, (t) => {
      const queue = [...keys];
      const order = outlineOrder(t.sections.map((x) => (keys.includes(x.key) ? (queue.shift() ?? x.key) : x.key)));
      return { ...t, sections: inOutlineOrder(t.sections, order) };
    }),
  );
}

/** A version's section written or rewritten in the chat (by the AI when it is on). */
export function writeVersionSection(id: string, lang: JobLang, key: string, lines: string[]) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => withVersion(j, lang, (t) => ({ ...t, sections: t.sections.map((x) => (x.key === key ? { ...x, lines, ai: true } : x)) })));
}

/**
 * The job's own language, changed only when the user asks (section 19): the rules' sections are written again in it; text written by
 * hand or by the AI stays as it is, for the AI or the user to rewrite. A version in that language is no longer needed, so it goes.
 */
export function setJobLang(id: string, lang: JobLang) {
  if (!ownerOnly()) return;
  update((s) => ({
    ...s,
    jobs: s.jobs.map((j) => {
      if (j.id !== id || jobLang(j) === lang) return j;
      const rest = { ...j.translations };
      delete rest[lang];
      const next: DemoJob = { ...touched(j), lang, translations: rest, audit: [...j.audit, { at: Date.now(), who: s.me.name, what: `Written in ${langOf(lang).label} from now on` }] };
      return rebuilt(s, next);
    }),
  }));
}

/**
 * Further language versions bought after publishing, from the chat (section 19): a small checkout of their own, simulated; the receipt
 * goes to Billing. Before publishing they join the job's own checkout instead.
 */
export function buyLanguages(id: string, n: number, beforePublishing = false): boolean {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || s.reviewerAs || n < 1 || (beforePublishing ? j.choice !== 'amplify' : j.plan !== 'amplify')) return false;
  const item = `${n} more language ${n === 1 ? 'version' : 'versions'}: ${j.facts.title}`;
  update((st) => ({
    ...st,
    // Before publishing the count is added when it is published, with the job's own payment.
    jobs: st.jobs.map((x) => (x.id === id ? { ...x, langsPaid: (x.langsPaid ?? 0) + (beforePublishing ? 0 : n), audit: [...x.audit, { at: Date.now(), who: st.me.name, what: `Paid for ${item.split(':')[0]} (simulated)` }] } : x)),
    receipts: [{ id: `rc${Date.now()}`, at: Date.now(), item, amount: `${usd(n * LANGUAGE_PRICE)} (placeholder)` }, ...st.receipts],
  }));
  return true;
}

export function reviewTranslation(id: string, lang: JobLang) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => {
    const t = j.translations?.[lang];
    return t ? { ...j, translations: { ...j.translations, [lang]: { ...t, reviewed: true } }, audit: [...j.audit, { at: Date.now(), who: getState().me.name, what: `${langOf(lang).label} version reviewed` }] } : j;
  });
}

/** Who may publish without approval: only where approval is required, only the owner, and never when the organisation says nobody can skip it. */
export function canSkipApproval(s: State, j: DemoJob): boolean {
  return !s.reviewerAs && s.me.role === 'owner' && !s.org.noSkip && approvalRequired(s, j) && !approvedFor(s, j);
}

/** Publishing without approval: the reason is kept in the job's history (never public), and the reviewers asked are told. */
export function overrideApproval(id: string, reason: string): boolean {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || !canSkipApproval(s, j) || reason.trim().length < 5) return false;
  update((st) => ({
    ...st,
    jobs: st.jobs.map((x) => (x.id === id ? { ...x, status: 'approved', review: { ...x.review, state: 'approved', skipped: reason.trim() }, audit: [...x.audit, { at: Date.now(), who: st.me.name, what: `Approval skipped by the owner. Reason: "${reason.trim()}"` }] } : x)),
  }));
  return true;
}

/** Under "any one reviewer": the job is approved, and another reviewer has asked for changes. Null otherwise. */
export function changesAfterApproval(j: DemoJob): { approvers: string[]; askers: Array<{ name: string; note?: string }> } | null {
  const approvers = j.review.reviewers.filter((r) => r.decision === 'approved').map((r) => r.name);
  const askers = j.review.reviewers.filter((r) => r.decision === 'changes').map((r) => ({ name: r.name, note: r.note }));
  return approvers.length && askers.length && isApproved(j) ? { approvers, askers } : null;
}

/** "Publish anyway" over a request for changes: the reason (optional) goes into the history when it is published. */
export function overruleChanges(id: string, reason: string) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => ({ ...j, review: { ...j.review, overruled: reason.trim() } }));
}

/**
 * What publishing writes about its review: a skipped approval, or an approval published over a later request for changes. The history
 * says so, and the reviewers concerned are told.
 */
function reviewOnPublish(x: DemoJob, me: string): { audit: DemoJob['audit']; notice?: string } {
  if (x.review.skipped) {
    const asked = x.review.reviewers.map((r) => r.name.split(' ')[0]);
    return {
      audit: [...x.audit, { at: Date.now(), who: me, what: `Published without approval. Reason: "${x.review.skipped}"${asked.length ? `; ${asked.join(' and ')} told (simulated)` : ''}` }],
      notice: asked.length ? `${asked.join(' and ')} ${asked.length === 1 ? 'is' : 'are'} told it was published without their approval (simulated).` : undefined,
    };
  }
  const open = changesAfterApproval(x);
  if (!open) return { audit: x.audit };
  const askers = open.askers.map((a) => a.name.split(' ')[0]).join(' and ');
  const reason = x.review.overruled ? `. Reason: "${x.review.overruled}"` : '';
  return {
    audit: [...x.audit, { at: Date.now(), who: me, what: `Published with ${askers}'s request for changes still open${reason}; ${askers} told (simulated)` }],
    notice: `${askers} ${open.askers.length === 1 ? 'is' : 'are'} told it was published with their request for changes open (simulated).`,
  };
}

/**
 * How a paid job is paid for: `direct` when this job was just paid for at the checkout (one job, or an extra job on the subscription),
 * `onHand` to use a job from a pack or the subscription.
 */
export type Paid = 'direct' | 'onHand';

/** `langs`: language versions beyond those included, paid in the same checkout. */
export type PublishOptions = { plan: Plan; schedule: string | null; paid?: Paid; langs?: number };

/**
 * Free or Amplify, chosen before publishing (section 19, step 8), in the chat or from its part on the line. Amplify only for a verified
 * organisation; Free only while the month has a free job for it. Choosing Free after Amplify keeps Amplify's work, hidden until it is
 * chosen again. The reason when it cannot be chosen.
 */
export function chooseBlock(s: State, j: DemoJob, plan: Plan): string | null {
  if (s.reviewerAs) return 'Reviewers cannot choose how it is published';
  if (plan === 'amplify' && !s.org.verified) return 'Amplify is for verified organisations: verify yours in Organisation settings';
  if (plan === 'free' && j.paidFor) return 'It is already paid for, so it goes out with Amplify';
  if (plan === 'free' && !canGoFree(s, j.id, j.publishOn ?? null)) return `Both free jobs for ${monthName(monthFor(s, j.publishOn ?? null))} are used: Amplify, or a package job, publishes it now`;
  return null;
}

export function setChoice(id: string, plan: Plan, said?: string): boolean {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j) return false;
  const no = chooseBlock(s, j, plan);
  if (no) {
    if (said) updateJob(id, (x) => ({ ...x, chat: [...x.chat, msg('user', said), msg('ai', `${no}.`)] }));
    return false;
  }
  updateJob(id, (x) => ({
    ...x,
    choice: plan,
    ...(plan === 'free' && x.publishOn && freeMonthBlock(s, x.publishOn) ? { publishOn: undefined } : {}),
    walk: x.walk ? { ...x.walk, settled: Array.from(new Set([...x.walk.settled, 'plan'])) } : x.walk,
    chat: said ? [...x.chat, msg('user', said), msg('ai', plan === 'free' ? "Free it is. A free job is used only when it's published." : "Amplify it is. Let's go through what it adds, one at a time.")] : x.chat,
  }));
  ensureAsk(id);
  return true;
}

/** The date to publish on, or none for now; checked again when it is published. */
export function setPublishOn(id: string, date: string | null) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => ({ ...j, publishOn: date ?? undefined }));
}

/** How Amplify is paid: one job, a pack, or the subscription. */
export function setPayWith(id: string, key: PackageKey) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => ({ ...j, payWith: key }));
}

/**
 * Kept for next time (section 19, step 10): the fixed text or the way to apply, kept for every job or for this one only. Offered once;
 * only the owner may keep it. Each new job starts with what is kept; jobs already published keep their own.
 */
export function keepForAll(id: string, what: 'fixed' | 'apply', keep: boolean, said?: string) {
  const s0 = getState();
  const j0 = s0.jobs.find((x) => x.id === id);
  if (!j0 || s0.reviewerAs || s0.me.role !== 'owner') return;
  update((s) => ({
    ...s,
    org: {
      ...s.org,
      keepOffered: Array.from(new Set([...(s.org.keepOffered ?? []), what])),
      ...(keep && what === 'fixed' ? { keptFixed: [...j0.commitments] } : {}),
      ...(keep && what === 'apply' ? { keptApply: { ...j0.apply } } : {}),
    },
    jobs: s.jobs.map((x) => (x.id === id && said ? { ...x, chat: [...x.chat, msg('user', said), msg('ai', keep ? 'Kept for every job. You can change or lock it in Organisation settings.' : 'Fine: this job only.')] } : x)),
  }));
  ensureAsk(id);
}

/** What is kept no longer applies to new jobs (from Organisation settings). */
export function stopKeeping(what: 'fixed' | 'apply') {
  if (getState().me.role !== 'owner') return;
  update((s) => ({ ...s, org: { ...s.org, ...(what === 'fixed' ? { keptFixed: undefined } : { keptApply: undefined }) } }));
}

/** The fixed texts kept for every job, edited in Organisation settings. */
export function setKeptFixed(keys: string[]) {
  if (getState().me.role !== 'owner') return;
  update((s) => ({ ...s, org: { ...s.org, keptFixed: keys } }));
}

/** The way to apply kept for every job, edited in Organisation settings. */
export function setKeptApply(patch: Partial<ApplySettings>) {
  if (getState().me.role !== 'owner') return;
  update((s) => (s.org.keptApply ? { ...s, org: { ...s.org, keptApply: { ...s.org.keptApply, ...patch } } } : s));
}

/** A part of steps 8 and 9 answered ("No other languages", "No thanks", "No review"), with the reply. */
export function settleLater(id: string, what: string, said?: string, reply?: string) {
  if (!ownerOnly()) return;
  settle(id, what, said ?? '', reply);
  ensureAsk(id);
}

/** A market or full advert check point left as it is: nothing changes, and the check moves on. */
export function leaveAmplifyPoint(id: string, kind: 'market' | 'full', key: string, said?: string) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => (j.walk ? { ...j, walk: { ...j.walk, skipped: Array.from(new Set([...(j.walk.skipped ?? []), `${kind}:${key}`])) }, chat: said ? [...j.chat, msg('user', said), msg('ai', 'Left as it is.')] : j.chat } : j));
  ensureAsk(id);
}

/** A message from the window itself (a tab opened, a step done by a button), so the chat says what happened and goes on. */
export function windowSays(id: string, said: string | null, reply: string) {
  if (!ownerOnly()) return;
  updateJob(id, (x) => ({ ...x, chat: [...x.chat, ...(said ? [msg('user', said)] : []), msg('ai', reply)] }));
  ensureAsk(id);
}

/** A job paid directly is one job (one language version included); a pack or subscription job includes two. */
function viaOf(paid: Paid | undefined, j: DemoJob): DemoJob['paidVia'] {
  return j.paidFor ? (j.paidVia ?? 'single') : paid === 'onHand' ? 'package' : 'single';
}

/** A publishing date must be from tomorrow, and before the job closes; the date picker's limits alone can be typed past. */
export function scheduleBlock(s: State, j: DemoJob, schedule: string | null): string | null {
  if (!schedule) return null;
  if (schedule <= isoDay(s.today)) return 'Choose a date from tomorrow';
  if (j.facts.deadline && schedule >= j.facts.deadline) return 'It would close before it goes live';
  return null;
}

/** A free job is published in its own month: scheduled for later this month at most (decided by the user, 7 November 2026). */
export function freeMonthBlock(s: State, schedule: string | null): string | null {
  return schedule && schedule.slice(0, 7) !== currentMonth(s) ? `A free job goes live within ${monthName(currentMonth(s))}` : null;
}

/** Whether the job can be published with these options; the reason when it cannot. */
export function publishBlock(s: State, id: string, o: PublishOptions): string | null {
  const j = s.jobs.find((x) => x.id === id);
  if (!j || s.reviewerAs) return 'Only your organisation can publish';
  if (j.status === 'live' || j.status === 'scheduled' || j.status === 'closed') return 'Already published';
  if (approvalRequired(s, j) && !approvedFor(s, j)) return 'Waiting for approval';
  const block = scheduleBlock(s, j, o.schedule);
  if (block) return block;
  if (o.plan === 'amplify' && !s.org.verified) return 'Verify your organisation to amplify';
  if (o.plan === 'free' && freeMonthBlock(s, o.schedule)) return freeMonthBlock(s, o.schedule);
  if (o.plan === 'free' && !canGoFree(s, id, o.schedule)) return 'No free job left for that month';
  if (o.plan === 'amplify' && j.paidFor) return null;
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
  let told: string | undefined;
  update((s0) => {
    const prepaid = o.plan === 'amplify' && Boolean(s0.jobs.find((x) => x.id === id)?.paidFor);
    // A free job scheduled holds its month's place (plans.freeHolds); it is used only when it goes live.
    let s = o.plan === 'free' && !o.schedule ? useFree(s0, id) : s0;
    if (o.plan === 'amplify' && o.paid === 'onHand' && !prepaid) s = takePaidJob(s);
    const how = o.plan === 'amplify' ? `Amplified (${prepaid ? 'already paid' : o.paid === 'onHand' ? 'a package job' : 'paid'}), listed ${LISTED_DAYS.amplify} days` : `Free, listed ${LISTED_DAYS.free} days`;
    const jobs = s.jobs.map((x) => {
      if (x.id !== id) return x;
      const skipped = reviewOnPublish(x, s.me.name);
      told = skipped.notice;
      const next: DemoJob = {
        ...x,
        status: o.schedule ? 'scheduled' : 'live',
        plan: o.plan,
        scheduledFor: o.schedule ?? undefined,
        publishedAt: o.schedule ? undefined : Date.now(),
        published: o.schedule ? undefined : { facts: x.facts, sections: x.sections, at: Date.now() },
        ...(o.plan === 'amplify' ? { paidVia: viaOf(o.paid, x), langsPaid: (x.langsPaid ?? 0) + (o.langs ?? 0) } : {}),
        paidFor: undefined,
        payRequest: undefined,
        review: { ...x.review, skipped: undefined, overruled: undefined },
        audit: [...skipped.audit, { at: Date.now(), who: s.me.name, what: `${o.schedule ? `Scheduled for ${longDate(o.schedule)}` : 'Published'}: ${how}` }],
      };
      if (o.plan !== 'amplify') return next;
      const reach = reachAtGoLive(next, o.schedule);
      sending = Boolean(reach.reach && !o.schedule);
      return { ...next, ...reach };
    });
    const out = jobs.find((x) => x.id === id);
    if (!out) return { ...s, jobs };
    const profile = profileOf(out);
    const saved = `Saved as a job profile for next time: ${out.facts.title}${out.facts.location ? `, ${out.facts.location.split(',')[0]}` : ''}.`;
    return {
      ...s,
      jobs,
      profiles: [profile, ...(s.profiles ?? []).filter((p) => !(p.title === profile.title && p.location === profile.location))],
      notice: { text: told ? `${told} ${saved}` : saved, unprofile: profile.id },
    };
  });
  if (sending) simulateDelivery(id);
  return true;
}

/**
 * A job profile (section 19, step 10): the role's facts and choices, saved automatically when the job is published, with a visible
 * note and Undo, for the next job like it. The closing date, dates, and positions are left out: they change from job to job.
 */
function profileOf(j: DemoJob): JobProfile {
  const { deadline: _deadline, closingTime: _time, startDate: _start, positions: _positions, ...facts } = j.facts;
  return { id: `pf-${j.id}-${Date.now()}`, from: j.id, title: j.facts.title, location: j.facts.location, family: j.family, format: j.format, tags: [...j.tags], facts, style: j.style, apply: j.apply, commitments: [...j.commitments], lang: j.lang, at: Date.now() };
}

/** Undo for a job profile just saved. */
export function forgetProfile(profileId: string) {
  update((s) => ({ ...s, profiles: (s.profiles ?? []).filter((p) => p.id !== profileId), notice: { text: 'The job profile was not kept.' } }));
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

/** "Ask to pay": someone else pays from a link; the job waits until then. Not while approval is still needed. */
export function askToPay(id: string, req: Omit<PayRequest, 'at'>): boolean {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || s.reviewerAs || (approvalRequired(s, j) && !approvedFor(s, j) && j.status !== 'live' && j.status !== 'scheduled')) return false;
  update((st) => ({
    ...st,
    jobs: st.jobs.map((x) => (x.id === id ? { ...x, payRequest: { ...req, at: Date.now() }, audit: [...x.audit, { at: Date.now(), who: st.me.name, what: `Asked ${req.name} to pay ${req.amount} (simulated)` }] } : x)),
    notice: { text: `Sent to ${req.name} (simulated). The job publishes once they have paid.` },
  }));
  return true;
}

export function remindPayer(id: string) {
  const j = getState().jobs.find((x) => x.id === id);
  if (!j?.payRequest || !ownerOnly()) return;
  const name = j.payRequest.name;
  update((s) => ({ ...s, jobs: s.jobs.map((x) => (x.id === id && x.payRequest ? { ...x, payRequest: { ...x.payRequest, reminded: Date.now() } } : x)), notice: { text: `Reminded ${name} (simulated)` } }));
}

export function cancelPayRequest(id: string) {
  if (!ownerOnly()) return;
  updateJob(id, (j) => ({ ...j, payRequest: undefined, audit: j.payRequest ? [...j.audit, { at: Date.now(), who: getState().me.name, what: `Cancelled the payment request to ${j.payRequest.name}` }] : j.audit }));
}

/**
 * The person asked has paid from their link (simulated): the receipt goes to them, and the job publishes, or a live free job is amplified,
 * with any Reach invitations prepared. Nothing is charged if the job can no longer be published.
 */
export function completePayRequest(id: string): boolean {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  const req = j?.payRequest;
  if (!j || !req) return false;
  const how: Paid = req.key === 'one' || req.key === 'extra' ? 'direct' : 'onHand';
  const upgrade = j.plan === 'free' && (j.status === 'live' || j.status === 'scheduled');
  // Paid after the date asked for: the job goes live now rather than not at all.
  const schedule = req.schedule && req.schedule > isoDay(s.today) ? req.schedule : null;
  if (upgrade ? !s.org.verified : publishBlock(s, id, { plan: 'amplify', schedule, paid: 'direct' })) return false;
  buy(req.key, j.facts.title, req.langs ?? 0);
  const ok = upgrade ? amplifyLive(id, how, req.langs ?? 0) : publish(id, { plan: 'amplify', schedule, paid: how, langs: req.langs ?? 0 });
  if (!ok) return false;
  update((st) => ({
    ...st,
    jobs: st.jobs.map((x) => (x.id === id ? { ...x, payRequest: undefined, audit: [...x.audit, { at: Date.now(), who: req.name, what: `Paid ${req.amount} from the payment link (simulated)` }] } : x)),
    inbox: [{ id: `i${Date.now()}`, kind: 'receipt', jobId: id, title: `${req.name.split(' ')[0]} paid ${req.amount}: ${j.facts.title} is ${schedule && !upgrade ? 'scheduled' : 'live'}`, body: 'The receipt and invoice went to them (simulated).', at: Date.now() }, ...st.inbox],
  }));
  return true;
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
export function amplifyLive(id: string, paid: Paid, langs = 0): boolean {
  const s0 = getState();
  const j = s0.jobs.find((x) => x.id === id);
  if (!j || s0.reviewerAs || !s0.org.verified || j.plan !== 'free' || (j.status !== 'live' && j.status !== 'scheduled')) return false;
  if (paid === 'onHand' && !nextPaidJob(s0)) return false;
  const sendsOn = j.status === 'scheduled' ? (j.scheduledFor ?? null) : null;
  let sending = false;
  update((s1) => {
    const s = paid === 'onHand' ? takePaidJob(s1) : s1;
    return {
      ...s,
      jobs: s.jobs.map((x) => {
        if (x.id !== id) return x;
        const next: DemoJob = { ...x, plan: 'amplify', paidVia: viaOf(paid, x), langsPaid: (x.langsPaid ?? 0) + langs, payRequest: undefined, audit: [...x.audit, { at: Date.now(), who: s.me.name, what: `Amplified (${paid === 'onHand' ? 'a package job' : 'paid'}): listed ${LISTED_DAYS.amplify} days from publishing` }] };
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
  return rebuilt(s, { ...touched(j), facts: { ...j.facts, deadline }, ...liveEdit(j), audit: [...j.audit, { at: Date.now(), who: s.me.name, what }] });
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

/** Closes a live or scheduled job. `note` (a withdrawal's reason) goes into the job's history, which is never public. */
export function closeJob(id: string, reason: 'early' | 'filled' | 'withdrawn', tellReach = false, note = '') {
  const j = getState().jobs.find((x) => x.id === id);
  if (!j || !ownerOnly()) return;
  // A closing notice is a Reach email like any other: it counts toward the job's allowance, and is sent only when there is room.
  const count = invitedCount(j);
  const tell = tellReach && count > 0 && count <= reachRoom(j);
  const label = `${reason === 'filled' ? 'Position filled' : reason === 'withdrawn' ? 'Withdrawn' : 'Closed early'}${note.trim() ? `. Reason: "${note.trim()}"` : ''}${tell ? `; the ${count} people Reach invited were told (simulated)` : ''}`;
  const short = reason === 'filled' ? 'position filled' : reason === 'withdrawn' ? 'withdrawn' : 'closed early';
  changeWithUndo(`${j.facts.title}: ${short}${tell ? `; the ${count} people Reach invited are told (simulated)` : ''}`, (st) => ({
    ...st,
    jobs: st.jobs.map((x) =>
      x.id === id
        ? {
            ...x,
            status: 'closed',
            closedAt: st.today,
            closeReason: reason,
            payRequest: undefined,
            reach: tell && x.reach ? { ...x.reach, updates: [...(x.reach.updates ?? []), { at: Date.now(), count, what: short }] } : x.reach,
            audit: [...x.audit, { at: Date.now(), who: st.me.name, what: label }],
          }
        : x,
    ),
    inbox: st.inbox.map((i) => (i.jobId === id && i.kind === 'deadline' ? { ...i, done: true } : i)),
  }));
}

export function letClose(id: string) {
  update((s) => ({ ...s, inbox: s.inbox.map((i) => (i.jobId === id && i.kind === 'deadline' ? { ...i, done: true } : i)), notice: { text: 'It will close on its date. Nothing else to do.' } }));
}

function waitingEmails(j: DemoJob): number {
  return [...(j.reach?.candidates ?? []), ...(j.reach?.team ?? [])].filter((r) => r.status === 'waiting').length;
}

/** A scheduled job goes live today: its Reach emails waiting for go-live are sent now, and it is listed from today. */
export function publishNow(id: string): boolean {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || s.reviewerAs || j.status !== 'scheduled') return false;
  const waiting = waitingEmails(j);
  const was = j.scheduledFor ? longDate(j.scheduledFor) : 'its date';
  update((st0) => {
    const st = holdToUse(st0, id);
    const queue = (r: Recipient): Recipient => (r.status === 'waiting' ? { ...r, status: 'queued' } : r);
    return {
      ...st,
      jobs: st.jobs.map((x) =>
        x.id === id
          ? {
              ...x,
              status: 'live',
              publishedAt: Date.now(),
              scheduledFor: undefined,
              published: { facts: x.facts, sections: x.sections, at: Date.now() },
              reach: x.reach ? { ...x.reach, candidates: x.reach.candidates.map(queue), team: x.reach.team.map(queue), rounds: x.reach.rounds.map((r) => (r.sendsOn ? { ...r, sendsOn: undefined, at: Date.now() } : r)) } : x.reach,
              audit: [...x.audit, { at: Date.now(), who: st.me.name, what: `Published now instead of on ${was}${waiting ? `; ${waiting} Reach ${waiting === 1 ? 'email' : 'emails'} sent now (simulated)` : ''}` }],
            }
          : x,
      ),
      notice: { text: `${j.facts.title} is live${waiting ? `; ${waiting} Reach ${waiting === 1 ? 'email is' : 'emails are'} being sent (simulated)` : ''}.` },
    };
  });
  if (waiting) simulateDelivery(id);
  return true;
}

/** Why a scheduled job cannot move to `date`: the same checks as scheduling; a free job stays within this month. */
export function rescheduleBlock(s: State, j: DemoJob, date: string): string | null {
  if (!date) return 'Choose a date';
  if (date === j.scheduledFor) return 'Choose a new date';
  return scheduleBlock(s, j, date) ?? (j.plan === 'free' ? freeMonthBlock(s, date) : null);
}

/** Moves a scheduled job to another date; Reach emails waiting for go-live move with it. */
export function reschedule(id: string, date: string): boolean {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || s.reviewerAs || j.status !== 'scheduled' || rescheduleBlock(s, j, date)) return false;
  const was = j.scheduledFor ? longDate(j.scheduledFor) : 'its date';
  changeWithUndo(`${j.facts.title} now goes live on ${longDate(date)}.`, (st) => ({
    ...st,
    jobs: st.jobs.map((x) =>
      x.id === id
        ? {
            ...x,
            scheduledFor: date,
            reach: x.reach ? { ...x.reach, rounds: x.reach.rounds.map((r) => (r.sendsOn ? { ...r, sendsOn: date } : r)) } : x.reach,
            audit: [...x.audit, { at: Date.now(), who: st.me.name, what: `Moved from ${was} to ${longDate(date)}` }],
          }
        : x,
    ),
  }));
  return true;
}

/**
 * A scheduled job as a draft again: no go-live; the Reach emails waiting for it go back to the prepared list, unsent, and their round is
 * dropped; a paid job stays paid; an open payment request is cancelled. Used by Back to draft and by restoring a deleted scheduled job.
 */
function asDraft(x: DemoJob, who: string, what: string): DemoJob {
  const r = x.reach;
  const waiting = (e: Recipient) => e.status === 'waiting';
  const candidates = r?.candidates.filter(waiting).map((e) => e.email) ?? [];
  const team = r?.team.filter(waiting).map((e) => e.email) ?? [];
  const kept = r ? { ...r, candidates: r.candidates.filter((e) => !waiting(e)), team: r.team.filter((e) => !waiting(e)), rounds: r.rounds.filter((n) => !n.sendsOn) } : null;
  return {
    ...x,
    status: hasApproval(x) ? 'approved' : 'draft',
    plan: x.plan === 'amplify' ? 'amplify' : null,
    paidFor: x.plan === 'amplify' ? true : undefined,
    scheduledFor: undefined,
    reach: kept && (kept.candidates.length || kept.team.length || kept.rounds.length) ? kept : null,
    reachPlan: r && (candidates.length || team.length) ? { candidates, team, candidateMsg: r.candidateMsg, teamMsg: r.teamMsg } : x.reachPlan,
    payRequest: undefined,
    audit: [...x.audit, { at: Date.now(), who, what: `${what}${x.payRequest ? `; the request to ${x.payRequest.name} to pay was cancelled` : ''}` }],
  };
}

/** A scheduled job back to a draft: it will not go live; its Reach emails stay prepared, unsent; a paid job stays paid, a free one counted. */
export function backToDraft(id: string): boolean {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || s.reviewerAs || j.status !== 'scheduled') return false;
  const was = j.scheduledFor ? longDate(j.scheduledFor) : 'its date';
  changeWithUndo(`${j.facts.title} is back to a draft. It will not go live on ${was}.`, (st) => ({
    ...st,
    jobs: st.jobs.map((x) => (x.id === id ? asDraft(x, st.me.name, `Back to a draft; it will not go live on ${was}`) : x)),
  }));
  return true;
}

/** Tells the people Reach invited about the latest important change (decision 7): shown first, never automatic, once per change. */
export function tellInvited(id: string): boolean {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || s.reviewerAs) return false;
  const offer = tellOffer(j);
  if (!offer || offer.count > REACH_EMAILS - reachUsed(j)) return false;
  const what = changeSummary(offer.changes);
  update((st) => ({
    ...st,
    jobs: st.jobs.map((x) =>
      x.id === id && x.reach
        ? {
            ...x,
            reach: { ...x.reach, updates: [...(x.reach.updates ?? []), { at: Date.now(), count: offer.count, what }] },
            reachTold: [...(x.reachTold ?? []), offer.key],
            audit: [...x.audit, { at: Date.now(), who: st.me.name, what: `Told the ${offer.count} people Reach invited about the change: ${what} (simulated)` }],
          }
        : x,
    ),
    notice: { text: `${offer.count} people told about the change (simulated).` },
  }));
  return true;
}

/** "Not now" on that offer: it does not come back for this change. */
export function declineTell(id: string) {
  const j = getState().jobs.find((x) => x.id === id);
  const offer = j ? tellOffer(j) : null;
  if (!offer || !ownerOnly()) return;
  updateJob(id, (x) => ({ ...x, reachDeclined: [...(x.reachDeclined ?? []), offer.key] }));
}

/** A free job's listing ends before its closing date: it closes on its last listed day instead, for free (decision 3). */
export function closeAtListingEnd(id: string) {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || !ownerOnly() || j.status !== 'live' || j.plan !== 'free') return;
  const end = listingEnd(j, s.today);
  if (!j.facts.deadline || j.facts.deadline <= end) return;
  changeWithUndo(`${j.facts.title}: now closes on ${longDate(end)}, its last listed day`, (st) => ({
    ...st,
    jobs: st.jobs.map((x) => (x.id === id ? extended(st, x, end, `Closing date moved to ${longDate(end)}, its last listed day`) : x)),
  }));
}

/** "Let it leave the list": no more reminders; after its last listed day it leaves AidJobs' lists and search, its page still open from links. */
export function letLeaveList(id: string) {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || !ownerOnly() || j.plan !== 'free') return;
  const end = longDate(listingEnd(j, s.today));
  changeWithUndo(`${j.facts.title} leaves AidJobs' lists after ${end}. Its page still opens from links, with the apply button.`, (st) => ({
    ...st,
    jobs: st.jobs.map((x) => (x.id === id ? { ...x, listingChoice: 'leave', audit: [...x.audit, { at: Date.now(), who: st.me.name, what: `Chose to let it leave AidJobs' lists after ${end}; its page stays open from links` }] } : x)),
  }));
}

/** Why a closed job cannot reopen with this closing date; `amplify` reopens a free job whose listing period has ended. */
export function reopenBlock(s: State, j: DemoJob, deadline: string, amplify = false): string | null {
  if (s.reviewerAs) return 'Reviewers cannot reopen jobs';
  if (!canReopen(j, s.today)) return j.closeReason === 'filled' ? 'A filled position uses Hire again' : 'Reopen is for the 14 days after closing';
  if (!deadline || deadline <= isoDay(s.today)) return 'Choose a closing date from tomorrow';
  // Amplify lists a job for 100 days from when it was first published: once even that has passed, only Hire again publishes it anew.
  if (listingEnd({ ...j, plan: 'amplify' }, s.today) < isoDay(s.today)) return 'Its listing period has ended: use Hire again';
  if (amplify) return j.plan === 'free' && !s.org.verified ? 'Verify your organisation to amplify' : null;
  if (j.plan === 'free' && listingEnd(j, s.today) < isoDay(s.today)) return 'Its free listing period has ended';
  return null;
}

/**
 * Reopens a closed job within its 14 days (decision 5, a proposal needing a contract decision before production): same address, a new
 * closing date, a "Reopened" note in its history. A free job keeps its original listing period; Reach is not sent again.
 */
export function reopen(id: string, deadline: string, amplify = false, paid?: Paid): boolean {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || reopenBlock(s, j, deadline, amplify)) return false;
  const upgrade = amplify && j.plan === 'free';
  // Amplifying needs payment: a package job on hand, or paid just now at the simulated checkout (`direct`).
  if (upgrade && (!paid || (paid === 'onHand' && !nextPaidJob(s)))) return false;
  const onHand = upgrade && paid === 'onHand';
  const what = `Reopened, now closing ${longDate(deadline)}${upgrade ? `; amplified (${onHand ? 'a package job' : 'paid'})` : ''}. Reach was not sent again`;
  const change = (st: State): State => ({
    ...(onHand ? takePaidJob(st) : st),
    jobs: st.jobs.map((x) =>
      x.id === id
        ? rebuilt(st, { ...x, status: 'live', closedAt: undefined, closeReason: undefined, plan: upgrade ? 'amplify' : x.plan, facts: { ...x.facts, deadline }, updatedAfterPublish: true, editedAt: Date.now(), audit: [...x.audit, { at: Date.now(), who: st.me.name, what }] })
        : x,
    ),
    inbox: st.inbox.map((i) => (i.jobId === id && i.kind === 'removal' ? { ...i, done: true } : i)),
  });
  const text = `${j.facts.title} is open again until ${longDate(deadline)}, at the same address.`;
  if (upgrade) update((st) => ({ ...change(st), notice: { text } }));
  else changeWithUndo(text, change);
  return true;
}

/** Anyone who can publish deletes drafts and jobs in review; only the owner deletes a scheduled, live, or closed job; reviewers never. */
export function canDelete(s: State, j: DemoJob): string | null {
  if (s.reviewerAs) return 'Reviewers cannot delete jobs';
  if (isPublished(j) && s.me.role !== 'owner') return 'Only the owner can delete a job that has been published';
  return null;
}

/** Restoring follows the same rule as deleting, judged by what the job was when deleted (a scheduled job is kept as a draft). */
export function canRestore(s: State, d: DeletedJob): string | null {
  if (s.reviewerAs) return 'Reviewers cannot restore jobs';
  const wasPublished = d.was ? d.was === 'scheduled' || d.was === 'live' || d.was === 'closed' : isPublished(d.job);
  if (wasPublished && s.me.role !== 'owner') return 'Only the owner can restore a job that had been published or scheduled';
  return null;
}

/** The people a deletion can be told to, by group. */
export function involved(s: State, j: DemoJob): { reviewers: string[]; payer: string | null; reach: number; team: string[] } {
  const reviewers = j.review.reviewers.map((r) => r.name);
  return {
    reviewers,
    payer: j.payRequest?.name ?? null,
    reach: invitedCount(j),
    team: s.team.filter((p) => p.id !== s.me.id && !reviewers.includes(p.name)).map((p) => p.name),
  };
}

export type Tell = { reviewers?: boolean; payer?: boolean; reach?: boolean; team?: boolean };

/**
 * Deletes a job at any stage (plan section 17, decision 2). It goes to Recently deleted for 14 days, without its pending payment request,
 * its emails waiting for go-live, and its inbox items. Receipts and the free job counted for its month stay; a job once published leaves
 * a "no longer available" answer for links already shared; one line goes into the activity log; the people chosen are told (simulated).
 */
export function deleteJob(id: string, tell: Tell = {}): boolean {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || canDelete(s, j)) return false;
  const people = involved(s, j);
  if (tell.reach && people.reach > reachRoom(j)) tell = { ...tell, reach: false };
  const told = [...(tell.reviewers ? people.reviewers : []), ...(tell.payer && people.payer ? [people.payer] : []), ...(tell.reach && people.reach ? [`the ${people.reach} people Reach invited`] : []), ...(tell.team ? people.team : [])];
  // A scheduled job is kept as a draft: its go-live is cancelled, and its waiting emails go back to the prepared list, unsent.
  const sent = (r: Recipient) => r.status !== 'waiting';
  const base: DemoJob =
    j.status === 'scheduled'
      ? asDraft(j, s.me.name, `Deleted while scheduled for ${j.scheduledFor ? longDate(j.scheduledFor) : 'its date'}; its go-live was cancelled`)
      : { ...j, payRequest: undefined, reach: j.reach ? { ...j.reach, candidates: j.reach.candidates.filter(sent), team: j.reach.team.filter(sent) } : j.reach };
  const notified = tell.reach && people.reach && base.reach ? { ...base.reach, updates: [...(base.reach.updates ?? []), { at: Date.now(), count: people.reach, what: 'Deleted' }] } : base.reach;
  const kept: DemoJob = { ...base, reach: notified };
  const title = j.facts.title || 'untitled job';
  update((st) => ({
    ...st,
    jobs: st.jobs.filter((x) => x.id !== id),
    deleted: [{ job: kept, at: Date.now(), by: st.me.name, told, was: j.status }, ...(st.deleted ?? [])],
    gone: isPublished(j) ? [...new Set([...(st.gone ?? []), id])] : st.gone,
    activity: [{ at: Date.now(), who: st.me.name, what: `Deleted "${title}"${told.length ? `; told ${told.join(', ')} (simulated)` : ''}` }, ...(st.activity ?? [])],
    inbox: st.inbox.filter((i) => i.jobId !== id),
    notice: { text: `Deleted "${title}". It is in Recently deleted for 14 days.`, restore: id },
  }));
  return true;
}

/** Brings back a deleted job, at the same address, within its 14 days. */
export function restoreDeleted(id: string): boolean {
  const s = getState();
  const d = (s.deleted ?? []).find((x) => x.job.id === id);
  if (!d || canRestore(s, d)) return false;
  const title = d.job.facts.title || 'untitled job';
  update((st) => ({
    ...st,
    jobs: [d.job, ...st.jobs],
    deleted: (st.deleted ?? []).filter((x) => x.job.id !== id),
    gone: (st.gone ?? []).filter((x) => x !== id),
    activity: [{ at: Date.now(), who: st.me.name, what: `Restored "${title}"${d.was === 'scheduled' ? ' as a draft' : ''}` }, ...(st.activity ?? [])],
    notice: { text: d.was === 'scheduled' ? `Restored "${title}" as a draft. Its go-live stays cancelled: publish it again when you are ready.` : `Restored "${title}".` },
  }));
  return true;
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
    chat: [msg('ai', place ? `A copy of ${j.facts.title} for ${facts.location}. Check the duty-station details, then publish.` : `A new draft from ${j.facts.title}, with a new closing date, ${longDate(facts.deadline)}.`)],
    createdAt: Date.now(),
    publishedAt: undefined,
    closedAt: undefined,
    closeReason: undefined,
    updatedAfterPublish: false,
    editedAt: undefined,
    published: undefined,
    reachTold: undefined,
    reachDeclined: undefined,
    listingChoice: undefined,
    paidFor: undefined,
    translations: undefined,
    reachPlan: undefined,
    reachDismissed: undefined,
    reachReminders: undefined,
    scheduledFor: undefined,
    payRequest: undefined,
    lastChange: undefined,
    audit: [{ at: Date.now(), who: s.me.name, what: place ? `Created from ${j.facts.title} (${j.facts.location})` : `Hired again from ${j.facts.title}` }],
  };
  copy.versions = [{ n: 1, at: Date.now(), note: place ? `Variant for ${facts.location}` : 'Hired again', sections: copy.sections }];
  update((st) => ({ ...st, jobs: [copy, ...st.jobs] }));
  return nid;
}

/**
 * A copy of the job description: a free job's once it is published, a paid job's once it is paid, even before it goes live (section 19,
 * 8 November 2026). Copying text from the screen is not prevented. The reason when it cannot be downloaded yet.
 */
export function downloadBlock(j: DemoJob): string | null {
  if (!j.sections.length) return 'There is no job description to download yet';
  if (isPublished(j) || j.paidFor) return null;
  return 'A copy can be downloaded once the job is published, or with Amplify as soon as it is paid';
}

/** Downloads a copy when it may be downloaded; otherwise says when it can be (`say`), and returns false. */
export function downloadCopy(j: DemoJob, orgName: string, say = false): boolean {
  const no = downloadBlock(j);
  if (no) {
    if (say) notify(`${no}.`);
    return false;
  }
  const text = [j.facts.title, `${orgName} · ${j.facts.location}`, j.facts.deadline ? `Closing date: ${longDate(j.facts.deadline)}` : '', '', ...j.sections.flatMap((s) => [s.title.toUpperCase(), ...s.lines.map((l) => (l.startsWith('- ') ? `• ${l.slice(2)}` : l)), ''])].join('\n');
  const href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = href;
  a.download = `${j.facts.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
  return true;
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
export type Intent = { kind: 'extend' | 'close' | 'reopen' | 'hire'; days?: number; jobIds: string[]; summary: string } | null;

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
    if (!jobs.length) return null;
    // "Reopen" is the same job at the same address, within its 14 days; otherwise, or when asked to hire again, a new draft.
    if (/\b(reopen|re-open)\b/.test(t) && canReopen(jobs[0], s.today)) return { kind: 'reopen', jobIds: [jobs[0].id], summary: `Reopen ${jobs[0].facts.title}: choose its new closing date` };
    return { kind: 'hire', jobIds: [jobs[0].id], summary: `Hire again for ${jobs[0].facts.title}: a new draft from it` };
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
      jobs: st.jobs.map((j) => (intent.jobIds.includes(j.id) ? { ...j, status: 'closed', closedAt: st.today, closeReason: 'early', payRequest: undefined, audit: [...j.audit, { at: Date.now(), who: st.me.name, what: 'Closed early from the chat' }] } : j)),
    }));
    return null;
  }
  if (intent.kind === 'reopen') {
    go('jobs', intent.jobIds[0]);
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