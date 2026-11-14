/**
 * Each language independent (employer-side plan, section 19, phase 6, E): the job's own language and each version are one "view"
 * each, with its own sections, grouping, and fixed texts; the facts stay shared. A change in one language reaches another only when
 * the two are linked, or when the user takes "Also in …" after it. Structure always follows; text follows by the AI when it is on,
 * otherwise by the demo's table into a version (lines it cannot translate stay as they are, marked), or as a "to update" mark.
 */
import { inOutlineOrder } from './engine';
import { fixedList, fixedStore } from './fixed';
import { grouped, groupOfKey, ownGroup } from './outline';
import { jobLang } from './translate';
import type { DemoJob, FixedOwn, GroupKey, Grouping, JobLang, Section, Translation } from './types';

export type LangView = { keys: string[]; grouping: Grouping; sections: Section[]; commitments: string[]; fixed: Record<string, FixedOwn> };

export function viewOf(j: DemoJob, lang: JobLang = jobLang(j)): LangView | null {
  if (lang === jobLang(j)) return { keys: j.tags, grouping: { groupOrder: j.groupOrder, groupOf: j.groupOf }, sections: j.sections, commitments: j.commitments, fixed: j.fixed ?? {} };
  const t = j.translations?.[lang];
  if (!t) return null;
  return { keys: t.sections.map((x) => x.key), grouping: { groupOrder: t.groupOrder, groupOf: t.groupOf }, sections: t.sections, commitments: fixedList(j, lang), fixed: fixedStore(j, lang) };
}

/** The languages a job has: its own first, then its versions. */
export function langsOf(j: DemoJob): JobLang[] {
  return [jobLang(j), ...(Object.keys(j.translations ?? {}) as JobLang[])];
}

/** The languages a change in `lang` follows into: the others in the job's linked group, when `lang` is in it. */
export function linkedTo(j: DemoJob, lang: JobLang): JobLang[] {
  const group = (j.linked ?? []).filter((l) => langsOf(j).includes(l));
  return group.includes(lang) ? group.filter((l) => l !== lang) : [];
}

export type Diff = { removed: string[]; added: string[]; text: string[]; structure: boolean; fixedList: boolean; fixedText: string[] };

const textOf = (sec?: Section) => JSON.stringify(sec ? [sec.title, sec.lines, sec.subs ?? []] : null);

/** What a change did in one language: sections removed, added, rewritten (heading, text, or the headings inside), the order or grouping, and the fixed texts. */
export function diffViews(a: LangView, b: LangView): Diff {
  const removed = a.keys.filter((k) => !b.keys.includes(k));
  const added = b.keys.filter((k) => !a.keys.includes(k));
  const text = b.keys.filter((k) => a.keys.includes(k) && textOf(a.sections.find((x) => x.key === k)) !== textOf(b.sections.find((x) => x.key === k)));
  const structure = JSON.stringify([b.keys, b.grouping.groupOrder ?? null, b.keys.map((k) => groupOfKey(b.grouping, k))]) !== JSON.stringify([a.keys, a.grouping.groupOrder ?? null, a.keys.map((k) => groupOfKey(a.grouping, k))]);
  const fixedListChanged = a.commitments.join() !== b.commitments.join();
  const fixedText = Array.from(new Set([...Object.keys(a.fixed), ...Object.keys(b.fixed)])).filter((k) => JSON.stringify(a.fixed[k] ?? null) !== JSON.stringify(b.fixed[k] ?? null) && !b.fixed[k]?.machine);
  return { removed, added, text, structure, fixedList: fixedListChanged, fixedText };
}

export function isEmpty(d: Diff): boolean {
  return !d.removed.length && !d.added.length && !d.text.length && !d.structure && !d.fixedList && !d.fixedText.length;
}

/**
 * Structure follows (section 19, phase 6, E): the target takes the source's grouping and order for the sections they share, drops
 * what the source removed, and gains what it added (`draft` writes those, in the target's language); a section only the target has
 * keeps its place after the one it followed. The fixed texts' list and order follow the same way.
 */
export function mirror(target: LangView, src: LangView, d: Diff, draft: (key: string) => Section): LangView {
  const commitments = d.fixedList ? [...src.commitments] : target.commitments;
  if (!d.structure && !d.added.length && !d.removed.length) return { ...target, commitments };
  const keep = target.keys.filter((k) => !d.removed.includes(k));
  const add = d.added.filter((k) => !keep.includes(k) && src.keys.includes(k));
  const shared = src.keys.filter((k) => keep.includes(k) || add.includes(k));
  const order = [...shared];
  for (const k of keep) {
    if (order.includes(k)) continue;
    const before = target.keys.slice(0, target.keys.indexOf(k)).reverse().find((x) => order.includes(x));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, k);
  }
  const groupOf: Record<string, GroupKey> = {};
  for (const k of order) {
    const g = src.keys.includes(k) ? groupOfKey(src.grouping, k) : groupOfKey(target.grouping, k);
    if (g !== ownGroup(k)) groupOf[k] = g;
  }
  const grouping: Grouping = { groupOrder: src.grouping.groupOrder, groupOf: Object.keys(groupOf).length ? groupOf : undefined };
  const keys = grouped(order, grouping);
  const sections = inOutlineOrder([...target.sections.filter((x) => keys.includes(x.key)), ...add.map(draft)], keys);
  return { ...target, keys, grouping, sections, commitments };
}

/** A view written back into the job: the job's own language, or a version (a version changed needs a new review). */
export function withView(j: DemoJob, lang: JobLang, v: LangView): DemoJob {
  const sections = inOutlineOrder(v.sections, v.keys);
  const fixed = Object.keys(v.fixed).length ? v.fixed : undefined;
  if (lang === jobLang(j)) return { ...j, tags: v.keys, sections, groupOrder: v.grouping.groupOrder, groupOf: v.grouping.groupOf, commitments: v.commitments, fixed };
  const t = j.translations?.[lang];
  if (!t) return j;
  const next: Translation = { ...t, sections, groupOrder: v.grouping.groupOrder, groupOf: v.grouping.groupOf, commitments: v.commitments, fixed };
  return JSON.stringify(next) === JSON.stringify(t) ? j : { ...j, translations: { ...j.translations, [lang]: { ...next, reviewed: false } } };
}

/** Sections of a version that differ from the job's own: "French only", or "Not in Arabic". */
export function differences(j: DemoJob, lang: JobLang = jobLang(j)): Record<string, string> {
  const own = jobLang(j);
  const out: Record<string, string> = {};
  const label = (l: JobLang) => ({ en: 'English', fr: 'French', ar: 'Arabic', es: 'Spanish', pt: 'Portuguese' })[l];
  if (lang === own) {
    for (const k of j.tags) {
      const missing = (Object.keys(j.translations ?? {}) as JobLang[]).filter((l) => !j.translations?.[l]?.sections.some((x) => x.key === k));
      if (missing.length) out[k] = `Not in ${missing.map(label).join(' or ')}`;
    }
    return out;
  }
  for (const sec of j.translations?.[lang]?.sections ?? []) if (!j.tags.includes(sec.key)) out[sec.key] = `${label(lang)} only`;
  return out;
}
