'use client';

import { useSyncExternalStore } from 'react';
import { freeBroughtForward, LANGS_INCLUDED, rollBilling } from './plans';
import { goLive } from './invites';
import { purgeDeleted } from './lifecycle';
import { daysUntil, inOutlineOrder, startOfDay } from './engine';
import { broughtForward } from './flow';
import { formatForward, jobGrouped } from './outline';
import { fixedWordingNow } from './fixed';
import { profilesFromJobs } from './profiles';
import { initialState, type DemoPreset } from './sample';
import type { DemoJob, Recipient, State } from './types';

/** Everything the demo keeps lives in this browser only, under its own keys, apart from the public site's. */
export const STORAGE_KEY = 'aidjobs.employerDemo.v4';

/** Which sample organisation to load on reset / empty storage (R2-P0-2). */
export const PRESET_KEY = 'aidjobs.employerDemo.preset';

/** The job just started with Enter: its window opens at once and shows "Reading your role…" before the first replies. */
export const READING_KEY = 'aidjobs.employerDemo.reading';

export function readPreset(): DemoPreset {
  try {
    const p = localStorage.getItem(PRESET_KEY);
    if (p === 'tumaini' || p === 'riverstone' || p === 'blank') return p;
  } catch {
    /* storage unavailable */
  }
  return 'riverstone';
}

function writePreset(preset: DemoPreset) {
  try {
    localStorage.setItem(PRESET_KEY, preset);
  } catch {
    /* storage unavailable */
  }
}

const listeners = new Set<() => void>();
let current: State | null = null;
const serverState = initialState(0);

function save(s: State) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: the demo still works for this visit */
  }
}

/** Closes live jobs whose closing date has passed, as the real product would at the deadline; lapses and renews paid jobs. */
export function normalise(s0: State): State {
  const s1 = purgeDeleted(goLive(rollBilling(freeBroughtForward(s0))));
  // Templates saved by phase 5 with an order across groups, and the languages "confirmed" before Settings held wording per language.
  const formats = s1.formats.map(formatForward);
  const s2 = formats.some((f, i) => f !== s1.formats[i]) ? { ...s1, formats } : s1;
  const s = s2.org.fixedLangs ? { ...s2, org: { ...s2.org, fixedLangs: undefined } } : s2;
  let changed = false;
  const jobs = s.jobs.map((j0): DemoJob => {
    // Each job reads group by group; one phase 5 saved in its own order keeps what it reads (section 19, phase 6, B).
    const g = jobGrouped(j0);
    const j1 = g.sections.every((x, i) => x.key === inOutlineOrder(g.sections, g.tags)[i]?.key) ? g : { ...g, sections: inOutlineOrder(g.sections, g.tags) };
    // Saved before jobs kept a copy of what went live: today's text is the starting point for "changed since publishing".
    const j2 = j1.status === 'live' && !j1.published ? { ...j1, published: { facts: j1.facts, sections: j1.sections, at: j1.publishedAt ?? s.today } } : j1;
    // A job still choosing its template or style when saved by an earlier version is written step by step from here.
    const j3 = j2.setup && !j2.walk ? { ...j2, walk: { approved: [], settled: [] } } : j2;
    // Amplified before versions were counted (12 November 2026): the versions it already has stay public, as paid for.
    const n = Object.keys(j3.translations ?? {}).length;
    const j4 = j3.plan === 'amplify' && !j3.paidVia ? { ...j3, paidVia: 'single' as const, langsPaid: Math.max(j3.langsPaid ?? 0, n - LANGS_INCLUDED.single) } : j3;
    const j = wordingKept(broughtForward(j4, s), s);
    if (j !== j0) changed = true;
    if (j.status === 'live' && j.facts.deadline && daysUntil(s.today, j.facts.deadline) < 0) {
      changed = true;
      return { ...j, status: 'closed', closedAt: s.today, closeReason: 'deadline', audit: [...j.audit, { at: s.today, who: 'AidJobs', what: 'Closed automatically at the deadline' }] };
    }
    return j;
  });
  // Published before job profiles were saved (section 19, phase 4): each published job leaves the profile it would have saved.
  const profiles = s.profiles ?? profilesFromJobs(jobs);
  if (profiles !== s.profiles) return { ...s, jobs, profiles };
  return changed ? { ...s, jobs } : s;
}

/** A job published before its fixed texts' wording was kept (section 19, phase 6, D) takes it from the settings as they are now. */
function wordingKept(j: DemoJob, s: State): DemoJob {
  return ['scheduled', 'live', 'closed'].includes(j.status) && !j.fixedPublished ? { ...j, fixedPublished: fixedWordingNow(j, s) } : j;
}

/** The sample data as the window takes it on: its jobs brought forward and its published jobs' profiles kept. */
function sample(today: number, preset: DemoPreset = readPreset()): State {
  const s = initialState(today, preset);
  return { ...s, jobs: s.jobs.map((j) => wordingKept(broughtForward(j, s), s)), profiles: profilesFromJobs(s.jobs) };
}

function load(): State {
  const today = startOfDay(Date.now());
  try {
    localStorage.removeItem('aidjobs.employerDemo.v1');
    localStorage.removeItem('aidjobs.employerDemo.v2');
    localStorage.removeItem('aidjobs.employerDemo.v3');
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      if (parsed && parsed.v === 4 && Array.isArray(parsed.jobs)) return normalise({ ...parsed, today });
    }
  } catch {
    /* unreadable: start again */
  }
  return sample(today);
}

function snapshot(): State {
  if (!current) current = load();
  return current;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useDemo(): State {
  return useSyncExternalStore(subscribe, snapshot, () => serverState);
}

export function getState(): State {
  return snapshot();
}

const sameJobs = (a: DemoJob[], b: DemoJob[]) => a === b || (a.length === b.length && a.every((j, i) => j === b[i]));

/** `background` marks simulated progress (email delivery) that is not the user's change, so it leaves an offered undo in place. */
export function update(fn: (s: State) => State, background = false) {
  const prev = snapshot();
  let next = fn(prev);
  // An undo puts back a copy of the jobs, so it lasts only until the jobs change in any other way.
  if (!background && next.notice?.undo && next.notice === prev.notice && !sameJobs(next.jobs, prev.jobs)) next = { ...next, notice: null };
  current = next;
  save(current);
  listeners.forEach((l) => l());
}

/** Resets to sample data. Pass a preset to switch organisation (Riverstone / Tumaini); otherwise keeps the last chosen preset. */
export function resetDemo(preset?: DemoPreset) {
  const next = preset ?? readPreset();
  writePreset(next);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to remove */
  }
  current = sample(startOfDay(Date.now()), next);
  trail.length = 0;
  listeners.forEach((l) => l());
}

/** The preset currently stored for reset / empty load (demo chrome). */
export function currentPreset(): DemoPreset {
  return readPreset();
}

export function nextId(prefix: string): string {
  const s = snapshot();
  const n = s.seq + 1;
  current = { ...s, seq: n };
  return `${prefix}-${n}-${Math.random().toString(36).slice(2, 6)}`;
}

export function updateJob(id: string, fn: (j: DemoJob) => DemoJob) {
  update((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? fn(j) : j)) }));
}

/** Changes jobs and offers one undo, which stays until it is used, dismissed, or replaced by the next change. */
export function changeWithUndo(text: string, fn: (s: State) => State) {
  update((s) => ({ ...fn(s), notice: { text, undo: s.jobs } }));
}

/**
 * The Reach record after an undo: everything queued or sent since stays (an email cannot be unsent), and the emails that were only waiting
 * for go-live, with the date they waited for, come back as they were (Back to draft and Change the date are undone in full).
 */
function undoReach(old: DemoJob['reach'], now: DemoJob['reach']): DemoJob['reach'] {
  if (!old || ![...old.candidates, ...old.team].some((r) => r.status === 'waiting')) return now;
  const base = now ?? { ...old, candidates: [], team: [], rounds: [] };
  const back = (was: Recipient[], is: Recipient[]) => {
    const out = is.filter((r) => r.status !== 'waiting');
    return [...out, ...was.filter((r) => r.status === 'waiting' && !out.some((x) => x.email === r.email && x.round === r.round))];
  };
  return {
    ...base,
    candidates: back(old.candidates, base.candidates),
    team: back(old.team, base.team),
    rounds: [...old.rounds, ...base.rounds.filter((r) => !old.rounds.some((o) => o.n === r.n))],
  };
}

/** Undo puts the jobs back, except what Reach has sent since: an email cannot be unsent. */
export function undo() {
  update((s) => {
    if (!s.notice?.undo) return s;
    const jobs = s.notice.undo.map((old) => {
      const now = s.jobs.find((j) => j.id === old.id);
      return now ? { ...old, reach: undoReach(old.reach, now.reach) } : old;
    });
    return { ...s, jobs, notice: { text: 'Undone' } };
  });
}

export function notify(text: string) {
  update((s) => ({ ...s, notice: { text } }));
}

export function dismissNotice() {
  update((s) => ({ ...s, notice: null }));
}

const noop = () => () => {};

/** True only in the browser after hydration, so nothing that depends on the visitor's storage or clock renders on the server. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

function subscribeHash(fn: () => void) {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
}

export type Route = { screen: string; id?: string };

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => '',
  );
  const [screen, id] = hash.replace(/^#\/?/, '').split('/');
  return { screen: screen || 'create', id: id || undefined };
}

/** The screens the user came through, most recent last, so Back returns where they came from (not kept across a reload). */
const trail: string[] = [];

export function go(screen: string, id?: string) {
  const next = `#${screen}${id ? `/${id}` : ''}`;
  if (window.location.hash !== next) {
    trail.push(window.location.hash || '#create');
    if (trail.length > 30) trail.shift();
    window.location.hash = next;
  }
  window.scrollTo?.(0, 0);
}

let part: string | null = null;

/** Opens a screen with one of its parts brought into view, such as the publish panel. */
export function goToPart(screen: string, id: string, which: string | null) {
  part = which;
  go(screen, id);
}

export function takePart(): string | null {
  const p = part;
  part = null;
  return p;
}

/** A screen in the trail that no longer makes sense: its job was deleted, or its publishing page is for a job already published. */
function gone(hash: string): boolean {
  const [screen, id] = hash.replace(/^#\/?/, '').split('/');
  if (!id || !['jobs', 'create', 'studio', 'job', 'publish', 'public'].includes(screen)) return false;
  const job = getState().jobs.find((j) => j.id === id);
  return !job || (screen === 'publish' && !['draft', 'review', 'approved'].includes(job.status));
}

/** Back to the screen the user came from: Manage jobs, Overview, Create a job, or the workspace; `fallback` when there is none. */
export function goBack(fallback: string, fallbackId?: string) {
  const here = window.location.hash;
  let prev = trail.pop();
  while (prev !== undefined && (prev === here || gone(prev))) prev = trail.pop();
  if (prev === undefined) return go(fallback, fallbackId);
  window.location.hash = prev;
  window.scrollTo?.(0, 0);
}
