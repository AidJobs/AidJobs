/** What changed in a live job since it was published (employer-side plan, section 17, phase 2, and decision 7). */
import { longDate, salaryText } from './engine';
import { invitedCount } from './invites';
import type { DemoJob, Facts, Section } from './types';

export type Change = { key: string; label: string; from?: string; to?: string; important: boolean };

/** The facts compared, in the order shown. Important ones (closing date, pay, duty station, contract) can be told to the people Reach invited. */
const FACTS: Array<{ key: string; label: string; important: boolean; text: (f: Facts) => string }> = [
  { key: 'title', label: 'Title', important: false, text: (f) => f.title },
  { key: 'deadline', label: 'Closing date', important: true, text: (f) => (f.deadline ? longDate(f.deadline) : '') },
  { key: 'location', label: 'Duty station', important: true, text: (f) => f.location },
  { key: 'pay', label: 'Pay', important: true, text: (f) => salaryText(f) },
  { key: 'contract', label: 'Contract', important: true, text: (f) => [f.contract, f.duration].filter(Boolean).join(', ') },
  { key: 'grade', label: 'Grade', important: false, text: (f) => f.grade },
  { key: 'start', label: 'Start date', important: false, text: (f) => (f.startDate ? longDate(f.startDate) : '') },
  { key: 'languages', label: 'Languages', important: false, text: (f) => f.languages.join(', ') },
];

const same = (a: Section | undefined, b: Section | undefined) => Boolean(a && b && a.title === b.title && a.lines.join('\n') === b.lines.join('\n'));

/** The facts changed (with before and after) and the sections changed, added, or removed. Empty when nothing changed or the job was never live. */
export function changesSince(j: DemoJob): Change[] {
  const p = j.published;
  if (!p || (j.status !== 'live' && j.status !== 'closed')) return [];
  const out: Change[] = [];
  for (const f of FACTS) {
    const from = f.text(p.facts);
    const to = f.text(j.facts);
    if (from !== to) out.push({ key: f.key, label: f.label, from: from || 'not stated', to: to || 'not stated', important: f.important });
  }
  const keys = [...new Set([...p.sections.map((x) => x.key), ...j.sections.map((x) => x.key)])];
  for (const k of keys) {
    const before = p.sections.find((x) => x.key === k);
    const now = j.sections.find((x) => x.key === k);
    // A section rebuilt from the facts (How to apply quoting the closing date) is not a change of its own: the fact is listed.
    if (same(before, now) || (before && now && !now.edited && !now.ai && before.title === now.title)) continue;
    const label = (now ?? before)!.title;
    out.push({ key: `section:${k}`, label: !before ? `${label} (added)` : !now ? `${label} (removed)` : label, important: false });
  }
  return out;
}

const part = (c: Change) => `${c.key}=${c.to}`;

/**
 * The offer to tell the people Reach invited about an important change to a live amplified job (decision 7): only the changes not told
 * or declined before, and only when someone was invited. `key` records the offer, so it is made at most once.
 */
export function tellOffer(j: DemoJob): { key: string; changes: Change[]; count: number } | null {
  if (j.status !== 'live' || j.plan !== 'amplify' || !j.reach) return null;
  const parts = (j.reachTold ?? []).flatMap((k) => k.split('|'));
  const done = new Set([...parts, ...(j.reachDeclined ?? []).flatMap((k) => k.split('|'))]);
  // What they were last told, per fact: a second change reads "told value → new value", not "published value → new value".
  const lastTold = new Map(parts.map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]));
  const changes = changesSince(j)
    .filter((c) => c.important && !done.has(part(c)))
    .map((c) => (lastTold.has(c.key) ? { ...c, from: lastTold.get(c.key) } : c));
  if (!changes.length) return null;
  const count = invitedCount(j);
  return count ? { key: changes.map(part).join('|'), changes, count } : null;
}

/** "Responsibilities, closing date (30 November 2026 → 7 December 2026)". */
export function changeSummary(changes: Change[]): string {
  return changes.map((c, i) => `${i === 0 ? c.label : c.label.toLowerCase()}${c.from !== undefined ? ` (${c.from} → ${c.to})` : ''}`).join(', ');
}
