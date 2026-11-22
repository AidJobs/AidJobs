/**
 * The outline's two levels (employer-side plan, section 19, phase 6, B): the groups, and each group's sections. Everything can
 * be reordered, a section moved into another group, and the groups themselves, but it is always read grouped: each section under its
 * group, in the order chosen. Phase 6 amendment: groups and sections the user adds (`g-…`, `c-…`) sit on top of the catalog.
 */
import { GROUPS, inOutlineOrder, SECTION_BY_KEY } from './engine';
import type { CustomGroup, DemoJob, Format, GroupKey, Grouping, OutlineEntry, Translation } from './types';

export const GROUP_KEYS: GroupKey[] = GROUPS.map((g) => g.key);

/** A grouping plus the job's (or version's) added groups, for outline math. */
export type GroupingFull = Grouping & { customGroups?: CustomGroup[] };

export function isCatalogGroup(key: string): boolean {
  return GROUP_KEYS.includes(key);
}

export function isCustomGroup(key: string): boolean {
  return key.startsWith('g-');
}

export function isCustomSection(key: string): boolean {
  return key.startsWith('c-');
}

export function customIds(x: { customGroups?: CustomGroup[] } | undefined): string[] {
  return (x?.customGroups ?? []).map((g) => g.id);
}

export function groupLabelOf(key: GroupKey, custom?: CustomGroup[]): string {
  return GROUPS.find((x) => x.key === key)?.label ?? custom?.find((x) => x.id === key)?.label ?? key;
}

/** A section's own group, from its kind (catalog); custom sections use `groupOf` or default to The job. */
export function ownGroup(key: string): GroupKey {
  return SECTION_BY_KEY[key]?.group ?? 'job';
}

function allowedGroups(g: GroupingFull): Set<string> {
  return new Set([...GROUP_KEYS, ...customIds(g)]);
}

/** The order of the groups: saved order, every catalog group present, then any added group not yet listed. */
export function groupOrderOf(g: GroupingFull): GroupKey[] {
  const allowed = allowedGroups(g);
  const order = (g.groupOrder ?? []).filter((k, i, all) => allowed.has(k) && all.indexOf(k) === i);
  for (const k of GROUP_KEYS) {
    if (order.includes(k)) continue;
    const before = GROUP_KEYS.slice(0, GROUP_KEYS.indexOf(k)).reverse().find((p) => order.includes(p));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, k);
  }
  for (const id of customIds(g)) if (!order.includes(id)) order.push(id);
  return order;
}

/** The group a section is shown under: the one it was moved into, else its own. */
export function groupOfKey(g: GroupingFull, key: string): GroupKey {
  return g.groupOf?.[key] ?? ownGroup(key);
}

/** Keys read group by group, in the group order, keeping their order within each group. */
export function grouped(keys: string[], g: GroupingFull): string[] {
  const order = groupOrderOf(g);
  return keys
    .map((k, i) => ({ k, i, at: order.indexOf(groupOfKey(g, k)) }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map((x) => x.k);
}

/** Whether keys already read group by group. */
export function isGrouped(keys: string[], g: GroupingFull): boolean {
  return grouped(keys, g).join() === keys.join();
}

/** The sections of one group, in their order. */
export function inGroup(keys: string[], g: GroupingFull, group: GroupKey): string[] {
  return keys.filter((k) => groupOfKey(g, k) === group);
}

/**
 * The grouping without what says nothing: a section in its own catalog group, or only the five catalog groups in the usual order.
 * Added group ids in `customGroups` are kept.
 */
export function cleanGrouping(g: GroupingFull, keys?: string[]): Grouping {
  const allowed = allowedGroups(g);
  const groupOf = Object.fromEntries(
    Object.entries(g.groupOf ?? {}).filter(([k, v]) => allowed.has(v) && (!keys || keys.includes(k)) && (isCustomSection(k) || v !== ownGroup(k))),
  );
  const full: GroupingFull = { ...g, groupOf };
  const order = groupOrderOf(full);
  return { groupOrder: order.join() === GROUP_KEYS.join() ? undefined : order, groupOf: Object.keys(groupOf).length ? groupOf : undefined };
}

type Moved = { keys: string[]; grouping: Grouping };

function withCustom(g: GroupingFull): GroupingFull {
  return g;
}

function done(keys: string[], g: GroupingFull): Moved {
  const grouping = cleanGrouping(withCustom(g), keys);
  return { keys: grouped(keys, { ...grouping, customGroups: g.customGroups }), grouping };
}

/** A section added without a place: at the end of its group (`group`, else its own). */
export function addToGroup(keys: string[], g: GroupingFull, key: string, group: GroupKey = ownGroup(key)): Moved {
  if (keys.includes(key)) return { keys, grouping: cleanGrouping(g, keys) };
  return done([...keys, key], { ...g, groupOf: { ...g.groupOf, [key]: group } });
}

/** A section added after another (it joins that one's group), or first in `group` when `after` is null. */
export function addAfter(keys: string[], g: GroupingFull, key: string, after: string | null, group?: GroupKey): Moved {
  if (keys.includes(key)) return moveAfter(keys, g, key, after, group);
  return moveAfter([...keys, key], { ...g, groupOf: { ...g.groupOf, [key]: group ?? ownGroup(key) } }, key, after, group);
}

/**
 * A section dropped after another joins that section's group, just after it; dropped with no section before it, it goes first in
 * `group` (the first group when none is given).
 */
export function moveAfter(keys: string[], g: GroupingFull, key: string, after: string | null, group?: GroupKey): Moved {
  if (!keys.includes(key) || after === key) return { keys, grouping: cleanGrouping(g, keys) };
  const rest = keys.filter((k) => k !== key);
  if (after && rest.includes(after)) {
    const at = rest.indexOf(after) + 1;
    return done([...rest.slice(0, at), key, ...rest.slice(at)], { ...g, groupOf: { ...g.groupOf, [key]: groupOfKey(g, after) } });
  }
  const to = group ?? groupOrderOf(g)[0];
  const first = rest.find((k) => groupOfKey(g, k) === to);
  const at = first ? rest.indexOf(first) : rest.length;
  return done([...rest.slice(0, at), key, ...rest.slice(at)], { ...g, groupOf: { ...g.groupOf, [key]: to } });
}

/** "Move to group…": at the end of that group. */
export function moveToGroup(keys: string[], g: GroupingFull, key: string, group: GroupKey): Moved {
  if (!keys.includes(key)) return { keys, grouping: cleanGrouping(g, keys) };
  return done([...keys.filter((k) => k !== key), key], { ...g, groupOf: { ...g.groupOf, [key]: group } });
}

/**
 * One step up or down in the outline, across group boundaries too: within its group it changes places with its neighbour; the first
 * of a group moves up to the end of the group before, the last moves down to the start of the group after.
 */
export function moveBy(keys: string[], g: GroupingFull, key: string, by: -1 | 1): Moved {
  const own = groupOfKey(g, key);
  const list = inGroup(keys, g, own);
  const at = list.indexOf(key);
  if (at < 0) return { keys, grouping: cleanGrouping(g, keys) };
  const swap = list[at + by];
  if (swap) {
    const next = [...keys];
    const i = next.indexOf(key);
    const n = next.indexOf(swap);
    [next[i], next[n]] = [next[n], next[i]];
    return done(next, g);
  }
  const order = groupOrderOf(g);
  const target = order[order.indexOf(own) + by];
  if (!target) return { keys, grouping: cleanGrouping(g, keys) };
  const rest = keys.filter((k) => k !== key);
  const there = inGroup(rest, g, target);
  if (by < 0) return done([...rest, key], { ...g, groupOf: { ...g.groupOf, [key]: target } });
  const first = there[0];
  const pos = first ? rest.indexOf(first) : rest.length;
  return done([...rest.slice(0, pos), key, ...rest.slice(pos)], { ...g, groupOf: { ...g.groupOf, [key]: target } });
}

/**
 * One step up or down in the job description, which has no group titles: it changes places with the section before or after it in
 * the reading order, joining that section's group when it is in another one, so the move is always seen.
 */
export function moveInReading(keys: string[], g: GroupingFull, key: string, by: -1 | 1): Moved {
  const read = grouped(keys, g);
  const at = read.indexOf(key);
  const other = read[at + by];
  if (at < 0 || !other) return { keys, grouping: cleanGrouping(g, keys) };
  if (groupOfKey(g, other) === groupOfKey(g, key)) return moveBy(keys, g, key, by);
  const before = by < 0 ? (read[at - 2] && groupOfKey(g, read[at - 2]) === groupOfKey(g, other) ? read[at - 2] : null) : other;
  return moveAfter(keys, g, key, before, groupOfKey(g, other));
}

/** A group moved up or down as a whole. */
export function moveGroupBy(g: GroupingFull, group: GroupKey, by: -1 | 1): Grouping {
  const order = groupOrderOf(g);
  const at = order.indexOf(group);
  const to = at + by;
  if (at < 0 || to < 0 || to >= order.length) return cleanGrouping(g);
  const next = [...order];
  [next[at], next[to]] = [next[to], next[at]];
  return cleanGrouping({ ...g, groupOrder: next });
}

/** A group dropped before another (or at the end when `before` is null). */
export function moveGroupBefore(g: GroupingFull, group: GroupKey, before: GroupKey | null): Grouping {
  const order = groupOrderOf(g).filter((k) => k !== group);
  const at = before && order.includes(before) ? order.indexOf(before) : order.length;
  return cleanGrouping({ ...g, groupOrder: [...order.slice(0, at), group, ...order.slice(at)] });
}

/**
 * A flat order saved by phase 5 brought forward without changing what it reads (section 19, phase 6, B): walking the order, the groups
 * take the order of their first appearance; a section whose own group already appeared and was followed by another group joins the
 * group it now sits in.
 */
export function groupingFrom(keys: string[]): Grouping {
  const order: GroupKey[] = [];
  const groupOf: Record<string, GroupKey> = {};
  let current: GroupKey | null = null;
  for (const k of keys) {
    const own = ownGroup(k);
    if (!order.includes(own)) {
      order.push(own);
      current = own;
    } else if (own !== current && current) groupOf[k] = current;
  }
  return cleanGrouping({ groupOrder: order, groupOf });
}

/** A template's grouping, from its entries' groups and its group order. */
export function formatGrouping(f: Pick<Format, 'order' | 'groupOrder'>): Grouping {
  return cleanGrouping({ groupOrder: f.groupOrder, groupOf: Object.fromEntries(f.order.filter((o) => o.group).map((o) => [o.key, o.group!])) });
}

/** Entries put in their template's grouping, each carrying its group when it is not its own. */
export function groupedEntries(order: OutlineEntry[], g: GroupingFull): OutlineEntry[] {
  const keys = grouped(
    order.map((o) => o.key),
    g,
  );
  return keys.map((k) => {
    const o = order.find((x) => x.key === k)!;
    const group = g.groupOf?.[k];
    const { group: _drop, ...rest } = o;
    void _drop;
    return group && group !== ownGroup(k) ? { ...rest, group } : rest;
  });
}

/** One change made in the outline or with the draft's icons (section 19, phase 6, B and C, and the amendment). */
export type OutlineOp =
  | { op: 'drop'; key: string; after: string | null; group: GroupKey }
  | { op: 'by'; key: string; by: -1 | 1; reading?: boolean }
  | { op: 'toGroup'; key: string; group: GroupKey }
  | { op: 'remove'; key: string }
  | { op: 'add'; key: string; group?: GroupKey; after?: string | null }
  | { op: 'addCustom'; heading: string; group: GroupKey; after?: string | null }
  | { op: 'rename'; key: string; heading: string }
  | { op: 'addGroup'; label: string }
  | { op: 'removeGroup'; group: GroupKey }
  | { op: 'renameGroup'; group: GroupKey; label: string }
  | { op: 'groupBy'; group: GroupKey; by: -1 | 1 }
  | { op: 'groupBefore'; group: GroupKey; before: GroupKey | null };

/** How to apply is part of every job: no route removes it. */
export const KEPT = ['apply'];

/**
 * Where a section goes when its custom group is removed (R1-10 / R2-P1-4): catalog sections return to their own
 * group; custom sections go to the previous group in order, else the next, else The job. How to apply uses Applying.
 */
export function rehomeTarget(g: GroupingFull, removedGroup: GroupKey, key: string): GroupKey {
  if (KEPT.includes(key) || !isCustomSection(key)) return ownGroup(key);
  const order = groupOrderOf(g);
  const at = order.indexOf(removedGroup);
  const rest = order.filter((x) => x !== removedGroup);
  const prev = at > 0 ? order.slice(0, at).reverse().find((x) => rest.includes(x)) : undefined;
  const next = order.slice(Math.max(at, 0) + 1).find((x) => rest.includes(x));
  return prev ?? next ?? 'job';
}

/**
 * Remove an added (custom) group only: keep every section, rehome those that sat in it, drop the group from
 * `customGroups` / `groupOrder`. Catalog groups are refused. Used by outline, draft ops, templates, and AI.
 */
export function removeCustomGroup(keys: string[], g: GroupingFull, group: GroupKey): { keys: string[]; grouping: Grouping; customGroups?: CustomGroup[] } | null {
  if (!isCustomGroup(group) || !(g.customGroups ?? []).some((x) => x.id === group)) return null;
  const groupOf = { ...(g.groupOf ?? {}) };
  for (const k of keys) {
    if (groupOfKey(g, k) !== group) continue;
    groupOf[k] = rehomeTarget(g, group, k);
  }
  const customGroups = (g.customGroups ?? []).filter((x) => x.id !== group);
  const groupOrder = groupOrderOf(g).filter((x) => x !== group);
  const cleaned = cleanGrouping({ groupOrder, groupOf, customGroups }, keys);
  return { keys: grouped(keys, { ...cleaned, customGroups }), grouping: cleaned, customGroups: customGroups.length ? customGroups : undefined };
}

export function mintCustomSectionId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function mintCustomGroupId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** An operation on a list of keys and its grouping; how a removal or a rename reaches the text is the caller's. */
export function applyOp(keys: string[], g: GroupingFull, op: OutlineOp): Moved {
  switch (op.op) {
    case 'drop':
      return moveAfter(keys, g, op.key, op.after, op.group);
    case 'by':
      return op.reading ? moveInReading(keys, g, op.key, op.by) : moveBy(keys, g, op.key, op.by);
    case 'toGroup':
      return moveToGroup(keys, g, op.key, op.group);
    case 'remove':
      return KEPT.includes(op.key) ? { keys, grouping: cleanGrouping(g, keys) } : done(keys.filter((k) => k !== op.key), g);
    case 'add':
      return op.after !== undefined ? addAfter(keys, g, op.key, op.after, op.group) : addToGroup(keys, g, op.key, op.group ?? ownGroup(op.key));
    case 'groupBy':
      return done(keys, { ...g, ...moveGroupBy(g, op.group, op.by) });
    case 'groupBefore':
      return done(keys, { ...g, ...moveGroupBefore(g, op.group, op.before) });
    default:
      return { keys, grouping: cleanGrouping(g, keys) };
  }
}

/** A template being adjusted (the template panel, Create your own): the operation applied to its entries. */
export function applyToEntries(
  order: OutlineEntry[],
  groupOrder: GroupKey[] | undefined,
  op: OutlineOp,
  nameOf: (key: string) => string,
  customGroups?: CustomGroup[],
): { order: OutlineEntry[]; groupOrder?: GroupKey[]; customGroups?: CustomGroup[] } {
  if (op.op === 'rename') return { order: order.map((o) => (o.key === op.key ? { ...o, heading: op.heading } : o)), groupOrder, customGroups };
  if (op.op === 'addGroup') {
    const label = op.label.trim();
    if (!label) return { order, groupOrder, customGroups };
    const id = mintCustomGroupId();
    const next = [...(customGroups ?? []), { id, label }];
    const g: GroupingFull = { groupOrder, groupOf: formatGrouping({ order, groupOrder }).groupOf, customGroups: next };
    return { order, groupOrder: groupOrderOf(g), customGroups: next };
  }
  if (op.op === 'renameGroup') {
    const label = op.label.trim();
    if (!label || !isCustomGroup(op.group)) return { order, groupOrder, customGroups };
    const next = (customGroups ?? []).map((g) => (g.id === op.group ? { ...g, label } : g));
    return { order, groupOrder, customGroups: next };
  }
  if (op.op === 'removeGroup') {
    const g0: GroupingFull = { ...formatGrouping({ order, groupOrder }), customGroups };
    const removed = removeCustomGroup(
      order.map((o) => o.key),
      g0,
      op.group,
    );
    if (!removed) return { order, groupOrder, customGroups };
    const entries = removed.keys.map((k) => order.find((o) => o.key === k)!);
    return {
      order: groupedEntries(entries, { ...removed.grouping, customGroups: removed.customGroups }),
      groupOrder: removed.grouping.groupOrder,
      customGroups: removed.customGroups,
    };
  }
  if (op.op === 'addCustom') {
    const heading = op.heading.trim();
    if (!heading) return { order, groupOrder, customGroups };
    const key = mintCustomSectionId();
    const g: GroupingFull = { ...formatGrouping({ order, groupOrder }), customGroups };
    const next = applyOp(
      order.map((o) => o.key),
      g,
      { op: 'add', key, group: op.group, after: op.after },
    );
    const entries = [...order, { key, heading }];
    return { order: groupedEntries(next.keys.map((k) => entries.find((o) => o.key === k)!), { ...next.grouping, customGroups }), groupOrder: next.grouping.groupOrder, customGroups };
  }
  const g: GroupingFull = { ...formatGrouping({ order, groupOrder }), customGroups };
  const next = applyOp(
    order.map((o) => o.key),
    g,
    op,
  );
  const entries = next.keys.map((k) => order.find((o) => o.key === k) ?? { key: k, heading: nameOf(k) });
  return { order: groupedEntries(entries, { ...next.grouping, customGroups }), groupOrder: next.grouping.groupOrder, customGroups };
}

/** What a move did, said for screen readers: "Responsibilities: 2 of 3 in The job". */
export function placeSaid(keys: string[], g: GroupingFull, key: string, heading: string): string {
  const group = groupOfKey(g, key);
  const list = inGroup(keys, g, group);
  return `${heading}: ${list.indexOf(key) + 1} of ${list.length} in ${groupLabelOf(group, g.customGroups)}`;
}

/**
 * Quiet group labels for the draft JD (R1-27 Option A): the first section of each non-empty group in
 * the order shown. Preview / Eye stay flat (caller only asks when draft icons are on). No grips.
 */
export function draftGroupBreaks(keys: string[], g: GroupingFull): Map<string, { group: GroupKey; label: string }> {
  const out = new Map<string, { group: GroupKey; label: string }>();
  let prev: GroupKey | null = null;
  for (const k of keys) {
    const group = groupOfKey(g, k);
    if (group === prev) continue;
    out.set(k, { group, label: groupLabelOf(group, g.customGroups) });
    prev = group;
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A version brought forward: its own sections read group by group, in the grouping its order shows. */
function versionForward(t: Translation): Translation {
  const keys = t.sections.map((x) => x.key);
  const full: GroupingFull = { groupOrder: t.groupOrder, groupOf: t.groupOf, customGroups: t.customGroups };
  const g = t.groupOrder || t.groupOf || t.customGroups?.length ? cleanGrouping(full, keys) : isGrouped(keys, {}) ? {} : groupingFrom(keys);
  const order = grouped(keys, { ...g, customGroups: t.customGroups });
  if (order.join() === keys.join() && same(g.groupOrder, t.groupOrder) && same(g.groupOf, t.groupOf)) return t;
  return { ...t, groupOrder: g.groupOrder, groupOf: g.groupOf, sections: inOutlineOrder(t.sections, order) };
}

/**
 * A job brought forward on load (section 19, phase 6, B): phase 5's own order (`ordered`) becomes the grouping it reads as, and every
 * job and version reads group by group. The same job is returned when nothing changes. Added groups are kept.
 */
export function jobGrouped(j: DemoJob): DemoJob {
  const full: GroupingFull = { groupOrder: j.groupOrder, groupOf: j.groupOf, customGroups: j.customGroups };
  const g = j.ordered && !j.groupOrder && !j.groupOf ? groupingFrom(j.tags) : cleanGrouping(full, j.tags);
  const tags = grouped(j.tags, { ...g, customGroups: j.customGroups });
  const versions = j.translations ? Object.fromEntries(Object.entries(j.translations).map(([k, t]) => [k, t ? versionForward(t) : t])) : undefined;
  const changedVersions = j.translations && Object.entries(j.translations).some(([k, t]) => versions?.[k] !== t);
  if (!j.ordered && tags.join() === j.tags.join() && same(g.groupOrder, j.groupOrder) && same(g.groupOf, j.groupOf) && !changedVersions) return j;
  const { ordered: _phase5, ...rest } = j;
  void _phase5;
  return { ...rest, tags, groupOrder: g.groupOrder, groupOf: g.groupOf, sections: inOutlineOrder(j.sections, tags), ...(changedVersions ? { translations: versions as DemoJob['translations'] } : {}) };
}

/**
 * A template saved by phase 5 brought forward: an order that crosses groups takes the grouping it reads as, its entries their group.
 * A template already grouped is left as it is.
 */
export function formatForward(f: Format): Format {
  const keys = f.order.map((o) => o.key);
  if (f.groupOrder || f.order.some((o) => o.group) || isGrouped(keys, {})) return f;
  const g = groupingFrom(keys);
  return { ...f, ...(g.groupOrder ? { groupOrder: g.groupOrder } : {}), order: groupedEntries(f.order, g) };
}
