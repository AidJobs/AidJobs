'use client';

import { advanceFromAbout, advanceFromProject, contentSnap, formatOf, goOn, headingOf, liveEdit, setFacts, stepped, subId, touched } from './actions';
import { extractFacts, inOutlineOrder, longDate, placeIn, PLACES, roleByKey, salarySuggestion, SALARY_FACTS } from './engine';
import { ASKS } from './flow';
import { typicalYears } from './market';
import { wordsFor } from './setup';
import { getState, update, updateJob } from './store';
import type { ChatMsg, ContextPack, DemoJob, PageDraft, Period, Section, Source, State, Suggestion } from './types';

/**
 * Context for the AI (employer-side plan, section 19, phase 5, A): what the user says and accepts, then the organisation's and the
 * project's own text once accepted, then the survey card, which supplies questions and labelled sample figures only. Nothing here is put
 * on the job until the user accepts it.
 */
export const SOURCES: Source[] = ['you told us', 'your website', 'the project page', 'your salary scale', 'similar jobs in this place (sample)'];

const say = (text: string, quick?: string[], card?: ChatMsg['card']): ChatMsg => ({ id: `m${Math.random().toString(36).slice(2, 9)}`, from: 'ai', text, ...(quick ? { quick } : {}), ...(card ? { card } : {}) });

const LABEL = { about: 'About us', project: 'About the project' } as const;
/** The section About the project is written in: the template's background section, headed "About the project" when added for it. */
export const PROJECT_SECTION = 'background';

export const KEEP_PROFILE_ABOUT = "Keep our profile's About us";

/** A draft from a page or a text: shown in the chat with what was used and what the page does not say, until accepted or rejected. */
export function showPageDraft(id: string, draft: PageDraft, reply?: string) {
  updateJob(id, (j) => ({
    ...j,
    pageDraft: draft,
    chat: reply === undefined ? [...j.chat, say(`Here is a draft of **${LABEL[draft.kind]}** from ${draft.source}. ${draft.used}${draft.missing ? ` ${draft.missing}` : ''} Accept it, edit it, or reject it: nothing goes on the job until you do.`, undefined, 'page')] : j.chat,
  }));
}

/** Drafted without the AI: the page's first sentences, word for word, so every kept sentence is the page's own. */
export function extractDraft(text: string): string[] {
  const sentences = text
    .split('\n')
    .flatMap((l) => l.split(/(?<=[.!?])\s+/))
    .map((x) => x.trim())
    .filter((x) => x.length >= 40 && /[.!?]$/.test(x));
  const out: string[] = [];
  let size = 0;
  for (const x of sentences) {
    if (out.length >= 4 || size + x.length > 700) break;
    out.push(x);
    size += x.length;
  }
  return out.length ? [out.join(' ')] : [];
}

/** The country, donor, or dates the project text names that differ from a fact already set; the chat asks which to keep. */
export function projectConflicts(j: DemoJob, text: string, today: number): Array<{ fact: 'country' | 'donor' | 'deadline'; now: string; page: string }> {
  const { facts } = extractFacts(text, today);
  const out: Array<{ fact: 'country' | 'donor' | 'deadline'; now: string; page: string }> = [];
  if (facts.country && j.facts.country && facts.country !== j.facts.country) out.push({ fact: 'country', now: j.facts.country, page: facts.country });
  if (facts.donor && j.facts.donor && facts.donor.toLowerCase() !== j.facts.donor.toLowerCase()) out.push({ fact: 'donor', now: j.facts.donor, page: facts.donor });
  if (facts.deadline && j.facts.deadline && facts.deadline !== j.facts.deadline) out.push({ fact: 'deadline', now: longDate(j.facts.deadline), page: longDate(facts.deadline) });
  return out;
}

const FACT_WORD = { country: 'country', donor: 'donor', deadline: 'closing date' } as const;

/**
 * The accepted text in the section it fills. About us replaces the section's lines. The project goes into a template's own Background
 * section as its sub-section "About the project", so the role's background already written there stays; the section is replaced only
 * when all it holds is the earlier project text.
 */
function intoSection(x: Section, kind: PageDraft['kind'], text: string[], earlier?: string): Section {
  const own = x.lines.join('\n').trim();
  if (kind === 'about' || !own || own === earlier?.trim()) return { ...x, lines: text, ai: true, edited: undefined };
  const sub = x.subs?.find((y) => y.title === LABEL.project);
  const subs = sub ? (x.subs ?? []).map((y) => (y.id === sub.id ? { ...y, lines: text } : y)) : [...(x.subs ?? []), { id: subId(), title: LABEL.project, lines: text }];
  return { ...x, subs };
}

/** Same bullet conversion as the section editor's Save (`linesOf` in actions). */
export function pageLinesOf(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^[•*]\s*/, '- '))
    .filter((l) => l.trim());
}

function withoutPageIntake(intake: DemoJob['pageIntake'], kind?: 'about' | 'project'): DemoJob['pageIntake'] {
  if (!intake) return undefined;
  if (!kind) return undefined;
  const next = { ...intake, [kind]: undefined };
  return next.about || next.project ? next : undefined;
}

/** Shared About us / Project intake (JD box and chat card). Not the section body. */
export function setPageIntake(id: string, kind: 'about' | 'project', text: string) {
  if (getState().reviewerAs) return;
  updateJob(id, (j) => ({ ...j, pageIntake: { ...j.pageIntake, [kind]: text } }));
}

export function clearPageIntake(id: string, kind?: 'about' | 'project') {
  if (getState().reviewerAs) return;
  updateJob(id, (j) => ({ ...j, pageIntake: withoutPageIntake(j.pageIntake, kind) }));
}

/**
 * Write About/Project text through `intoSection` (exact "About the project" sub), never rename the heading, clear intake.
 * Kept for tests / intoSection path; the compact PageField no longer exposes Save (pencil edits the body; U-3 follow-up).
 * Does not update the context pack — that stays for Accept.
 */
export function savePageFieldText(id: string, kind: 'about' | 'project', raw: string) {
  const s0 = getState();
  if (s0.reviewerAs) return;
  const text = pageLinesOf(raw);
  if (!text.length) return;
  const key = kind === 'about' ? 'about' : PROJECT_SECTION;
  updateJob(id, (j) => {
    const earlier = kind === 'project' ? j.pack?.project?.text : undefined;
    const tags = placeIn(j.tags, key);
    const existing = j.sections.find((x) => x.key === key);
    const title = existing?.title || j.renamed?.[key] || headingOf(s0, j, key);
    const placed = existing
      ? (() => {
          const next = intoSection(existing, kind, text, earlier);
          const bodyChanged = JSON.stringify(next.lines) !== JSON.stringify(existing.lines);
          return { ...next, edited: true as const, ...(bodyChanged ? { ai: undefined } : {}) };
        })()
      : { key, title, lines: text, edited: true as const };
    const sections = existing ? j.sections.map((x) => (x.key === key ? placed : x)) : inOutlineOrder([...j.sections, placed], tags);
    const base: DemoJob = {
      ...touched(j),
      ...liveEdit(j),
      tags,
      sections,
      pageIntake: withoutPageIntake(j.pageIntake, kind),
      versions: [...j.versions, { n: j.versions.length + 1, at: Date.now(), note: `Edited ${title}`, sections }],
      part: `s:${key}`,
    };
    return stepped(j, base, `Edited ${title}`, 'doc', { keys: [key] });
  });
}

/**
 * The draft accepted (as it is, or edited): About us fills this job's About us; About the project fills its own section, added if the
 * template has none. Either goes into the context pack with its source. A project that replaces an earlier one marks the sections that
 * used it, and the chat offers to update them.
 */
export function acceptPageDraft(id: string, lines?: string[]) {
  const s0 = getState();
  const j0 = s0.jobs.find((x) => x.id === id);
  const d = j0?.pageDraft;
  if (!j0 || !d || s0.reviewerAs) return;
  const text = (lines ?? d.lines).map((l) => l.trim()).filter(Boolean);
  if (!text.length) return;
  const source: Source = lines && lines.join('\n') !== d.lines.join('\n') ? 'you told us' : d.source;
  const key = d.kind === 'about' ? 'about' : PROJECT_SECTION;
  const earlier = d.kind === 'project' ? j0.pack?.project : undefined;
  update((s) => ({
    ...s,
    org: d.kind === 'about' ? { ...s.org, websiteAsked: true } : s.org,
    jobs: s.jobs.map((j) => {
      if (j.id !== id) return j;
      const tags = placeIn(j.tags, key);
      const title = d.kind === 'project' && !j.tags.includes(key) ? LABEL.project : headingOf(s, j, key);
      const sec: Section = { key, title, lines: text, ai: true };
      const sections = j.sections.some((x) => x.key === key) ? j.sections.map((x) => (x.key === key ? intoSection(x, d.kind, text, earlier?.text) : x)) : inOutlineOrder([...j.sections, sec], tags);
      const used = earlier?.usedBy?.filter((k) => k !== key && j.tags.includes(k)) ?? [];
      const pack: ContextPack = { ...j.pack, ...(d.kind === 'about' ? { about: { text: text.join('\n'), source } } : { project: { text: text.join('\n'), source, at: Date.now(), usedBy: [], ...(used.length ? { redo: used } : {}) } }) };
      const renamed = d.kind === 'project' && !j.tags.includes(key) ? { ...j.renamed, [key]: LABEL.project } : j.renamed;
      const offerOrg = d.kind === 'about' && !s.org.about.trim() && s.me.role === 'owner';
      const conflicts = d.kind === 'project' ? projectConflicts(j, text.join('\n'), s.today) : [];
      // The facts first, one disagreement at a time with its own answers; then the offer to update the sections that used the old project.
      const ask = conflicts.length ? conflictQuestion(conflicts[0]) : used.length ? redoQuestion(used.map((k) => headingOf(s, j, k))) : null;
      const notes = [`**${LABEL[d.kind]}** is in the job, from ${source}.`, offerOrg ? "Your organisation has no About us yet: keep this one as its About us for every job? (Save it as your organisation's About us, on the section.)" : '', ask?.text ?? ''].filter(Boolean);
      const quick = ask?.quick;
      // U-3 Step B: no walk auto-approve; Undo via contentSnap (includes pack), not stepped/afterChange; put the draft card back on Undo.
      return {
        ...touched(j),
        ...liveEdit(j),
        tags,
        sections,
        renamed,
        pack,
        pageDraft: undefined,
        pageIntake: withoutPageIntake(j.pageIntake, d.kind),
        versions: [...j.versions, { n: j.versions.length + 1, at: Date.now(), note: `${LABEL[d.kind]} from ${source}`, sections }],
        chat: [...j.chat, say(notes.join(' '), quick)],
        lastChange: undefined,
        undoStep: { text: `${LABEL[d.kind]} from ${source}`, tab: 'doc', before: contentSnap(j), keys: [key], pageDraft: d },
      };
    }),
  }));
  const after = getState().jobs.find((x) => x.id === id);
  if (after?.setup === 'about' && d.kind === 'about') advanceFromAbout(id);
  else if (after?.setup === 'project' && d.kind === 'project') advanceFromProject(id);
  else goOn(id);
}

export function rejectPageDraft(id: string) {
  const s = getState();
  const j0 = s.jobs.find((x) => x.id === id);
  const d = j0?.pageDraft;
  if (!d || s.reviewerAs) return;
  update((st) => ({
    ...st,
    org: d.kind === 'about' ? { ...st.org, websiteAsked: true } : st.org,
    jobs: st.jobs.map((j) => (j.id === id ? { ...j, pageDraft: undefined, pageIntake: withoutPageIntake(j.pageIntake, d.kind), chat: [...j.chat, say(`Left as it was: nothing from the draft went on the job.`)] } : j)),
  }));
  const after = getState().jobs.find((x) => x.id === id);
  if (after?.setup === 'about' && d.kind === 'about') advanceFromAbout(id);
  else if (after?.setup === 'project' && d.kind === 'project') advanceFromProject(id);
  else goOn(id);
}

/** "Keep our profile's About us": the website is not asked again; the job keeps the organisation's About us. */
export function keepProfileAbout(id: string, said?: string) {
  update((s) => ({
    ...s,
    org: { ...s.org, websiteAsked: true },
    jobs: s.jobs.map((j) => (j.id === id && said ? { ...j, chat: [...j.chat, { id: `m${Math.random().toString(36).slice(2, 9)}`, from: 'user', text: said }, say("Fine: About us stays as your profile has it. Your website can be read later from the About us section or Organisation settings.")] } : j)),
  }));
  const after = getState().jobs.find((x) => x.id === id);
  if (after?.setup === 'about') advanceFromAbout(id);
  else goOn(id);
}

/** "Save as the organisation's About us": the job's About us becomes the one each new job starts from; jobs already written keep theirs. */
export function saveAboutForOrg(id: string) {
  const s = getState();
  const about = s.jobs.find((j) => j.id === id)?.sections.find((x) => x.key === 'about')?.lines.join('\n').trim();
  if (!about || s.reviewerAs || s.me.role !== 'owner') return;
  update((st) => ({ ...st, org: { ...st.org, about }, notice: { text: "Saved as your organisation's About us. New jobs start from it." } }));
}

/** A social link the organisation keeps (section 19, phase 5, E): an https address of its own account, saved only when the user adds it. */
export function socialUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim().startsWith('http') ? raw.trim() : `https://${raw.trim()}`);
    if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password) return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/** "LinkedIn", "X", "Facebook", "Instagram", "YouTube", or the address's own name. */
export function socialLabel(url: string): string {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  })();
  const known: Record<string, string> = { 'linkedin.com': 'LinkedIn', 'x.com': 'X', 'twitter.com': 'X', 'facebook.com': 'Facebook', 'instagram.com': 'Instagram', 'youtube.com': 'YouTube' };
  return known[host] ?? host;
}

/** The organisation's links are its own settings: only the owner adds or removes them, as with About us and the texts kept for every job. */
export function canEditOrgSocial(s: State): boolean {
  return !s.reviewerAs && s.me.role === 'owner';
}

export function addOrgSocial(raw: string): boolean {
  const s = getState();
  const url = socialUrl(raw);
  if (!url || !canEditOrgSocial(s) || (s.org.social ?? []).includes(url)) return false;
  update((st) => ({ ...st, org: { ...st.org, social: [...(st.org.social ?? []), url], socialAsked: true } }));
  return true;
}

export function removeOrgSocial(url: string) {
  if (!canEditOrgSocial(getState())) return;
  update((st) => ({ ...st, org: { ...st.org, social: (st.org.social ?? []).filter((x) => x !== url) } }));
}

/** Includes or leaves out one of the organisation's links on this job only; a live job's page then says Updated. */
export function toggleJobSocial(id: string, url: string) {
  if (getState().reviewerAs) return;
  update((st) => ({ ...st, org: { ...st.org, socialAsked: true }, jobs: st.jobs.map((j) => (j.id === id ? { ...j, ...liveEdit(j), socialOff: (j.socialOff ?? []).includes(url) ? (j.socialOff ?? []).filter((x) => x !== url) : [...(j.socialOff ?? []), url] } : j)) }));
}

/** The organisation's links this job shows: all of them but those it leaves out. */
export function socialOf(s: State, j: DemoJob): string[] {
  return (s.org.social ?? []).filter((u) => !(j.socialOff ?? []).includes(u));
}

/** The project's disagreements with the job still to answer, one at a time. */
export function openConflicts(j: DemoJob, today: number): ReturnType<typeof projectConflicts> {
  const p = j.pack?.project;
  return p ? projectConflicts(j, p.text, today).filter((c) => !(p.answered ?? []).includes(c.fact)) : [];
}

/** The offer to update the sections written from the project this one replaced. */
export function redoQuestion(headings: string[]): { text: string; quick: string[] } {
  return { text: `The project changed: ${headings.join(', ')} used the earlier one. Shall I update them?`, quick: ['Update them', 'Keep them as they are'] };
}

/** The question for one disagreement, with its two answers. */
export function conflictQuestion(c: ReturnType<typeof projectConflicts>[number]): { text: string; quick: string[] } {
  return { text: `The project text gives the ${FACT_WORD[c.fact]} as ${c.page}; the job says ${c.now}. Which should the job keep?`, quick: [`Keep ${c.now}`, `Use ${c.page}`] };
}

/**
 * An answer to a disagreement between the project text and a fact: the job keeps its own (`value` null), or takes the page's. A country
 * taken from the page brings its place and country code with it, so the job never names one country and a place in another.
 */
export function resolveConflict(id: string, fact: 'country' | 'donor' | 'deadline', value: string | null) {
  const j = getState().jobs.find((x) => x.id === id);
  if (!j?.pack?.project) return;
  if (value !== null) {
    if (fact === 'donor') setFacts(id, { donor: value });
    else if (fact === 'country') {
      // The place the project text names in that country, else the country itself; its code and time zone from the demo's places.
      const named = extractFacts(j.pack.project.text, getState().today).facts;
      const place = PLACES.find((p) => p.country.toLowerCase() === value.toLowerCase());
      const location = named.country === value && named.location ? named.location : value;
      setFacts(id, { country: value, iso: place?.iso ?? named.iso ?? '', location, ...(place?.tz ? { timezone: place.tz } : {}) });
    } else {
      const { facts } = extractFacts(value, getState().today);
      if (facts.deadline) setFacts(id, { deadline: facts.deadline });
    }
  }
  updateJob(id, (x) => (x.pack?.project ? { ...x, pack: { ...x.pack, project: { ...x.pack.project, answered: Array.from(new Set([...(x.pack.project.answered ?? []), fact])) } } } : x));
}

/** Pay a suggestion may name: the organisation's scale for this grade, or the labelled sample for this place; with why showing pay helps. */
export function payBasis(s: State, j: DemoJob): { source: Source; min: number; max: number; currency: string; period: Period; reason: string } | null {
  const h = salarySuggestion(j.facts, s.org);
  if (!h) return null;
  return { source: h.basis.startsWith('Your ') ? 'your salary scale' : 'similar jobs in this place (sample)', min: h.min, max: h.max, currency: h.currency, period: h.period, reason: `${h.basis}. ${SALARY_FACTS[0].text} (${SALARY_FACTS[0].source})` };
}

/** Years of experience a suggestion may name: what similar jobs ask (sample figures), only when there are enough to compare. */
export function yearsBasis(s: State, j: DemoJob): { source: Source; years: number; reason: string } | null {
  const years = typicalYears(j, s);
  return years ? { source: 'similar jobs in this place (sample)', years, reason: `Similar open jobs ask a median of ${years} years (sample figures in the demo); a higher bar puts off capable people.` } : null;
}

const plain = (t: string) => t.replace(/(\d)[,.\s](?=\d{3}\b)/g, '$1');

/**
 * A suggestion from the AI, checked (section 19, phase 5, A): its source must be one of the named kinds; a scale or sample figure must
 * equal what the demo itself returns for this job; a figure from a page must appear in the accepted text; one rejected is not offered
 * again. Returns the suggestion, or why it is refused.
 */
export function checkSuggestion(s: State, j: DemoJob, a: Record<string, unknown>): Suggestion | string {
  const fact = a.fact === 'salary' || a.fact === 'experience' ? a.fact : null;
  const source = SOURCES.find((x) => x === a.source);
  if (!fact) return 'a suggestion for a fact the demo does not suggest';
  if (!source || source === 'you told us') return `a suggestion for ${fact === 'salary' ? 'pay' : 'experience'} without a source`;
  if ((j.suggestions ?? []).some((x) => x.fact === fact && x.state === 'rejected')) return `a suggestion for ${fact === 'salary' ? 'pay' : 'experience'}: you rejected it on this job`;
  const reason = typeof a.reason === 'string' ? a.reason.trim().slice(0, 300) : '';
  const id = `sg-${Math.random().toString(36).slice(2, 8)}`;
  if (fact === 'salary') {
    const min = Number(a.min);
    const max = Number(a.max);
    const currency = typeof a.currency === 'string' ? a.currency.toUpperCase() : '';
    const period = ['hour', 'day', 'month', 'year'].includes(String(a.period)) ? (String(a.period) as Period) : null;
    if (!Number.isFinite(min) || !Number.isFinite(max) || !currency || !period) return 'a pay suggestion without a figure';
    const value = `${currency} ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')} a ${period}`;
    // Pay is never copied from a page (section 19, phase 5, A; the user, 13 November 2026): only the scale or the labelled sample.
    if (source === 'your website' || source === 'the project page') return 'a pay suggestion from a page: pay comes only from your salary scale or similar jobs';
    const basis = payBasis(s, j);
    if (!basis || basis.source !== source || basis.min !== min || basis.max !== max || basis.currency !== currency || basis.period !== period) return 'a pay suggestion that differs from the scale or the sample';
    return { id, fact, value, source, reason: basis.reason, state: 'open', pay: { min, max, currency, period } };
  }
  const years = Number(a.years);
  if (!Number.isInteger(years) || years < 0 || years > 40) return 'an experience suggestion without a number of years';
  if (source === 'your website' || source === 'the project page') {
    const text = plain(`${j.pack?.about?.text ?? ''} ${j.pack?.project?.text ?? ''}`);
    if (!new RegExp(`\\b${years}\\b`).test(text)) return 'an experience suggestion that the accepted text does not give';
    return { id, fact, value: `${years} years`, source, reason: reason || `From ${source}.`, state: 'open', years };
  }
  const basis = yearsBasis(s, j);
  if (!basis || basis.source !== source || basis.years !== years) return 'an experience suggestion that differs from the sample';
  return { id, fact, value: `${years} years`, source, reason: basis.reason, state: 'open', years };
}

/** Puts a checked suggestion on the job, open, replacing an open one for the same fact. */
export function offerSuggestion(id: string, sg: Suggestion) {
  updateJob(id, (j) => ({ ...j, suggestions: [...(j.suggestions ?? []).filter((x) => !(x.fact === sg.fact && x.state === 'open')), sg] }));
}

/**
 * Accepted (as it is, or edited): it becomes a fact the user gave, in the context pack with its source, and pay is set on the job. Its
 * numbers are then numbers the user gave, for the checks on what the AI writes.
 */
export function acceptSuggestion(id: string, sgId: string, edited?: { min?: number; max?: number; years?: number }): string | null {
  const s = getState();
  const j = s.jobs.find((x) => x.id === id);
  const sg = j?.suggestions?.find((x) => x.id === sgId && x.state === 'open');
  if (!j || !sg || s.reviewerAs) return null;
  const wrong = editedWrong(sg, edited);
  if (wrong) return wrong;
  const changed = edited && ((sg.pay && (edited.min !== sg.pay.min || edited.max !== sg.pay.max)) || (sg.years !== undefined && edited.years !== sg.years));
  const source: Source = changed ? 'you told us' : sg.source;
  const pay = sg.pay ? { ...sg.pay, min: edited?.min ?? sg.pay.min, max: edited?.max ?? sg.pay.max } : undefined;
  const years = edited?.years ?? sg.years;
  const value = pay ? `${pay.currency} ${pay.min.toLocaleString('en-US')} to ${pay.max.toLocaleString('en-US')} a ${pay.period}` : `${years} years`;
  if (pay) setFacts(id, { salaryMode: 'range', salaryMin: pay.min.toLocaleString('en-US'), salaryMax: pay.max.toLocaleString('en-US'), currency: pay.currency, period: pay.period });
  updateJob(id, (x) => ({
    ...x,
    pack: { ...x.pack, facts: [...(x.pack?.facts ?? []).filter((f) => f.fact !== sg.fact), { fact: sg.fact === 'salary' ? 'pay' : 'experience', value, source }] },
    suggestions: (x.suggestions ?? []).map((y) => (y.id === sgId ? { ...y, state: 'accepted' as const, value } : y)),
    walk: x.walk && sg.fact === 'salary' ? { ...x.walk, settled: Array.from(new Set([...x.walk.settled, 'salary'])) } : x.walk,
    chat: [...x.chat, say(`${sg.fact === 'salary' ? 'Pay' : 'Experience'}: ${value}, from ${source}. It is on the job now.`)],
  }));
  goOn(id);
  return null;
}

/** Why edited figures cannot go on the job: pay as whole amounts from 0, the lower first; experience as whole years up to 40. */
export function editedWrong(sg: Suggestion, edited?: { min?: number; max?: number; years?: number }): string | null {
  if (!edited) return null;
  if (sg.pay) {
    const min = edited.min ?? sg.pay.min;
    const max = edited.max ?? sg.pay.max;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0) return 'Pay needs two amounts, as numbers from 0.';
    if (min > max) return 'The lower amount comes first.';
    return null;
  }
  const years = edited.years ?? sg.years;
  return years === undefined || !Number.isInteger(years) || years < 0 || years > 40 ? 'Experience needs a whole number of years, up to 40.' : null;
}

export function rejectSuggestion(id: string, sgId: string) {
  if (getState().reviewerAs) return;
  updateJob(id, (x) => ({ ...x, suggestions: (x.suggestions ?? []).map((y) => (y.id === sgId ? { ...y, state: 'rejected' as const } : y)), chat: [...x.chat, say('Left off the job; I will not suggest it again here.')] }));
  goOn(id);
}

/**
 * The survey card (section 19, phase 5, A): only what the demo already has for the role family it recognises: the questions it asks,
 * pay and experience figures (labelled samples), its checks on years and on the essentials list, and the length band. The organisation's
 * own job profile, when one was used, comes before it. W-54's library is not validated, so nothing of it is imported.
 */
export function surveyCard(s: State, j: DemoJob) {
  const role = roleByKey(j.family);
  const pay = payBasis(s, j);
  const years = yearsBasis(s, j);
  const profile = j.audit.find((a) => a.what.startsWith('Started from the job profile of '))?.what.replace('Started from the job profile of ', '');
  return {
    roleFamily: role.title,
    sector: role.sector,
    questions: ASKS,
    pay: pay ? { min: pay.min, max: pay.max, currency: pay.currency, period: pay.period, source: pay.source } : null,
    experience: years ? { years: years.years, source: years.source } : null,
    checks: ['years of experience against similar jobs (their median)', 'the length of the essentials list against similar jobs (their median)'],
    length: `about ${wordsFor(j.tags.length)} words for ${j.tags.length} sections in ${formatOf(s, j.format).label}`,
    profileFirst: profile ?? null,
  };
}
