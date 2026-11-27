/**
 * The organisation's fixed texts on a job (employer-side plan, section 19, phase 6, D and E): one block after the sections, each text
 * with its label, in the order chosen for the job. A text can be worded for this job only, left out, or brought back; a locked text
 * keeps its wording and cannot be left out. In each language the organisation's own wording is used word for word where it has one;
 * otherwise a machine translation (by the AI) is shown marked until approved, or, with the AI off, the organisation's text marked
 * "to translate".
 */
import { COMMITMENTS, commitmentText } from './engine';
import { jobLang } from './translate';
import type { DemoJob, FixedOwn, JobLang, Org, State } from './types';

/** The language the organisation writes its fixed texts in (defaults to English). */
export const ORG_LANG: JobLang = 'en';

export function orgLang(org?: Pick<Org, 'primaryLang'>): JobLang {
  return org?.primaryLang ?? ORG_LANG;
}

/** The fixed texts the demo offers this organisation. */
export function offeredFixed(org: Org): string[] {
  return COMMITMENTS.filter((c) => c.key !== 'mds' || org.mdsMember).map((c) => c.key);
}

export function fixedLabel(key: string): string {
  return COMMITMENTS.find((c) => c.key === key)?.label ?? key;
}

export function isLocked(org: Org, key: string): boolean {
  return Boolean(org.standard.find((c) => c.key === key)?.locked);
}

/** The fixed texts on the job in a language, in their order: the job's own, or a version's (which starts as the job's). */
export function fixedList(job: DemoJob, lang: JobLang = jobLang(job)): string[] {
  if (lang === jobLang(job)) return job.commitments;
  return job.translations?.[lang]?.commitments ?? job.commitments;
}

/** The job's own wording of each fixed text in a language. */
export function fixedStore(job: DemoJob, lang: JobLang = jobLang(job)): Record<string, FixedOwn> {
  return (lang === jobLang(job) ? job.fixed : job.translations?.[lang]?.fixed) ?? {};
}

/** The organisation's own wording of a fixed text in a language, used word for word; in its own language, its text in Settings. */
export function orgWording(org: Org, key: string, lang: JobLang): string | undefined {
  if (lang === orgLang(org)) return org.standard.find((c) => c.key === key)?.text;
  return org.fixedWording?.[lang]?.[key]?.trim() || undefined;
}

/**
 * Whether a fixed text may be worded for this job in a language: unlocked texts always; locked texts can never be edited ad-hoc
 * on a job (in any language) — locked translations come from Organisation settings or owner-approved translation.
 */
export function canWord(org: Org, key: string, _lang: JobLang): boolean {
  return !isLocked(org, key);
}

export type FixedShown = {
  key: string;
  label: string;
  text: string;
  locked: boolean;
  /** Worded for this job (by the user). */
  own: boolean;
  /** A machine translation not approved yet: marked "please check and approve". */
  machine: boolean;
  /** With no wording in the language and no translation yet: the organisation's text, marked "to translate". */
  toTranslate: boolean;
  /** The organisation's text is a starter (it wrote none of its own). */
  starter: boolean;
  /** The language the text shown is in, when it is not the one asked for. */
  textLang?: JobLang;
};

/**
 * A fixed text as a job shows it in a language: the wording for this job, else the wording as it was published, else the
 * organisation's wording for that language, else the organisation's text, marked to translate when it is not in that language.
 */
export function fixedShown(job: DemoJob, s: Pick<State, 'org'>, key: string, lang: JobLang = jobLang(job)): FixedShown {
  const mine = fixedStore(job, lang)[key];
  const base = commitmentText(key, s.org, job.facts);
  const locked = isLocked(s.org, key);
  const shared = { key, label: fixedLabel(key), locked, starter: !base.own };
  // A wording for the job carried from another language without the AI: shown as it was written there, to translate.
  if (mine?.text && mine.fromLang) return { ...shared, text: mine.text, own: false, machine: false, toTranslate: true, textLang: mine.fromLang };
  if (mine?.text && (mine.machine || canWord(s.org, key, lang))) return { ...shared, text: mine.text, own: !mine.machine, machine: Boolean(mine.machine && !mine.approved), toTranslate: false };
  const published = job.fixedPublished?.[lang]?.[key];
  if (published) return { ...shared, text: published, own: false, machine: false, toTranslate: false };
  const primary = orgLang(s.org);
  const wording = lang === primary ? base.text : orgWording(s.org, key, lang);
  if (wording) return { ...shared, text: wording, own: false, machine: false, toTranslate: false };
  return { ...shared, text: base.text, own: false, machine: false, toTranslate: true, textLang: primary };
}

/** Every fixed text's wording in every language the job has, as it would be published now. */
export function fixedWordingNow(job: DemoJob, s: Pick<State, 'org'>): Partial<Record<JobLang, Record<string, string>>> {
  const langs: JobLang[] = [jobLang(job), ...(Object.keys(job.translations ?? {}) as JobLang[])];
  return Object.fromEntries(langs.map((l) => [l, Object.fromEntries(fixedList(job, l).map((k) => [k, fixedShown({ ...job, fixedPublished: undefined }, s, k, l).text]))]));
}

/** The fixed texts still marked in a language: machine-translated and not approved, or to translate. */
export function fixedMarked(job: DemoJob, s: Pick<State, 'org'>, lang: JobLang = jobLang(job)): { machine: string[]; toTranslate: string[] } {
  const shown = fixedList(job, lang).map((k) => fixedShown(job, s, k, lang));
  return { machine: shown.filter((x) => x.machine).map((x) => x.key), toTranslate: shown.filter((x) => x.toTranslate).map((x) => x.key) };
}
