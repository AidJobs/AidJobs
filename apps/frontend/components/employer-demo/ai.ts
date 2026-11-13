'use client';

import { useSyncExternalStore } from 'react';
import { downloadBlock, formatOf, missingFacts } from './actions';
import { approvalRequired, approvedFor } from './approval';
import { planCount, planFor } from './invites';
import { isPublished, STATE_LABEL, stateActionsOf, type StateAction } from './lifecycle';
import { profileFor, profileName } from './profiles';
import { allowance, canAmplifyFree, canGoFree, LANGS_INCLUDED, LANGUAGE_PRICE, langsToPay, LISTED_DAYS, PACKAGES, paidJobsLeft, singlePrice, usd, usesFreeAmplify, viaFor } from './plans';
import { ALL_LANGS, jobLang, langOf, stale, versionsOf } from './translate';
import { applyAiTurn, type Applied, type OpenTarget } from './aiActions';
import { COMMITMENTS, commitmentText, CONTRACTS, headingFor, isoDay, LANGUAGES, orderSections, recommendSections, SECTION_BY_KEY, SECTIONS } from './engine';
import { afterApproval, FIXED_SECTIONS, nextStep, reviewDone, setAiWrites, type Step } from './flow';
import { contentOf, proposedStyle, recommendation, STYLES, TYPE_REASONS, usualTemplate, wordsFor } from './setup';
import { surveyCard } from './context';
import { getState } from './store';
import type { DemoJob, Facts, Format, JobLang, State } from './types';

/**
 * The AI chat's one way out of the browser: the demo's own route, and nothing else (employer-side plan, section 19, "The AI chat in
 * the demo"). The chat asks the route first whether the AI is on; until it knows, and whenever the AI is off or fails, the chat
 * answers with its rules and says so quietly.
 */
export const AI_ROUTE = '/employer-demo/chat';
const TIMEOUT_MS = 55_000;
const HISTORY = 14;

const MODEL_KEY = 'aidjobs.employerDemo.aiModel';

type Status = 'unknown' | 'on' | 'off';
export type AiModel = { key: string; label: string };
/**
 * `models` and `model`: the models the route offers and the one chosen in the demo's controls, for comparing them in the preview.
 * `pending`: the message being answered for a job; `silent` when the window asked the AI to go on by itself, with what it is writing.
 */
type Snapshot = { status: Status; pending: Record<string, { text: string; first: boolean; silent?: string }>; fallback: Record<string, string>; models: AiModel[]; model: string; provider: string };

let snap: Snapshot = { status: 'unknown', pending: {}, fallback: {}, models: [], model: '', provider: '' };
let probing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<Snapshot>) {
  snap = { ...snap, ...next };
  setAiWrites(snap.status === 'on');
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The AI's state: on or off, the message being answered for a job, and the last quiet fallback note. */
export function aiState(): Snapshot {
  return snap;
}

export function useAi(): Snapshot {
  return useSyncExternalStore(subscribe, aiState, aiState);
}

export function aiOn(): boolean {
  return snap.status === 'on';
}

/** Whether the AI is on, asked once per visit. */
export function probeAi(): Promise<boolean> {
  if (snap.status !== 'unknown') return Promise.resolve(snap.status === 'on');
  if (probing) return probing;
  probing = (async () => {
    try {
      const res = await fetch(AI_ROUTE, { method: 'GET', cache: 'no-store' });
      const data = res.ok ? ((await res.json()) as { ai?: unknown; models?: unknown; default?: unknown; provider?: unknown }) : null;
      const models = Array.isArray(data?.models) ? data.models.filter((m): m is AiModel => Boolean(m) && typeof m.key === 'string' && typeof m.label === 'string') : [];
      forgetSavedModel();
      const model = typeof data?.default === 'string' && models.some((m) => m.key === data.default) ? data.default : (models[0]?.key ?? '');
      set({ status: data?.ai === true ? 'on' : 'off', models, model, provider: typeof data?.provider === 'string' ? data.provider.slice(0, 60) : 'an AI provider' });
    } catch {
      set({ status: 'off' });
    }
    return snap.status === 'on';
  })();
  return probing;
}

/** A choice an earlier version remembered across visits; every visit now starts on the route's default. */
function forgetSavedModel() {
  try {
    localStorage.removeItem(MODEL_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** The model chosen in the demo's controls, for this visit only; one the route does not offer is ignored. */
export function chooseAiModel(key: string) {
  if (!snap.models.some((m) => m.key === key)) return;
  set({ model: key });
}

/** For tests and the demo's reset: the AI's state as at the start of a visit. */
export function resetAi(status: Status = 'unknown', models: AiModel[] = [], provider = '') {
  probing = null;
  snap = { status, pending: {}, fallback: {}, models, model: models[0]?.key ?? '', provider };
  setAiWrites(status === 'on');
  listeners.forEach((l) => l());
}

function filled(f: Facts): Partial<Facts> {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== '' && v !== false))) as Partial<Facts>;
}

const headingOf = (j: DemoJob, format: Format, k: string) => j.sections.find((x) => x.key === k)?.title ?? j.renamed?.[k] ?? headingFor(k, format);

/** The step a job written step by step is at, as the AI is told it: plain data, with headings in place of keys where it helps. */
function stepFor(step: Step | null, j: DemoJob, s: State, format: Format): Record<string, unknown> | null {
  if (!step) return null;
  switch (step.kind) {
    case 'ask':
      return { kind: 'ask', fact: step.fact, ...(step.section ? { before: step.section, heading: headingOf(j, format, step.section) } : {}) };
    case 'write':
      return { kind: 'write', sections: step.sections.filter((k) => !FIXED_SECTIONS.includes(k)).map((k) => ({ key: k, heading: headingOf(j, format, k) })) };
    case 'approve':
      return { kind: 'approve', section: step.section, heading: headingOf(j, format, step.section), then: stepFor(afterApproval(j, s, step.section), j, s, format) };
    case 'change':
      return { kind: 'change', what: j.walk?.pending?.what, changes: (j.walk?.pending?.changes ?? []).map((c) => ({ heading: headingOf(j, format, c.key), now: c.lines.join('\n') })) };
    case 'genuine':
      return { kind: 'genuine', point: step.point, wording: j.walk?.awaiting?.label };
    case 'sdgs':
      return { kind: 'sdgs', orgGoals: s.org.sdgs.slice(0, 3) };
    case 'fixed':
      return { kind: 'fixed', onThisJob: j.commitments.map((k) => ({ key: k, label: COMMITMENTS.find((c) => c.key === k)?.label, fromSettings: commitmentText(k, s.org, j.facts).own })) };
    case 'suggest':
      return { kind: 'suggest', sections: step.sections.map((k) => ({ key: k, heading: headingFor(k, format), why: SECTION_BY_KEY[k]?.hint })) };
    case 'check':
      return { kind: 'check', point: { key: step.point.key, title: step.point.title, detail: step.point.detail ?? null, section: step.point.section ?? null, line: step.point.line ?? null, canBeGenuine: Boolean(step.point.hit) } };
    case 'market':
    case 'full':
      return { kind: step.kind, point: { key: step.point.key, title: step.point.title, detail: step.point.detail ?? null, fix: step.point.fix?.label ?? null } };
    case 'version':
      return { kind: 'version', language: step.lang };
    case 'again':
      return { kind: 'again', from: j.walk?.again ?? null, now: { deadline: j.facts.deadline || null, positions: Number(j.facts.positions) || 1, location: j.facts.location || null } };
    default:
      return { ...step };
  }
}

/** Section 17's actions for the job's state, as the AI names them in its open action (section 19, phase 4). */
const AI_ACTION: Record<StateAction, string> = { publishNow: 'publish_now', reschedule: 'reschedule', backToDraft: 'back_to_draft', extend: 'extend', share: 'share', amplify: 'amplify', filled: 'filled', close: 'close', withdraw: 'withdraw', reopen: 'reopen', hire: 'hire_again', download: 'download', delete: 'delete' };

/** A returning employer's start (section 19, phase 4), while the job waits for its template: the saved profile, else the usual template. */
function returningFor(s: State, j: DemoJob) {
  if (j.setup !== 'template') return null;
  const usual = usualTemplate(s, j.id);
  if (!usual) return null;
  const p = profileFor(s, j);
  return {
    usual: { key: usual.key, label: formatOf(s, usual.key).label, jobs: usual.count },
    style: proposedStyle(s),
    pace: s.pace ?? null,
    profile: p ? { id: p.id, name: profileName(p), template: formatOf(s, p.format).label } : null,
  };
}

/**
 * Steps 8 and 9 as the AI is told them (section 19): the plan and what it allows, the language versions, review, and Reach. Figures
 * are the rules' own; the AI words them and never works out a price, an allowance, or a date itself.
 */
function publishingFor(s: State, j: DemoJob) {
  const via = viaFor(s, j);
  const onHand = paidJobsLeft(s);
  return {
    language: { own: langOf(jobLang(j)).label, offered: ALL_LANGS.map((l) => ({ key: l.key, label: l.label })) },
    published: isPublished(j) ? { plan: j.plan, status: j.status } : null,
    choice: j.choice ?? null,
    publishOn: j.publishOn ?? null,
    free: { canGoFree: canGoFree(s, j.id), standard: allowance(s, 'standard').state, listedDays: LISTED_DAYS.free },
    amplify: { verified: s.org.verified, freeAmplify: allowance(s, 'amplify').state, usesFreeAmplify: usesFreeAmplify(s, j), price: usd(singlePrice(s).amount), packageJobsOnHand: onHand, listedDays: LISTED_DAYS.amplify, payWith: j.payWith ?? (canAmplifyFree(s, j.id) ? 'free' : 'one'), packages: PACKAGES.map((p) => ({ key: p.key, label: p.label, price: usd(p.price), perJob: usd(p.perJob) })) },
    versions: { included: LANGS_INCLUDED[via], extraPrice: usd(LANGUAGE_PRICE), toPay: langsToPay(j, 'amplify', via), list: versionsOf(j).map((k) => ({ key: k, label: langOf(k).label, reviewed: Boolean(j.translations?.[k]?.reviewed), behind: Boolean(j.translations?.[k] && stale(j, j.translations[k]!)), sections: j.translations?.[k]?.sections.map((x) => ({ key: x.key, heading: x.title, text: x.lines.join('\n') })) })) },
    reviewDone: reviewDone(j, s),
    review: { required: approvalRequired(s, j), approved: approvedFor(s, j), state: j.review.state, reviewers: j.review.reviewers.map((r) => ({ name: r.name, decision: r.decision ?? null, note: r.note ?? null })), team: s.team.filter((p) => p.id !== s.me.id).map((p) => ({ name: p.name, role: p.role })) },
    reach: (() => {
      const plan = j.reachPlan ?? planFor(j, s.org);
      return { planned: planCount(j, j.reachPlan), domain: s.org.domain, candidates: plan.candidates, team: plan.team, candidateMessage: plan.candidateMsg, teamMessage: plan.teamMsg };
    })(),
    download: downloadBlock(j),
  };
}

/**
 * What the AI is told: the job, the template and its sections, the organisation, the choices it may make, and the conversation; the
 * context pack and the survey card (section 19, phase 5, A); and a page's text only while its draft is written.
 */
export function contextFor(s: State, j: DemoJob, focus: string | undefined, first: boolean, version?: JobLang, page?: { kind: string; text: string }) {
  const format = formatOf(s, j.format);
  const rec = recommendation(s, j.format);
  const recFormat = formatOf(s, rec.key);
  const recKeys = orderSections(recommendSections(recFormat, j.facts), recFormat);
  const recCount = recKeys.length;
  const history = first ? [] : j.chat.slice(-HISTORY).map((m) => ({ from: m.from === 'ai' ? 'assistant' : 'user', text: m.text.slice(0, 1500) }));
  return {
    today: isoDay(s.today),
    stage: j.setup ?? 'writing',
    org: {
      name: s.org.name,
      short: s.org.short,
      type: s.org.type,
      orgType: s.org.orgType,
      about: s.org.about,
      countries: s.org.countries,
      style: s.org.voice,
      styleKept: Boolean(s.org.styleKept),
      website: s.org.website || null,
      websiteAsked: Boolean(s.org.websiteAsked),
      fixedTexts: COMMITMENTS.filter((c) => c.key !== 'mds' || s.org.mdsMember).map((c) => ({ key: c.key, label: c.label })),
    },
    job: {
      status: j.status,
      stateActions: stateActionsOf(s, j).map((a) => ({ key: AI_ACTION[a], label: STATE_LABEL[a] })),
      facts: filled(j.facts),
      missingFacts: missingFacts(j.facts),
      template: { key: format.key, label: format.label, family: format.family, usedBy: format.usedBy, content: contentOf(format, s.org.orgType), words: wordsFor(j.tags.length) },
      style: j.style ?? null,
      proposedStyle: proposedStyle(s),
      inView: focus ?? null,
      versionInView: version && j.translations?.[version] ? { key: version, label: langOf(version).label } : null,
      canUndo: Boolean(j.lastChange),
      sections: j.tags.map((k) => {
        const sec = j.sections.find((x) => x.key === k);
        return {
          key: k,
          heading: sec?.title ?? j.renamed?.[k] ?? headingFor(k, format),
          group: SECTION_BY_KEY[k]?.group,
          fixed: FIXED_SECTIONS.includes(k),
          by: sec ? (sec.edited ? 'user' : sec.ai ? 'ai' : 'rules') : null,
          approved: j.walk ? j.walk.approved.includes(k) : null,
          text: sec ? sec.lines.join('\n') : null,
          ...(sec?.subs?.length ? { subs: sec.subs.map((sb) => ({ id: sb.id, heading: sb.title, text: sb.lines.join('\n') })) } : {}),
        };
      }),
    },
    walk: j.walk ? { pace: j.walk.pace ?? s.pace ?? null, settled: j.walk.settled, next: stepFor(nextStep(j, s), j, s, format) } : null,
    pack: { about: j.pack?.about ?? null, project: j.pack?.project ? { text: j.pack.project.text, source: j.pack.project.source, usedBy: j.pack.project.usedBy ?? [] } : null, facts: j.pack?.facts ?? [] },
    card: surveyCard(s, j),
    suggestions: (j.suggestions ?? []).map((x) => ({ fact: x.fact, value: x.value, source: x.source, state: x.state })),
    ...(page ? { page } : {}),
    publishing: publishingFor(s, j),
    returning: returningFor(s, j),
    recommendation: {
      key: rec.key,
      label: recFormat.label,
      reason: rec.reason,
      sections: recCount,
      words: wordsFor(recCount),
      added: recKeys.filter((k) => !recFormat.order.some((o) => o.key === k) && TYPE_REASONS[k]).map((k) => ({ heading: headingFor(k, recFormat), why: TYPE_REASONS[k] })),
      others: rec.others.map((k) => ({ key: k, label: formatOf(s, k).label, usedBy: formatOf(s, k).usedBy })),
    },
    templates: s.formats.filter((f) => !f.key.startsWith('pasted-')).map((f) => ({ key: f.key, label: f.label, family: f.family, usedBy: f.usedBy, headings: f.order.map((o) => o.heading) })),
    sectionTypes: SECTIONS.map((x) => ({ key: x.key, label: x.label, group: x.group, hint: x.hint })),
    styles: STYLES,
    contracts: CONTRACTS,
    languages: LANGUAGES,
    conversation: history,
  };
}

/** What the window says to the AI when it asks it to go on by itself: write the part the job has reached. */
export const GO_ON = 'Go on with the next step: write it now.';

/** What the window says when a language version is added with the AI on (the user's decision, 12 November 2026): the AI writes it. */
export const writeVersion = (label: string) => `Write the ${label} version now: every section in context.job.versionInView, in ${label}.`;

/**
 * Sends one message to the AI and carries out its answer. Returns what was applied, or null when the AI is off or failed, in which
 * case the caller answers with the rules. `first`: the reply to the role typed on the Create a job page, which is already in the chat.
 * `silent`: the window asks the AI to go on by itself (to write the next section), named in the chat while it writes.
 */
export async function askAi(id: string, text: string, opts: { focus?: string; first?: boolean; silent?: string; version?: JobLang; page?: { kind: string; text: string }; open: (t: OpenTarget) => void }): Promise<Applied | null> {
  const first = Boolean(opts.first);
  const silent = opts.silent;
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || snap.status !== 'on' || snap.pending[id]) return null;
  set({ pending: { ...snap.pending, [id]: { text: silent ? '' : text, first, ...(silent ? { silent } : {}) } }, fallback: { ...snap.fallback, [id]: '' } });
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(AI_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text, first, ...(silent ? { silent: true } : {}), context: contextFor(s, j, opts.focus, first, opts.version, opts.page), ...(snap.model ? { model: snap.model } : {}) }),
      signal: stop.signal,
      cache: 'no-store',
    });
    if (res.status === 503 || res.status === 404) set({ status: 'off' });
    const data = res.ok ? ((await res.json()) as { reply?: unknown; actions?: unknown; model?: unknown }) : null;
    if (!data || typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('no reply');
    const by = snap.models.find((m) => m.key === data.model)?.label;
    return applyAiTurn(id, first ? null : silent ? '' : text, { reply: data.reply, actions: Array.isArray(data.actions) ? data.actions : [] }, opts.open, by, opts.version);
  } catch {
    set({ fallback: { ...snap.fallback, [id]: !aiOn() ? "The AI is off here, so the demo's own rules answered." : "The AI could not answer just now, so the demo's own rules did." } });
    return null;
  } finally {
    clearTimeout(timer);
    const rest = { ...snap.pending };
    delete rest[id];
    set({ pending: rest });
  }
}
