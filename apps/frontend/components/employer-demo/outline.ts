/**
 * The outline's two levels (employer-side plan, section 19, phase 6, B): the five groups, and each group's sections. Everything can
 * be reordered, a section moved into another group, and the groups themselves, but it is always read grouped: each section under its
 * group, in the order chosen. These functions keep a list of section keys and its grouping in step, for a job, a version, or a
 * template being adjusted.
 */
import { GROUPS, inOutlineOrder, SECTION_BY_KEY } from './engine';
import type { DemoJob, Format, GroupKey, Grouping, OutlineEntry, Translation } from './types';

export const GROUP_KEYS: GroupKey[] = GROUPS.map((g) => g.key);

/** A section's own group, from its kind. */
export function ownGroup(key: string): GroupKey {
  return SECTION_BY_KEY[key]?.group ?? 'job';
}

/** The order of the groups: the one saved, completed with any group it lacks at its usual place. */
export function groupOrderOf(g: Grouping): GroupKey[] {
  const order = (g.groupOrder ?? []).filter((k, i, all) => GROUP_KEYS.includes(k) && all.indexOf(k) === i);
  for (const k of GROUP_KEYS) {
    if (order.includes(k)) continue;
    const before = GROUP_KEYS.slice(0, GROUP_KEYS.indexOf(k)).reverse().find((p) => order.includes(p));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, k);
  }
  return order;
}

/** The group a section is shown under: the one it was moved into, else its own. */
export function groupOfKey(g: Grouping, key: string): GroupKey {
  return g.groupOf?.[key] ?? ownGroup(key);
}

/** Keys read group by group, in the group order, keeping their order within each group. */
export function grouped(keys: string[], g: Grouping): string[] {
  const order = groupOrderOf(g);
  return keys
    .map((k, i) => ({ k, i, at: order.indexOf(groupOfKey(g, k)) }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map((x) => x.k);
}

/** Whether keys already read group by group. */
export function isGrouped(keys: string[], g: Grouping): boolean {
  return grouped(keys, g).join() === keys.join();
}

/** The sections of one group, in their order. */
export function inGroup(keys: string[], g: Grouping, group: GroupKey): string[] {
  return keys.filter((k) => groupOfKey(g, k) === group);
}

/** The grouping without what says nothing: a section in its own group, or the usual group order. */
export function cleanGrouping(g: Grouping, keys?: string[]): Grouping {
  const groupOf = Object.fromEntries(Object.entries(g.groupOf ?? {}).filter(([k, v]) => v !== ownGroup(k) && (!keys || keys.includes(k)) && GROUP_KEYS.includes(v)));
  const order = groupOrderOf(g);
  return { groupOrder: order.join() === GROUP_KEYS.join() ? undefined : order, groupOf: Object.keys(groupOf).length ? groupOf : undefined };
}

type Moved = { keys: string[]; grouping: Grouping };

function done(keys: string[], g: Grouping): Moved {
  const grouping = cleanGrouping(g, keys);
  return { keys: grouped(keys, grouping), grouping };
}

/** A section added without a place: at the end of its group (`group`, else its own). */
export function addToGroup(keys: string[], g: Grouping, key: string, group: GroupKey = ownGroup(key)): Moved {
  if (keys.includes(key)) return { keys, grouping: g };
  return done([...keys, key], { ...g, groupOf: { ...g.groupOf, [key]: group } });
}

/** A section added after another (it joins that one's group), or first in `group` when `after` is null. */
export function addAfter(keys: string[], g: Grouping, key: string, after: string | null, group?: GroupKey): Moved {
  if (keys.includes(key)) return moveAfter(keys, g, key, after, group);
  return moveAfter([...keys, key], { ...g, groupOf: { ...g.groupOf, [key]: group ?? ownGroup(key) } }, key, after, group);
}

/**
 * A section dropped after another joins that section's group, just after it; dropped with no section before it, it goes first in
 * `group` (the first group when none is given).
 */
export function moveAfter(keys: string[], g: Grouping, key: string, after: string | null, group?: GroupKey): Moved {
  if (!keys.includes(key) || after === key) return { keys, grouping: g };
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
export function moveToGroup(keys: string[], g: Grouping, key: string, group: GroupKey): Moved {
  if (!keys.includes(key)) return { keys, grouping: g };
  return done([...keys.filter((k) => k !== key), key], { ...g, groupOf: { ...g.groupOf, [key]: group } });
}

/**
 * One step up or down in the outline, across group boundaries too: within its group it changes places with its neighbour; the first
 * of a group moves up to the end of the group before, the last moves down to the start of the group after.
 */
export function moveBy(keys: string[], g: Grouping, key: string, by: -1 | 1): Moved {
  const own = groupOfKey(g, key);
  const list = inGroup(keys, g, own);
  const at = list.indexOf(key);
  if (at < 0) return { keys, grouping: g };
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
  if (!target) return { keys, grouping: g };
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
export function moveInReading(keys: string[], g: Grouping, key: string, by: -1 | 1): Moved {
  const read = grouped(keys, g);
  const at = read.indexOf(key);
  const other = read[at + by];
  if (at < 0 || !other) return { keys, grouping: g };
  if (groupOfKey(g, other) === groupOfKey(g, key)) return moveBy(keys, g, key, by);
  const before = by < 0 ? (read[at - 2] && groupOfKey(g, read[at - 2]) === groupOfKey(g, other) ? read[at - 2] : null) : other;
  return moveAfter(keys, g, key, before, groupOfKey(g, other));
}

/** A group moved up or down as a whole. */
export function moveGroupBy(g: Grouping, group: GroupKey, by: -1 | 1): Grouping {
  const order = groupOrderOf(g);
  const at = order.indexOf(group);
  const to = at + by;
  if (at < 0 || to < 0 || to >= order.length) return g;
  const next = [...order];
  [next[at], next[to]] = [next[to], next[at]];
  return cleanGrouping({ ...g, groupOrder: next });
}

/** A group dropped before another (or at the end when `before` is null). */
export function moveGroupBefore(g: Grouping, group: GroupKey, before: GroupKey | null): Grouping {
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
export function groupedEntries(order: OutlineEntry[], g: Grouping): OutlineEntry[] {
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

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A version brought forward: its own sections read group by group, in the grouping its order shows. */
function versionForward(t: Translation): Translation {
  const keys = t.sections.map((x) => x.key);
  const g = t.groupOrder || t.groupOf ? cleanGrouping(t, keys) : isGrouped(keys, {}) ? {} : groupingFrom(keys);
  const order = grouped(keys, g);
  if (order.join() === keys.join() && same(g.groupOrder, t.groupOrder) && same(g.groupOf, t.groupOf)) return t;
  return { ...t, groupOrder: g.groupOrder, groupOf: g.groupOf, sections: inOutlineOrder(t.sections, order) };
}

/**
 * A job brought forward on load (section 19, phase 6, B): phase 5's own order (`ordered`) becomes the grouping it reads as, and every
 * job and version reads group by group. The same job is returned when nothing changes.
 */
export function jobGrouped(j: DemoJob): DemoJob {
  const g = j.ordered && !j.groupOrder && !j.groupOf ? groupingFrom(j.tags) : cleanGrouping(j, j.tags);
  const tags = grouped(j.tags, g);
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
