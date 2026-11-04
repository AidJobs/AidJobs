'use client';

import { useSyncExternalStore } from 'react';
import { daysUntil, inOutlineOrder, outlineOrder, startOfDay } from './engine';
import { initialState } from './sample';
import type { DemoJob, State } from './types';

/** Everything the demo keeps lives in this browser only, under its own keys, apart from the public site's. */
export const STORAGE_KEY = 'aidjobs.employerDemo.v2';

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

/** Closes live jobs whose closing date has passed, as the real product would at the deadline. */
function normalise(s: State): State {
  let changed = false;
  const jobs = s.jobs.map((j0): DemoJob => {
    const tags = outlineOrder(j0.tags);
    const j = tags.join() === j0.tags.join() && j0.sections.every((x, i) => x.key === inOutlineOrder(j0.sections, tags)[i]?.key) ? j0 : { ...j0, tags, sections: inOutlineOrder(j0.sections, tags) };
    if (j !== j0) changed = true;
    if (j.status === 'live' && j.facts.deadline && daysUntil(s.today, j.facts.deadline) < 0) {
      changed = true;
      return { ...j, status: 'closed', closedAt: s.today, closeReason: 'deadline', audit: [...j.audit, { at: s.today, who: 'AidJobs', what: 'Closed automatically at the deadline' }] };
    }
    return j;
  });
  return changed ? { ...s, jobs } : s;
}

function load(): State {
  const today = startOfDay(Date.now());
  try {
    localStorage.removeItem('aidjobs.employerDemo.v1');
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      if (parsed && parsed.v === 2 && Array.isArray(parsed.jobs)) return normalise({ ...parsed, today });
    }
  } catch {
    /* unreadable: start again */
  }
  return initialState(today);
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

export function update(fn: (s: State) => State) {
  const prev = snapshot();
  let next = fn(prev);
  // An undo puts back a copy of the jobs, so it lasts only until the jobs change in any other way.
  if (next.notice?.undo && next.notice === prev.notice && !sameJobs(next.jobs, prev.jobs)) next = { ...next, notice: null };
  current = next;
  save(current);
  listeners.forEach((l) => l());
}

export function resetDemo() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to remove */
  }
  current = initialState(startOfDay(Date.now()));
  listeners.forEach((l) => l());
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

export function undo() {
  update((s) => (s.notice?.undo ? { ...s, jobs: s.notice.undo, notice: { text: 'Undone' } } : s));
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

export function go(screen: string, id?: string) {
  const next = `#${screen}${id ? `/${id}` : ''}`;
  if (window.location.hash !== next) window.location.hash = next;
  window.scrollTo?.(0, 0);
}
