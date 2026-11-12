import { approvalRequired } from './approval';
import { commitmentText, COMMITMENTS, extractFacts, headingFor, LANGUAGES, longDate, placeOf, SECTION_BY_KEY, salarySuggestion } from './engine';
import { isWritten, type Step } from './flow';
import { marketCheck, workingDay } from './market';
import { BADGE, canGoFree, FREE_PER_MONTH, freeLeft, LANGS_INCLUDED, LANGUAGE_PRICE, langSlots, LISTED_DAYS, monthFor, monthName, nextPaidJob, paidJobsLeft, singlePrice, usd, viaFor } from './plans';
import { contentOf, describeStyle, proposedStyle, wordsFor } from './setup';
import { jobLang, langOf, versionChoices, versionsOf } from './translate';
import type { ApplySettings, AskKind, ChatMsg, DemoJob, Facts, Format, State } from './types';

/**
 * The rules' side of a new employer's writing (employer-side plan, section 19, steps 3 to 7): what the chat says at each step when the
 * AI is off or leaves a step unasked, and how a typed answer is read. The AI words the same steps itself.
 */

export const PACE_QUICK = ['One section at a time', "Write it all, then I'll review"];
export const GOOD = 'Good, next';
export const ALL_GOOD = 'All good, approve the rest';
export const CHANGE_YES = 'Yes, change it';
export const CHANGE_NO = 'Keep the text as it is';
export const NONE_OF_THESE = 'None of these';
export const KEEP_FIXED = 'Keep them';
export const NO_THANKS = 'No, thanks';
export const LEAVE_IT = 'Leave it';
export const GENUINE = "It's a genuine requirement";
export const OTHER_WORDING = 'Suggest other wording';
export const OPEN_PUBLISH = 'Open Check and publish';
export const CHOOSE_SDGS = 'Choose them myself';
export const NO_SDGS = 'No SDGs';

/** "SDG 3, 6, 16": the organisation's goals, at most three, as the Details row names them. */
export function orgGoals(s: State): string {
  return `SDG ${s.org.sdgs.slice(0, 3).join(', ')}`;
}

export function orgGoalsAnswer(s: State): string {
  return `Use your organisation's goals (${orgGoals(s)})`;
}
const DRAFT_INTRO = 'Here is the whole draft';

export const ASK_TEXT: Record<AskKind, string> = {
  title: 'What is the job title?',
  place: 'Where is the job based?',
  contract: 'What kind of contract is it?',
  grade: 'Is there a grade or band for it?',
  eligibility: 'Who can apply: anyone, nationals of the country, people with the right to work there, or internal candidates only?',
  languages: 'Which languages does the job need?',
  safeguarding: 'What safeguarding level does the post have: high, medium, or low contact with children or adults at risk?',
  salary: 'What does it pay?',
  deadline: 'When do applications close?',
  method: 'How should people apply: through your careers site, by email, or an online form?',
};

export function stepMsg(text: string, step: string, quick?: string[], ask?: AskKind): ChatMsg {
  return { id: `m${Math.random().toString(36).slice(2, 9)}`, from: 'ai', text, quick, ask, step };
}

function heading(job: DemoJob, format: Format, key: string): string {
  return job.sections.find((x) => x.key === key)?.title ?? job.renamed?.[key] ?? headingFor(key, format);
}

/** The first line that differs, before and after, for showing a change in the chat. */
function firstChange(before: string[], after: string[]): [string, string] | null {
  for (let i = 0; i < Math.max(before.length, after.length); i++) if (before[i] !== after[i]) return [before[i] ?? '', after[i] ?? ''];
  return null;
}

const plain = (l: string) => l.replace(/^- /, '');

/** What the rules say for a step; `aiOn` offers the AI's own help where it has some (other wording for a check point). */
export function promptFor(s: State, job: DemoJob, format: Format, step: Step, key: string, aiOn: boolean): ChatMsg[] {
  const all = job.walk?.pace === 'all';
  const draftShown = job.chat.some((m) => m.text.startsWith(DRAFT_INTRO));
  const intro = all && !job.walk?.approved.length && !draftShown ? `${DRAFT_INTRO}, written ${describeStyle(job.style ?? [])}. Let's go through it. ` : '';
  switch (step.kind) {
    case 'setup':
      if (step.stage === 'style') return [stepMsg(overview(format, job.tags.length, wordsFor(job.tags.length), contentOf(format, s.org.orgType), styleQuestion(s)), key, STYLE_QUICK)];
      if (step.stage !== 'pace') return [];
      return [stepMsg('Shall I write it one section at a time, so you can shape each one as we go, or write it all and then go through it with you?', key, PACE_QUICK)];
    case 'change': {
      const p = job.walk?.pending;
      if (!p) return [];
      const shown = p.changes
        .slice(0, 2)
        .map((c) => {
          const was = job.sections.find((x) => x.key === c.key)?.lines ?? [];
          const diff = firstChange(was, c.lines);
          return diff ? `In **${heading(job, format, c.key)}**: “${plain(diff[0])}” becomes “${plain(diff[1])}”.` : '';
        })
        .filter(Boolean);
      return [stepMsg(`You changed the ${p.what}, and ${p.changes.length === 1 ? 'a section you approved mentions' : `${p.changes.length} sections you approved mention`} it.\n${shown.join('\n')}\nChange ${p.changes.length === 1 ? 'it' : 'them'} there too?`, key, [CHANGE_YES, CHANGE_NO])];
    }
    case 'genuine':
      return [stepMsg(`In a line, why is “${job.walk?.awaiting?.label ?? 'it'}” a genuine requirement of this job?`, key, ['Never mind'])];
    case 'ask': {
      const where = step.section ? `${all && isWritten(job, step.section) ? `${intro}Before you approve` : 'Before I write'} **${heading(job, format, step.section)}**: ` : step.fact === 'title' ? '' : 'For the listing: ';
      let extra = '';
      if (step.fact === 'salary') {
        const hint = salarySuggestion(job.facts, s.org);
        const law = placeOf(job.facts.location)?.payLaw;
        extra = ` Jobs that show pay get more applications.${hint ? ` A suggestion is above, with its basis.` : ''}${law ? ` ${law}` : ''}`;
      }
      return [stepMsg(`${where}${ASK_TEXT[step.fact]}${extra}`, key, undefined, step.fact)];
    }
    case 'write':
      return [];
    case 'approve': {
      const name = heading(job, format, step.section);
      const quick = all ? [GOOD, ALL_GOOD] : [GOOD];
      const firstWritten = job.versions.find((v) => v.sections.some((x) => x.key === step.section && x.lines.length))?.sections.find((x) => x.key === step.section)?.lines;
      const edited = Boolean(firstWritten) && JSON.stringify(firstWritten) !== JSON.stringify(job.sections.find((x) => x.key === step.section)?.lines);
      if (step.section === 'about') return [stepMsg(`${intro}**${name}** comes from your organisation profile, word for word. Good as it is?`, key, quick)];
      if (step.section === 'apply') return [stepMsg(`${intro}**${name}** is written from your application settings. Good, or change something?`, key, quick)];
      const text = edited ? `**${name}**: good now, or change something else?` : intro ? `${intro}First, **${name}**: good, or change something?` : `Here is **${name}**. Good, or change something?`;
      return [stepMsg(text, key, quick)];
    }
    case 'details':
      return [stepMsg('Anything else for the listing: the number of positions, direct reports, the start date, or the donor?', key, [NONE_OF_THESE])];
    case 'sdgs':
      return [stepMsg(`No SDG is clear from this role. Shall I use your organisation's goals (${orgGoals(s)})? The job page then says ${s.org.name} works towards them.`, key, [orgGoalsAnswer(s), CHOOSE_SDGS, NO_SDGS])];
    case 'fixed': {
      if (!job.commitments.length) return [stepMsg("This job has no fixed text yet. Shall I add the usual ones, Safeguarding, PSEA, and the no-fee notice, word for word from your settings?", key, ['Add them', 'No fixed text'])];
      const items = job.commitments.map((k) => ({ label: COMMITMENTS.find((c) => c.key === k)?.label ?? k, own: commitmentText(k, s.org, job.facts).own }));
      const starter = items.filter((i) => !i.own).map((i) => i.label);
      return [
        stepMsg(
          `Then your organisation's fixed text, added word for word from your settings: ${items.map((i) => i.label).join(', ')}.${starter.length ? ` ${starter.join(', ')} ${starter.length === 1 ? 'is a starter text' : 'are starter texts'}, as your settings have none of your own.` : ''}${jobLang(job) !== 'en' && !s.org.fixedLangs?.includes(jobLang(job)) ? ` This is the first ${langOf(jobLang(job)).label} job: confirming them here keeps them for every ${langOf(jobLang(job)).label} job (in the demo their wording stays as your settings have it).` : ''} Keep these for this job, or tell me which to leave out.`,
          key,
          [KEEP_FIXED],
        ),
      ];
    }
    case 'suggest': {
      const list = step.sections.map((k) => `**${headingFor(k, format)}** (${SECTION_BY_KEY[k]?.hint.toLowerCase()})`);
      return [stepMsg(`${step.sections.length === 1 ? 'One more section' : `${step.sections.length} more sections`} would make this stronger: ${list.join('; ')}. Add any?`, key, [...step.sections.map((k) => `Add ${headingFor(k, format)}`), NO_THANKS])];
    }
    case 'check': {
      const p = step.point;
      const head = `From the basic check: **${p.title}**.${p.detail ? ` ${p.detail}` : ''}`;
      if (p.hit) return [stepMsg(`${head} Edit it with the pencil, write the new wording here, or keep it.`, key, [...(aiOn ? [OTHER_WORDING] : []), GENUINE, LEAVE_IT])];
      if (p.key === 'deadline-weekend' || p.key === 'deadline-holiday') return [stepMsg(head, key, [`Move it to ${longDate(workingDay(job.facts.deadline, job.facts.iso))}`, LEAVE_IT])];
      if (p.key.startsWith('dupe-')) return [stepMsg(head, key, ['Remove the repeat', LEAVE_IT])];
      if (p.key.startsWith('date-')) return [stepMsg(head, key, ['Use the closing date', LEAVE_IT])];
      if (p.key.startsWith('fill-')) return [stepMsg(`${head} Fill it in with the pencil, or tell me what it should say.`, key, [LEAVE_IT])];
      return [stepMsg(head, key, [LEAVE_IT])];
    }
    case 'keep':
      return keepPrompt(s, job, step.what, key);
    default:
      return laterPrompt(s, job, step, key, aiOn);
  }
}

export const KEEP_ALL = 'Keep for every job';
export const THIS_JOB = 'Only this job';

/** Step 10: the first time the fixed text or the way to apply comes up, the offer to keep it for every job. */
export function keepPrompt(s: State, job: DemoJob, what: 'fixed' | 'apply', key: string): ChatMsg[] {
  const how = what === 'fixed' ? `these fixed texts (${job.commitments.map((k) => COMMITMENTS.find((c) => c.key === k)?.label ?? k).join(', ')})` : `this way to apply (${{ system: 'through your careers site', email: `by email${job.apply.address ? ` to ${job.apply.address}` : ''}`, form: 'with an online form', formOnly: 'with an online form, without CVs' }[job.apply.method]})`;
  return [stepMsg(`Shall I keep ${how} for every job? Each new job then starts with them, and they can be locked in Organisation settings, the only place they are changed afterwards. Jobs already published keep their own.`, key, [KEEP_ALL, THIS_JOB])];
}

export const PUBLISH_FREE = 'Publish free';
export const AMPLIFY = 'Amplify';
export const USE_PACKAGE = 'Use a package job';
export const NO_MORE_LANGS = 'No other languages';
export const MARK_REVIEWED = 'Mark it as reviewed';
export const SHOW_FLYER = 'Show the flyer';
export const INVITE = 'Invite people';
export const NOT_NOW = 'Not now';
export const SEND_REVIEW = 'Send for review';
export const NO_REVIEW = 'No review';
export const REMIND = 'Remind them';
export const SKIP_APPROVAL = 'Publish without approval';
export const SHOW_PREVIEW = 'Show the preview';

/** What Amplify adds, in a line, with how many language versions it includes. */
export function amplifyLine(s: State): string {
  const package_ = nextPaidJob(s);
  return `listed ${LISTED_DAYS.amplify} days, featured with the “${BADGE}” badge, the market check, the full advert check, ${package_ ? LANGS_INCLUDED.package : LANGS_INCLUDED.single} language ${(package_ ? LANGS_INCLUDED.package : LANGS_INCLUDED.single) === 1 ? 'version' : 'versions'} besides its own (more at ${usd(LANGUAGE_PRICE)} each), a field-post flyer, and Reach emails when it goes live`;
}

/** Steps 8 and 9 (section 19): what the rules say when the AI is off or leaves a step unasked. */
function laterPrompt(s: State, job: DemoJob, step: Step, key: string, aiOn = false): ChatMsg[] {
  const own = langOf(jobLang(job)).label;
  switch (step.kind) {
    case 'plan': {
      const month = monthFor(s, job.publishOn ?? null);
      const left = freeLeft(s, month);
      const onHand = paidJobsLeft(s);
      const free = canGoFree(s, job.id, job.publishOn ?? null);
      const price = singlePrice(s);
      const freeText = free ? `**Free**: listed ${LISTED_DAYS.free} days, standard placement, in ${own} only; ${left} of ${FREE_PER_MONTH} free jobs left in ${monthName(month)}, used only when it is published.` : `Both free jobs for ${monthName(month)} are used, so it goes out with **Amplify** or a package job.`;
      const ampText = s.org.verified ? `**Amplify** (${onHand ? `uses 1 of your ${onHand} package ${onHand === 1 ? 'job' : 'jobs'}` : usd(price.amount)}): ${amplifyLine(s)}.` : 'Amplify is for verified organisations: verify yours in Organisation settings to choose it.';
      const quick = [...(free ? [PUBLISH_FREE] : []), ...(s.org.verified ? [onHand ? USE_PACKAGE : AMPLIFY] : [])];
      return [stepMsg(`The job description is ready. Next, how it goes out.\n${freeText}\n${ampText}\nWhich one? Both are side by side in the panel, with the packages.`, key, quick)];
    }
    case 'market':
    case 'full': {
      const p = step.point;
      const where = step.kind === 'market' ? `From the market check (sample figures, ${marketCheck(job, s, job.publishOn ?? null).count} similar open jobs)` : 'From the full advert check, compared with similar jobs';
      return [stepMsg(`${where}: **${p.title}**.${p.detail ? ` ${p.detail}` : ''}`, key, [...(p.fix ? [p.fix.label] : []), LEAVE_IT])];
    }
    case 'langs': {
      const have = versionsOf(job);
      const offer = versionChoices(job).filter((l) => !have.includes(l.key));
      const included = langSlots(job, 'amplify', viaFor(s, job));
      const lead = have.length
        ? `Added: ${have.map((k) => langOf(k).label).join(', ')}. Any other language?${have.length >= included ? ` Each further one is ${usd(LANGUAGE_PRICE)}.` : ''}`
        : `It is written in ${own}. Amplify includes ${included} language ${included === 1 ? 'version' : 'versions'} besides it; each further one is ${usd(LANGUAGE_PRICE)}. Each version can have its own sections where another country needs other content; the facts stay the same. Which languages?`;
      return [stepMsg(lead, key, [...offer.map((l) => `Add ${l.label}`), NO_MORE_LANGS])];
    }
    case 'version': {
      const label = langOf(step.lang).label;
      const how = job.translations?.[step.lang]?.sections.some((x) => x.ai) ? `written by the AI from the ${own}` : aiOn ? 'being written by the AI; meanwhile the demo’s own draft is there, with lines still in ' + own + ' marked' : `drafted: in the demo the headings, standard sentences, dates, and places are translated, and lines still in ${own} are marked`;
      return [stepMsg(`The ${label} version is in its tab, ${how}. Change anything there or ask me here, then mark it as reviewed: only reviewed versions appear.`, key, [MARK_REVIEWED, `Remove ${label}`])];
    }
    case 'flyer':
      return [stepMsg('A one-page flyer with a QR code to the job, for notice boards in field offices, clinics, and community centres, in any reviewed language. Shall I show it?', key, [SHOW_FLYER, NO_THANKS])];
    case 'reach':
      return [stepMsg('Reach invites people by email when the job goes live: candidates you know, and your team to pass it on. Shall I prepare the invitations? You choose who gets them and edit both emails in their tab.', key, [INVITE, NOT_NOW])];
    case 'review': {
      if (approvalRequired(s, job)) return [{ ...stepMsg('Your organisation asks for approval on this job before it is published. Who should review it?', key), card: 'review' }];
      return [stepMsg('Would anyone like to read it before it goes out? Review is optional here: they comment and approve, and publishing does not wait for them.', key, [SEND_REVIEW, NO_REVIEW])];
    }
    case 'waiting': {
      const r = job.review;
      const askers = r.reviewers.filter((x) => x.decision === 'changes');
      const waiting = r.reviewers.filter((x) => !x.decision).map((x) => x.name.split(' ')[0]);
      const skip = canSkip(s, job) ? [SKIP_APPROVAL] : [];
      if (askers.length) {
        const notes = askers.filter((a) => a.note).map((a) => `“${a.note}”`).join(' ');
        return [stepMsg(`${askers.map((a) => a.name.split(' ')[0]).join(' and ')} asked for changes${notes ? `: ${notes}` : '.'} Make them here or in the text, then send round ${r.round + 1}: they see only what changed.`, key, [`Send round ${r.round + 1}`, ...skip])];
      }
      return [stepMsg(`Sent for review. Waiting for ${waiting.join(' and ') || 'your reviewers'}${r.due ? `, due ${longDate(r.due)}` : ''}; their comments and decisions appear in Review. You can keep working on it meanwhile.`, key, [REMIND, ...skip])];
    }
    case 'publish': {
      const free = job.choice !== 'amplify';
      return [{ ...stepMsg(`Ready to go out${free ? ' free' : ' with Amplify'}. Publish now, or choose a date; the button says exactly what happens.${free ? ` A free job is used when it goes live; scheduled, it holds its month's place until then.` : ''}`, key, [SHOW_PREVIEW]), card: 'publish' }];
    }
    case 'live':
      return [{ ...stepMsg(job.status === 'scheduled' ? `Scheduled for ${longDate(job.scheduledFor ?? '')}. It goes live that day${job.plan === 'amplify' ? ', and Reach sends then' : ''}.` : `It's live on AidJobs.${job.plan === 'amplify' ? '' : ' Visitors can share it from the job page.'} A copy can now be downloaded.`, key), card: 'live' }];
    default:
      return [];
  }
}

/** Who may publish without approval: where approval is required and not given, only the owner, unless nobody may skip it. */
function canSkip(s: State, j: DemoJob): boolean {
  return !s.reviewerAs && s.me.role === 'owner' && !s.org.noSkip && approvalRequired(s, j);
}

/** A typed answer to a question, read by the rules: the facts it gives, the method, or that the default is kept. Null when unreadable. */
export function readAnswer(kind: AskKind, text: string, s: State, job: DemoJob): { patch: Partial<Facts>; method?: ApplySettings['method']; address?: string } | null {
  const t = text.trim();
  const lower = t.toLowerCase();
  const none = /^(no|none|nope|not needed|n\/a|no need|skip|nothing|not applicable)\b/.test(lower);
  switch (kind) {
    case 'grade': {
      if (none || /\bno grade\b|\bnot graded\b|\bungraded\b/.test(lower)) return { patch: { grade: '' } };
      const own = s.org.scale.find((r) => new RegExp(`\\b${r.grade}\\b`, 'i').test(t));
      if (own) return { patch: { grade: own.grade } };
      const g = t.match(/\b(P-?[1-5]|D-?[12]|G-?[1-7]|NO-?[A-D]|band\s+\w+|grade\s+\w+)\b/i);
      return g ? { patch: { grade: g[1].replace(/^(band|grade)\s+/i, '').toUpperCase().replace('-', '') } } : null;
    }
    case 'eligibility':
      if (/\bnational/.test(lower)) return { patch: { eligibility: 'nationals' } };
      if (/\binternal|\bstaff only|\bcurrent staff/.test(lower)) return { patch: { eligibility: 'internal' } };
      if (/right to work|work permit|authori[sz]ed to work|allowed to work/.test(lower)) return { patch: { eligibility: 'righttowork' } };
      if (/\b(anyone|anybody|everyone|all|open|any)\b/.test(lower)) return { patch: { eligibility: 'anyone' } };
      return null;
    case 'languages': {
      const named = LANGUAGES.filter((l) => new RegExp(`\\b${l}\\b`, 'i').test(t));
      if (named.length) return { patch: { languages: named.includes('English') ? ['English', ...named.filter((l) => l !== 'English')] : named } };
      return none ? { patch: { languages: [] } } : null;
    }
    case 'safeguarding': {
      const level = lower.match(/\b(high|medium|low)\b/)?.[1] as Facts['safeguarding'] | undefined;
      if (level) return { patch: { safeguarding: level } };
      return none || /no contact/.test(lower) ? { patch: { safeguarding: '' } } : null;
    }
    case 'salary': {
      if (none || /not shown|don'?t show|do not show|hide|hidden|confidential|no salary/.test(lower)) return { patch: { salaryMode: 'hidden' } };
      if (/competitive/.test(lower)) return { patch: { salaryMode: 'competitive' } };
      if (/\bscale\b/.test(lower)) return { patch: { salaryMode: 'scale' } };
      if (/\bby grade\b|\bthe grade\b/.test(lower)) return { patch: { salaryMode: 'grade' } };
      const read = extractFacts(`salary ${/[A-Z]{3}|[$€£]/.test(t) ? t : `${job.facts.currency || 'USD'} ${t}`}`, s.today, job.facts).facts;
      return read.salaryMin ? { patch: { salaryMode: read.salaryMode, salaryMin: read.salaryMin, salaryMax: read.salaryMax, currency: read.currency, period: read.period } } : null;
    }
    case 'method': {
      const email = t.match(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/)?.[0];
      if (email || /e-?mail/.test(lower)) return { patch: {}, method: 'email', address: email };
      if (/\bform\b/.test(lower)) return { patch: {}, method: 'form' };
      if (/careers|site|website|portal|online|system/.test(lower)) return { patch: {}, method: 'system' };
      return null;
    }
    default:
      return null;
  }
}

/** The details of step 6 read from a message: positions, direct reports, the start date, and the donor. */
export function readDetails(text: string): Partial<Facts> {
  const out: Partial<Facts> = {};
  const positions = text.match(/\b(\d{1,3})\s+(?:positions?|posts?|people|vacancies)\b/i);
  if (positions) out.positions = positions[1];
  const reports = text.match(/\b(\d{1,3}|no)\s+direct reports?\b/i);
  if (reports) out.directReports = reports[1].toLowerCase() === 'no' ? 'none' : reports[1];
  const start = text.match(/\bstart(?:s|ing)?(?:\s+(?:on|in|by|from))?\s+([\p{L}\d ,]{3,30}?)(?=[.;]|,\s|\s+and\b|$)/iu);
  if (start) out.startDate = start[1].trim();
  const donor = text.match(/\b(?:funded by|donor(?: is)?:?)\s+([\p{L}\d .&'-]{2,60}?)(?=[.;]|,\s|$)/iu);
  if (donor) out.donor = donor[1].trim();
  return out;
}

/** Which of the organisation's fixed texts a message asks to leave out ("without PSEA", "remove the counter-terrorism one"). */
export function fixedNamed(text: string, keys: string[]): string[] {
  const t = text.toLowerCase();
  return keys.filter((k) => {
    const c = COMMITMENTS.find((x) => x.key === k);
    if (!c) return false;
    const words = [c.label.toLowerCase(), c.key, ...c.label.toLowerCase().split(/[\s,-]+/).filter((w) => w.length > 5)];
    return words.some((w) => t.includes(w));
  });
}

/** The quick answer to the pace question, or a request to change it, read from a message. */
export function paceIn(text: string): 'step' | 'all' | null {
  const t = text.toLowerCase();
  if (/\b(all|whole|everything|at once|in one go|full draft|the rest)\b/.test(t) && /\b(write|draft|do)\b|^write it all/.test(t)) return 'all';
  if (/\bone (section )?at a time\b|\bsection by section\b|\bstep by step\b|\bbit by bit\b|\bone by one\b/.test(t)) return 'step';
  return null;
}

/** The overview of a template, before anything is written (step 3), with the style question. */
export function overview(format: Format, count: number, words: number, content: string, question: string): string {
  return `**${format.label}** it is: ${count} sections, about ${words} words, ${content}. ${question}`;
}

export const STYLE_QUICK = ['Yes, write it that way', 'More formal', 'Shorter sentences'];

/** "How should it sound?", asked once the template is chosen and before anything is written. */
export function styleQuestion(s: State): string {
  return `How should it sound? ${s.org.voice.length ? 'Your organisation writes' : 'Organisations like yours usually write'} ${describeStyle(proposedStyle(s))}. Shall I write it that way, or differently?`;
}
