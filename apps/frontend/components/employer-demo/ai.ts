'use client';

import { useSyncExternalStore } from 'react';
import { formatOf, missingFacts } from './actions';
import { applyAiTurn, FIXED_SECTIONS, type Applied, type OpenTarget } from './aiActions';
import { CONTRACTS, headingFor, isoDay, LANGUAGES, orderSections, recommendSections, SECTIONS } from './engine';
import { proposedStyle, recommendation, STYLES, wordsFor } from './setup';
import { getState } from './store';
import type { DemoJob, Facts, State } from './types';

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
/** `models` and `model`: the models the route offers and the one chosen in the demo's controls, for comparing them in the preview. */
type Snapshot = { status: Status; pending: Record<string, { text: string; first: boolean }>; fallback: Record<string, string>; models: AiModel[]; model: string; provider: string };

let snap: Snapshot = { status: 'unknown', pending: {}, fallback: {}, models: [], model: '', provider: '' };
let probing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<Snapshot>) {
  snap = { ...snap, ...next };
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
      const saved = readModel();
      const model = models.some((m) => m.key === saved) ? saved : typeof data?.default === 'string' && models.some((m) => m.key === data.default) ? data.default : (models[0]?.key ?? '');
      set({ status: data?.ai === true ? 'on' : 'off', models, model, provider: typeof data?.provider === 'string' ? data.provider.slice(0, 60) : 'an AI provider' });
    } catch {
      set({ status: 'off' });
    }
    return snap.status === 'on';
  })();
  return probing;
}

function readModel(): string {
  try {
    return localStorage.getItem(MODEL_KEY) ?? '';
  } catch {
    return '';
  }
}

/** The model chosen in the demo's controls, remembered in this browser; one the route does not offer is ignored. */
export function chooseAiModel(key: string) {
  if (!snap.models.some((m) => m.key === key)) return;
  try {
    localStorage.setItem(MODEL_KEY, key);
  } catch {
    /* storage unavailable: the choice holds for this visit */
  }
  set({ model: key });
}

/** For tests and the demo's reset: the AI's state as at the start of a visit. */
export function resetAi(status: Status = 'unknown', models: AiModel[] = [], provider = '') {
  probing = null;
  snap = { status, pending: {}, fallback: {}, models, model: models[0]?.key ?? '', provider };
  listeners.forEach((l) => l());
}

function filled(f: Facts): Partial<Facts> {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== '' && v !== false))) as Partial<Facts>;
}

/** What the AI is told: the job, the template and its sections, the organisation, the choices it may make, and the conversation. */
export function contextFor(s: State, j: DemoJob, focus: string | undefined, first: boolean) {
  const format = formatOf(s, j.format);
  const rec = recommendation(s, j.format);
  const recFormat = formatOf(s, rec.key);
  const recCount = orderSections(recommendSections(recFormat, j.facts), recFormat).length;
  const history = first ? [] : j.chat.slice(-HISTORY).map((m) => ({ from: m.from === 'ai' ? 'assistant' : 'user', text: m.text.slice(0, 1500) }));
  return {
    today: isoDay(s.today),
    stage: j.setup ?? 'writing',
    org: { name: s.org.name, short: s.org.short, type: s.org.type, orgType: s.org.orgType, about: s.org.about, countries: s.org.countries, style: s.org.voice, styleKept: Boolean(s.org.styleKept) },
    job: {
      status: j.status,
      facts: filled(j.facts),
      missingFacts: missingFacts(j.facts),
      template: { key: format.key, label: format.label, family: format.family, usedBy: format.usedBy },
      style: j.style ?? null,
      proposedStyle: proposedStyle(s),
      inView: focus ?? null,
      canUndo: Boolean(j.lastChange),
      sections: j.tags.map((k) => {
        const sec = j.sections.find((x) => x.key === k);
        return { key: k, heading: sec?.title ?? j.renamed?.[k] ?? headingFor(k, format), fixed: FIXED_SECTIONS.includes(k), by: sec ? (sec.edited ? 'user' : sec.ai ? 'ai' : 'rules') : null, text: sec ? sec.lines.join('\n') : null };
      }),
    },
    recommendation: { key: rec.key, label: recFormat.label, reason: rec.reason, sections: recCount, words: wordsFor(recCount), others: rec.others.map((k) => ({ key: k, label: formatOf(s, k).label, usedBy: formatOf(s, k).usedBy })) },
    templates: s.formats.filter((f) => !f.key.startsWith('pasted-')).map((f) => ({ key: f.key, label: f.label, family: f.family, usedBy: f.usedBy, headings: f.order.map((o) => o.heading) })),
    sectionTypes: SECTIONS.map((x) => ({ key: x.key, label: x.label, group: x.group, hint: x.hint })),
    styles: STYLES,
    contracts: CONTRACTS,
    languages: LANGUAGES,
    conversation: history,
  };
}

/**
 * Sends one message to the AI and carries out its answer. Returns what was applied, or null when the AI is off or failed, in which
 * case the caller answers with the rules. `first`: the reply to the role typed on the Create a job page, which is already in the chat.
 */
export async function askAi(id: string, text: string, opts: { focus?: string; first?: boolean; open: (t: OpenTarget) => void }): Promise<Applied | null> {
  const first = Boolean(opts.first);
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  if (!j || snap.status !== 'on' || snap.pending[id]) return null;
  set({ pending: { ...snap.pending, [id]: { text, first } }, fallback: { ...snap.fallback, [id]: '' } });
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(AI_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text, first, context: contextFor(s, j, opts.focus, first), ...(snap.model ? { model: snap.model } : {}) }),
      signal: stop.signal,
      cache: 'no-store',
    });
    if (res.status === 503 || res.status === 404) set({ status: 'off' });
    const data = res.ok ? ((await res.json()) as { reply?: unknown; actions?: unknown; model?: unknown }) : null;
    if (!data || typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('no reply');
    const by = snap.models.find((m) => m.key === data.model)?.label;
    return applyAiTurn(id, first ? null : text, { reply: data.reply, actions: Array.isArray(data.actions) ? data.actions : [] }, opts.open, by);
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
