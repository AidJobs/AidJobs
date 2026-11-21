'use client';

import { ArrowLeft, ChevronDown, Eye, FileText, History, Link2, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useIsPhone } from '@/components/site/BottomSheet';
import Tip from '@/components/site/Tip';
import { applyFormat, applyOrgSdgs, applyOutline, applyTemplate, bringDocument, canDelete, chatNote, closeJob, createFormat, downloadBlock, downloadCopy, formatOf, goOn, greetState, headingOf, hireAgain, isReviewable, LINK_REPLY, carried, carryByRules, markFlyerMade, parkingReply, remindReviewers, removeTranslation, setLinked, sendChat, setChoice, setJobLang, setPart, setSdgs, settleAsk, unparkPart, windowSays, writeNow } from './actions';
import { FlyerPanel } from './Flyer';
import { isPublished, STATE_LABEL, stateActionsOf, type StateAction } from './lifecycle';
import { JobDialog, type Kind } from './Jobs';
import { jobUrl } from './links';
import { SkipDialog } from './Publish';
import { LangsPart, LiveCard, FullPart, MarketPart, PaymentPanel, PlanChoice, PublishCard, ReviewPart, type Opener } from './PublishSteps';
import { ReachEditor } from './Reach';
import { PageDraftCard, PageField, SocialLinks, SuggestionCard } from './ContextCards';
import { Reveal } from './Reveal';
import { conflictQuestion, KEEP_PROFILE_ABOUT, keepProfileAbout, openConflicts, redoQuestion, resolveConflict } from './context';
import { planCount } from './invites';
import { ReviewForm, ReviewPanel } from './Review';
import type { ChatMsg } from './types';
import { aiOn, askAi, carryMessage, GO_ON, probeAi, useAi, whenAnswered, writeVersion } from './ai';
import { amplifying, checkPoints, FIXED_SECTIONS, flyerStale, nextStep, outlineEditOpen, partOfStep, reachOpen, stepKey, walkAutoOpen } from './flow';
import { readJobFile } from './readFile';
import { ABOUT_QUICK, CHOOSE_SDGS, INVITE, OTHER_WORDING, PROJECT_QUICK, SHOW_FLYER, SKIP_APPROVAL, stateOffer } from './walkChat';
import { STATE_DIALOGS, type OpenTarget } from './aiActions';
import { changesSince, changeSummary } from './changes';
import { openPoints } from './Checks';
import Composer, { type ComposerHandle } from './Composer';
import { ApplyFields, AskAnswer, DocumentView, rich, TitleEditor } from './DocPane';
import { arrangementLabel, completeText, headingFor, longDate, PLACES, salaryText } from './engine';
import { FactDialog, typeLabel, type FactKey } from './FactBar';
import { statusLine } from './Home';
import { DeleteDialog } from './JobActions';
import { LangDoc } from './LangDoc';
import MenuButton, { placeFor } from './MenuButton';
import { currentPart, hasFields, lineFit, onLine, partsOf, sectionOf, type Part } from './parts';
import { GooglePreview, JobPageLangs, ShareCards } from './Publish';
import { VersionsDialog } from './Review';
import { inferSdgs, proposedStyle, SDG_NAMES, sdgsOf, toneOf, wordsFor } from './setup';
import { getState, go, goBack, notify, READING_KEY, useDemo } from './store';
import { Commitments } from './Structure';
import { HeadingsPreview, JobOutline, PhoneTemplate, pickGrouping, previewOrder, startPick, TemplatePanel, type Pick } from './TemplatePanel';
import { ALL_LANGS, jobLang, langOf, versionsOf } from './translate';
import type { DemoJob, JobLang, State } from './types';
import { Dialog, radioKeys, scrollInside } from './ui';

/** Requests the window answers itself; everything else goes to the writer. */
const PREVIEW = /^(please\s+)?((show|open|see)( me)?( the)?( job page)? preview|preview( it)?|how (will|does) it look)\b/;
const VERSIONS = /\b(earlier|previous|older) versions?\b|\bversion history\b/;
const DOWNLOAD = /^(please\s+)?(download|export)\b/;
const DELETE = /^(please\s+)?(delete|discard) (this|the) (job|draft|job draft)\b/;
const PUBLISH = /^(please\s+)?(publish|post it|go live|schedule)\b/;
const REVIEW = /^(please\s+)?(send|submit|ask)\b.*\breview/;
const OWN = /\b(own|scratch|myself|build|custom)\b/i;
const OTHERS = /\b(other|others|more|show|options|different|alternatives?|else)\b|\bsee all\b/i;
const LINK = /^\s*(?:https?:\/\/|www\.)\S+\s*$/i;
const EXTRA_TABS: Record<string, string> = { flyer: 'Flyer', reach: 'Reach emails', reviewmail: 'Review email', payment: 'Payment' };
/** Requests about a published job's state (section 17's actions); each opens its dialog or shows its button, never acts on its own. */
const STATE_ASKS: Array<[RegExp, StateAction]> = [
  [/^(?:please\s+)?(?:publish|put) it (?:live )?now\b|^(?:please\s+)?go live now\b/, 'publishNow'],
  [/^(?:please\s+)?(?:change|move) the (?:publishing |go-live )?date\b|^(?:please\s+)?reschedule\b/, 'reschedule'],
  [/^(?:please\s+)?(?:take it |put it |move it )?back to (?:a )?draft\b|^(?:please\s+)?unschedule\b/, 'backToDraft'],
  [/^(?:please\s+)?extend\b/, 'extend'],
  [/^(?:please\s+)?share (?:it|the job|this job|the link)\b/, 'share'],
  [/^(?:please\s+)?amplify(?: it| this job)?[.!]?$/, 'amplify'],
  [/^(?:the )?(?:position|post|role|job) (?:is |was |has been )?filled\b|^(?:please\s+)?mark (?:it|the position) (?:as )?filled\b/, 'filled'],
  [/^(?:please\s+)?close (?:it|the job|this job)(?: now| early)?[.!]?$/, 'close'],
  [/^(?:please\s+)?withdraw\b/, 'withdraw'],
  [/^(?:please\s+)?re-?open\b/, 'reopen'],
  [/^(?:please\s+)?hire (?:for it )?again\b|^(?:please\s+)?repost\b/, 'hire'],
];
const STATE_WORD: Record<string, string> = { draft: 'a draft', review: 'a job in review', approved: 'an approved job', scheduled: 'a scheduled job', live: 'a live job', closed: 'a closed job' };
/** The window's dialogs for section 17's actions. */
const DIALOGS: Partial<Record<StateAction, Kind>> = { publishNow: 'publishNow', reschedule: 'reschedule', backToDraft: 'backToDraft', extend: 'extend', share: 'share', filled: 'filled', withdraw: 'withdraw', reopen: 'reopen' };
const SPLIT_KEY = 'aidjobs.employerDemo.windowSplit';
const BOX_KEY = 'aidjobs.employerDemo.chatBox';

type PreviewView = 'page' | 'google' | 'share';

function readingNow(id?: string): boolean {
  try {
    return Boolean(id) && localStorage.getItem(READING_KEY) === id;
  } catch {
    return false;
  }
}

function readNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, v: number) {
  try {
    localStorage.setItem(key, String(Math.round(v)));
  } catch {
    /* storage unavailable */
  }
}

function scrollToId(id: string) {
  requestAnimationFrame(() => scrollInside(document.getElementById(id)));
}

/** A message as one plain line, for the phone's slim question line. */
function plain(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\s*\n+\s*/g, ' ');
}

function PartButton({ part, current, onGo }: { part: Part; current: boolean; onGo: (k: string) => void }) {
  const state = current ? 'current' : part.done ? 'done' : 'todo';
  return (
    <Tip label={`${part.label} · ${current ? 'in view' : part.done ? 'done' : 'to do'}`} side="bottom">
      <button type="button" className="ej-line-part" data-state={state} aria-current={current ? 'step' : undefined} onClick={() => onGo(part.key)}>
        <span className="ej-pline-dot" aria-hidden />
        <span className="ej-line-label">{part.label}</span>
        <span className="sr-only">{part.done ? ', done' : ', to do'}</span>
      </button>
    </Tip>
  );
}

/**
 * The progress line at the top of the job panel (phase 3): a thin line with a small dot for every part, current, done, or to do.
 * U-1 (20 November 2026): keep it here — flush under the window header rule that runs under Preview / Earlier versions — not in the
 * header row, not over the chat, and not pulled down toward the language / Preview tab row.
 */
function PanelLine({ parts, current, onGo }: { parts: Part[]; current: string; onGo: (k: string) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLOListElement>(null);
  const [fit, setFit] = useState(parts.length);
  const sig = parts.map((p) => p.label).join('|');
  useEffect(() => {
    const el = row.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const count = () => setFit(lineFit(Array.from(measure.current?.children ?? []).map((x) => (x as HTMLElement).offsetWidth + 4), el.clientWidth));
    const watch = new ResizeObserver(count);
    watch.observe(el);
    if (measure.current) watch.observe(measure.current);
    return () => watch.disconnect();
  }, [sig]);
  const { shown, more: hidden } = onLine(parts, fit, current);
  return (
    <nav ref={row} className="ej-line-wrap" aria-label="Parts of this job">
      <ol ref={measure} className="ej-line ej-measure" aria-hidden inert>
        {parts.map((p) => (
          <li key={p.key}>
            <span className="ej-line-part">
              <span className="ej-pline-dot" />
              <span className="ej-line-label">{p.label}</span>
            </span>
          </li>
        ))}
      </ol>
      <ol className="ej-line">
        {shown.map((p) => (
          <li key={p.key}>
            <PartButton part={p} current={p.key === current} onGo={onGo} />
          </li>
        ))}
        {hidden.length > 0 && (
          <li>
            <MenuButton
              label={`${hidden.length} more ${hidden.length === 1 ? 'part' : 'parts'} of this job`}
              className="ej-line-more"
              trigger={<>+{hidden.length}</>}
              actions={hidden.map((p) => ({ label: `${p.label} · ${p.done ? 'done' : 'to do'}`, current: p.key === current, run: () => onGo(p.key) }))}
            />
          </li>
        )}
      </ol>
    </nav>
  );
}

/** On phones the line is a short list, opened from one button, so there is no third sideways strip. */
function PartsList({ parts, current, onGo }: { parts: Part[]; current: string; onGo: (k: string) => void }) {
  return (
    <nav aria-label="Parts of this job">
      <ol className="ej-line-list">
        {parts.map((p) => (
          <li key={p.key} className={p.section ? 'ej-line-sub' : undefined}>
            <PartButton part={p} current={p.key === current} onGo={onGo} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

type TabDef = { key: string; label: string; lang?: JobLang; linked?: boolean; removable?: boolean };

/**
 * 🔗 Link languages (section 19, phase 6, E): one icon at the end of the panel's tabs, only when the job has versions, with a tick box
 * for each language, the job's own included. Linked, a change in one follows into the others.
 */
function LinkLangs({ job, disabled }: { job: DemoJob; disabled: boolean }) {
  const [open, setOpen] = useState<CSSProperties | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const langs = [jobLang(job), ...versionsOf(job)];
  const linked = job.linked ?? [];
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [open]);
  return (
    <>
      <Tip label={linked.length ? `Linked: ${linked.map((l) => langOf(l).label).join(', ')}. A change in one follows into the others` : 'Link languages, so a change in one follows into the others'} side="bottom">
        <button ref={btn} type="button" className="ej-w-tab ej-link-btn" aria-label="Link languages" aria-haspopup="dialog" aria-expanded={Boolean(open)} data-on={linked.length > 1 || undefined} disabled={disabled} onClick={(e) => setOpen(open ? null : placeFor(e.currentTarget, 'right', false))}>
          <Link2 size={14} strokeWidth={1.9} aria-hidden />
        </button>
      </Tip>
      {open && (
        <div
          ref={box}
          className="ej-menu"
          data-fixed
          style={open}
          role="dialog"
          aria-label="Link languages"
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            setOpen(null);
            btn.current?.focus();
          }}
        >
          <span className="ej-menu-label">Linked languages</span>
          {langs.map((l, i) => (
            <label key={l} className="ej-menu-item">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={linked.includes(l)} autoFocus={i === 0} onChange={() => setLinked(job.id, linked.includes(l) ? linked.filter((x) => x !== l) : [...linked, l])} />
                <span lang={l}>{langOf(l).native}</span>
                {l === jobLang(job) && <span className="aj-faint">the job&apos;s own</span>}
              </span>
            </label>
          ))}
          <span className="aj-faint block px-2.5 pb-1" style={{ fontSize: 11.5 }}>
            A change in one then follows into the others: structure, fixed texts, and text. Linking changes nothing already different.
          </span>
        </div>
      )}
    </>
  );
}

/** The output panel's tabs, shown only when there is a second view: a language version, or the preview. */
function PanelTabs({ tabs, active, onPick, onRemove, end }: { tabs: TabDef[]; active: string; onPick: (k: string) => void; onRemove?: (t: TabDef) => void; end?: ReactNode }) {
  const keys = (e: ReactKeyboardEvent<HTMLElement>) => {
    const at = tabs.findIndex((t) => t.key === active);
    const to = e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowLeft' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length];
    onPick(next.key);
    document.getElementById(`ej-wtab-${next.key}`)?.focus();
  };
  return (
    <div className="flex items-center">
      <div className="ej-w-tabs min-w-0 flex-1" role="tablist" aria-label="What the panel shows" onKeyDown={keys}>
        {tabs.map((t) => (
          <span key={t.key} className="ej-w-tab-wrap">
            <button type="button" role="tab" id={`ej-wtab-${t.key}`} aria-selected={t.key === active} aria-controls="ej-w-panel" tabIndex={t.key === active ? 0 : -1} className="ej-w-tab" lang={t.lang} onClick={() => onPick(t.key)}>
              {t.label}
              {t.linked && (
                <>
                  <Link2 size={11} strokeWidth={2} className="ej-tab-link" aria-hidden />
                  <span className="sr-only" lang="en">
                    , linked
                  </span>
                </>
              )}
            </button>
            {t.removable && onRemove && (
              <Tip label={`Remove the ${t.label} version`}>
                <button
                  type="button"
                  className="ej-w-tab-x"
                  aria-label={`Remove the ${t.label} version`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(t);
                  }}
                >
                  <X size={12} strokeWidth={2.2} />
                </button>
              </Tip>
            )}
          </span>
        ))}
      </div>
      {end}
    </div>
  );
}

type RowKey = FactKey | 'title' | 'sdgs' | 'lang';

function FactRows({ job, s, onFact }: { job: DemoJob; s: State; onFact: (k: RowKey) => void }) {
  const f = job.facts;
  const ro = Boolean(s.reviewerAs);
  const more = [f.eligibility !== 'anyone' ? { nationals: 'Nationals only', internal: 'Internal candidates only', righttowork: 'Right to work needed' }[f.eligibility] : '', f.languages.join(', '), Number(f.positions) > 1 ? `${f.positions} positions` : '', f.donor].filter(Boolean).join(' · ');
  const goals = sdgsOf(job);
  const rows: Array<{ key: RowKey; label: string; value: string; missing?: boolean; hint?: string }> = [
    { key: 'title', label: 'Job title', value: f.title, missing: !f.title },
    { key: 'place', label: 'Duty station', value: f.location ? `${f.location} · ${arrangementLabel(f.arrangement)}` : f.arrangement === 'remote' ? 'Remote' : '', missing: !f.location && f.arrangement !== 'remote' },
    { key: 'type', label: 'Job type', value: typeLabel(f), missing: !f.contract && f.engagement === 'job' },
    { key: 'grade', label: 'Grade or band', value: f.grade },
    { key: 'closes', label: 'Closing date', value: f.deadline ? `${longDate(f.deadline)}${f.closingTime ? `, ${f.closingTime}` : ''}` : '', missing: !f.deadline },
    { key: 'salary', label: 'Salary', value: salaryText(f) || 'Not shown' },
    { key: 'sdgs', label: 'SDGs', value: `${goals.map((g) => `SDG ${g} ${SDG_NAMES[g]}`).join(' · ')}${goals.length && job.sdgsFrom === 'org' ? " (your organisation's goals)" : ''}`, hint: 'No SDG is clear from this role' },
    { key: 'lang', label: 'Written in', value: langOf(jobLang(job)).label },
    { key: 'more', label: 'More details', value: more, hint: 'Who can apply, languages, positions, donor' },
  ];
  return (
    <ul className="ej-fact-rows">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="aj-muted">{r.label}</span>
          <span className={r.value || r.missing ? 'min-w-0' : 'aj-faint min-w-0'} data-missing={r.missing || undefined}>
            {r.value || (r.missing ? 'To add' : (r.hint ?? 'None'))}
            {r.key === 'sdgs' && !goals.length && s.org.sdgs.length > 0 && !ro && (
              <button type="button" className="aj-text-btn block" style={{ height: 26, paddingInline: 0 }} onClick={() => applyOrgSdgs(job.id)}>
                {`Use your organisation's goals (SDG ${s.org.sdgs.slice(0, 3).join(', ')})`}
              </button>
            )}
          </span>
          <button
            type="button"
            className="aj-pill"
            style={{ height: 30 }}
            disabled={ro}
            aria-label={`${r.value ? 'Change' : 'Add'} ${r.label === 'SDGs' ? 'the SDGs' : r.key === 'lang' ? "the job's language" : r.label.toLowerCase()}`}
            onClick={() => {
              if (r.key !== 'title') return onFact(r.key);
              const el = document.getElementById('ej-title-edit');
              scrollInside(el, 'center');
              el?.focus();
            }}
          >
            {r.value ? 'Change' : 'Add'}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The language the job is written in: read from the role as typed, changed here or by asking in the chat. */
function LangDialog({ job, onClose }: { job: DemoJob; onClose: () => void }) {
  const now = jobLang(job);
  return (
    <Dialog title="Written in" subtitle="The job's own language; versions in other languages come with Amplify" onClose={onClose} half>
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="The job's language" onKeyDown={radioKeys}>
        {ALL_LANGS.map((l) => (
          <button
            key={l.key}
            type="button"
            role="radio"
            aria-checked={now === l.key}
            className="aj-option"
            data-active={now === l.key}
            onClick={() => {
              setJobLang(job.id, l.key);
              onClose();
            }}
          >
            <span lang={l.key}>{l.native}</span>
            {l.native !== l.label && <span className="aj-faint">{l.label}</span>}
          </button>
        ))}
        <span className="aj-faint">Text AidJobs wrote is written again in the new language; text you or the AI wrote stays as it is until you ask for it to be rewritten.</span>
      </div>
    </Dialog>
  );
}

/** The goals the job serves: read from the role by rules, corrected here; at most three. */
function SdgDialog({ job, onClose }: { job: DemoJob; onClose: () => void }) {
  const goals = sdgsOf(job);
  const toggle = (g: number) => setSdgs(job.id, goals.includes(g) ? goals.filter((x) => x !== g) : goals.length >= 3 ? goals : [...goals, g].sort((a, b) => a - b));
  const read = inferSdgs(job);
  return (
    <Dialog
      title="SDGs this job serves"
      subtitle="Up to three"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="aj-text-btn" onClick={() => setSdgs(job.id, null)}>
            Read them from the role{read.length ? ` (SDG ${read.join(', ')})` : ''}
          </button>
          <button type="button" className="aj-ink-btn" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(SDG_NAMES).map(([k, name]) => {
          const g = Number(k);
          const on = goals.includes(g);
          return (
            <button key={g} type="button" className="ej-tag" data-on={on} aria-pressed={on} disabled={!on && goals.length >= 3} onClick={() => toggle(g)}>
              SDG {g} · {name}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}

/** A part's own fields, in the panel above the job description, so it can be set without the chat. */
function PartFields({ part, job, s, onClose, onFact, open, act }: { part: string; job: DemoJob; s: State; onClose: () => void; onFact: (k: RowKey) => void; open: Opener; act: (a: StateAction) => void }) {
  // Walk jobs: same list as the progress Check dot (R2-P1-8). Non-walk: Publish-style openPoints.
  const points = job.walk ? checkPoints(job, s).map((p) => p.title) : job.sections.length ? openPoints(job, s, false) : [];
  const head: Record<string, [string, string]> = {
    details: ['Details', 'The facts the job description and Google use'],
    fixed: ['Fixed text', "Your organisation's commitments, word for word"],
    check: ['Check', 'Clarity, inclusive language, placeholders, dates, and unfinished sections'],
    plan: ['Free or Amplify', 'How it goes out; the free terms and the packages'],
    market: ['Market check', 'How your job compares with similar open jobs'],
    full: ['Full check', 'Requirements and pay, compared with similar jobs'],
    langs: ['Languages', 'Versions of the job page in other languages'],
    flyer: ['Flyer', 'A one-page notice with a QR code'],
    reach: ['Reach', 'Invite people by email when it goes live'],
    review: ['Review', 'Comments, suggestions, and approval'],
    publish: ['Publish', statusLine(s, job)],
    's:apply': ['How to apply', 'The section below is written from these'],
  };
  const [title, hint] = head[part] ?? ['', ''];
  let body: ReactNode = null;
  if (part === 'details') body = <FactRows job={job} s={s} onFact={onFact} />;
  else if (part === 'fixed')
    body = (
      <div className="flex flex-col gap-3">
        <Commitments job={job} s={s} />
        <div className="flex flex-col gap-1.5 border-t pt-3 aj-hair">
          <span className="ej-panel-label">Social links</span>
          <SocialLinks s={s} job={job} />
        </div>
      </div>
    );
  else if (part === 's:apply') body = <ApplyFields job={job} />;
  else if (part === 'check')
    body = (
      <div className="flex flex-col gap-2">
        {points.length ? (
          <ul className="m-0 flex flex-col gap-1 ps-5">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p className="m-0">Nothing to look at in the basic check.</p>
        )}
        <p className="aj-muted m-0">With Amplify, the market check and the full advert check follow as parts of their own.</p>
      </div>
    );
  else if (part === 'plan') body = isPublished(job) ? <LiveCard job={job} s={s} open={open} /> : <PlanChoice job={job} s={s} />;
  else if (part === 'market') body = <MarketPart job={job} s={s} />;
  else if (part === 'full') body = <FullPart job={job} s={s} />;
  else if (part === 'langs') body = <LangsPart job={job} s={s} open={open} />;
  else if ((part === 'flyer' || part === 'reach') && !reachOpen(job, s))
    body = (
      <p className="aj-muted m-0">
        {flyerStale(job, s) && part === 'flyer'
          ? 'Out of date: the job changed, or changes were asked for, since the flyer was made. It opens again once review is done.'
          : `${part === 'reach' ? 'Reach' : 'The flyer'} opens once review is done: approved, or no review where your organisation does not ask for one.`}
      </p>
    );
  else if ((part === 'flyer' || part === 'reach') && !reachOpen(job, s))
    body = (
      <p className="aj-muted m-0">
        {flyerStale(job, s) && part === 'flyer'
          ? 'Out of date: the job changed, or changes were asked for, since the flyer was made. It opens again once review is done.'
          : `${part === 'reach' ? 'Reach' : 'The flyer'} opens once review is done: approved, or no review where your organisation does not ask for one.`}
      </p>
    );
  else if (part === 'flyer')
    body = (
      <button type="button" className="aj-pill self-start" onClick={() => open.tab('flyer')}>
        Show the flyer
      </button>
    );
  else if (part === 'reach')
    body = (
      <div className="flex flex-col items-start gap-1.5">
        <span className="aj-muted">{job.reachPlan ? `${planCount(job, job.reachPlan)} people, with the emails you checked. They go when the job goes live.` : 'Optional: candidates you know, and your team to pass it on, by email when it goes live.'}</span>
        <button type="button" className="aj-pill" onClick={() => open.tab('reach')}>
          {job.reachPlan ? 'Open the invitations' : 'Prepare the invitations'}
        </button>
      </div>
    );
  else if (part === 'review') body = <ReviewPart job={job} s={s} open={open} />;
  else if (part === 'publish')
    body = (
      <div className="flex flex-col gap-3">
        <PublishCard job={job} s={s} open={open} />
        {/* A published job's actions stay here too, not only on the chat's card (section 19: nothing depends on the chat alone). */}
        {isPublished(job) && stateActionsOf(s, job).length > 0 && (
          <div className="flex flex-col gap-1.5 border-t pt-3 aj-hair" role="group" aria-label="What you can do">
            <span className="aj-muted">{stateOffer(s, job)}</span>
            <StateCard job={job} s={s} act={act} />
          </div>
        )}
      </div>
    );
  return (
    <section id="ej-part-card" className="aj-card ej-part-card flex flex-col gap-3 p-4" aria-label={title} style={{ scrollMarginTop: 12 }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="ej-panel-label">{title}</span>
        <span className="aj-faint min-w-0 flex-1" style={{ fontSize: 11.5 }}>
          {hint}
        </span>
        <button type="button" className="aj-text-btn" style={{ height: 26 }} onClick={onClose}>
          Hide
        </button>
      </div>
      {body}
    </section>
  );
}

function PreviewPanel({ job, s, onClose }: { job: DemoJob; s: State; onClose: () => void }) {
  const [view, setView] = useState<PreviewView>('page');
  const views: Array<[PreviewView, string]> = [
    ['page', 'Job page'],
    ['google', 'In Google'],
    ['share', 'When shared'],
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Preview of" onKeyDown={radioKeys}>
          {views.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={view === k} className="aj-pill" data-active={view === k} style={{ height: 30 }} onClick={() => setView(k)}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="aj-text-btn ml-auto inline-flex items-center gap-1 whitespace-nowrap" style={{ height: 28 }} onClick={onClose}>
          <X size={13} strokeWidth={2} aria-hidden /> Close the preview
        </button>
      </div>
      {view === 'page' && <JobPageLangs job={job} s={s} drafts />}
      {view === 'google' && <GooglePreview job={job} s={s} />}
      {view === 'share' && <ShareCards job={job} s={s} />}
    </div>
  );
}

/** The grip above the message box: dragged up or down (or the arrow keys) to make the box taller or shorter; a double-click resets it. */
function BoxGrip({ height, onChange }: { height: number; onChange: (h: number) => void }) {
  const drag = useRef<{ y: number; h: number } | null>(null);
  const max = () => Math.round((typeof window === 'undefined' ? 800 : window.innerHeight) * 0.6);
  const set = (h: number) => onChange(h <= 40 ? 0 : Math.min(max(), Math.round(h)));
  return (
    <div
      className="ej-box-grip"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the message box"
      aria-valuenow={height}
      aria-valuemin={0}
      aria-valuemax={max()}
      tabIndex={0}
      onPointerDown={(e) => {
        const box = e.currentTarget.parentElement?.querySelector('textarea');
        drag.current = { y: e.clientY, h: height || box?.offsetHeight || 44 };
        e.currentTarget.setPointerCapture?.(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => drag.current && set(drag.current.h + (drag.current.y - e.clientY))}
      onPointerUp={() => {
        drag.current = null;
      }}
      onDoubleClick={() => onChange(0)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        set((height || 44) + (e.key === 'ArrowUp' ? 24 : -24));
      }}
    >
      <span aria-hidden />
    </div>
  );
}

/**
 * The guide: the whole conversation, answers inside the questions, and the box, with the part in view as its subject. With the AI on,
 * a message waits in the conversation while the AI thinks, and a note says where messages go.
 */
/**
 * Section 17's actions for the job's state (section 19, phase 4), on the card under the chat's message: the next step first, and each
 * button opens its own dialog, or is the action itself where section 17 has no dialog (Close now, with Undo).
 */
function StateCard({ job, s, act }: { job: DemoJob; s: State; act: (a: StateAction) => void }) {
  const actions = stateActionsOf(s, job);
  const left = job.facts.deadline ? Math.round((new Date(`${job.facts.deadline}T12:00:00`).getTime() - s.today) / 86_400_000) : null;
  const main: StateAction | undefined = job.status === 'live' ? (left !== null && left <= 7 ? 'extend' : 'share') : actions[0];
  const order = main ? [main, ...actions.filter((a) => a !== main)] : actions;
  if (!order.length) return <span className="aj-muted">Nothing to do from here for now.</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {order.map((a) => (
        <button key={a} type="button" className={a === main ? 'aj-ink-btn' : 'aj-pill'} style={a === 'delete' ? { color: 'var(--red)' } : undefined} onClick={() => act(a)}>
          {STATE_LABEL[a]}
        </button>
      ))}
    </div>
  );
}

/** A card under the chat's message (section 19, steps 8 and 9): the one place, with the part on the line, where it is published, paid, or sent. */
function ChatCardView({ kind, job, s, open, act }: { kind: NonNullable<ChatMsg['card']>; job: DemoJob; s: State; open: Opener; act: (a: StateAction) => void }) {
  const label = { plan: 'Free or Amplify', review: 'Send for review', publish: 'Publish', live: 'Published', state: 'What you can do', website: 'Your organisation’s page', project: 'The project', page: 'Draft', suggest: 'Suggestion', social: 'Social links' }[kind];
  const aiOpen = (t: OpenTarget) => open.part(t.startsWith('section:') ? `s:${t.slice(8)}` : t);
  return (
    <section className="aj-card ej-chat-card mt-2 flex flex-col gap-2 p-3" aria-label={label}>
      {kind === 'state' && <StateCard job={job} s={s} act={act} />}
      {kind === 'website' && <PageField job={job} s={s} kind="about" open={aiOpen} />}
      {kind === 'project' && <PageField job={job} s={s} kind="project" open={aiOpen} />}
      {kind === 'page' && <PageDraftCard job={job} s={s} />}
      {kind === 'suggest' && <SuggestionCard job={job} s={s} />}
      {kind === 'social' && <SocialLinks s={s} job={job} />}
      {kind === 'plan' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="aj-pill" onClick={() => open.part('plan')}>
            Compare Free and Amplify
          </button>
        </div>
      )}
      {kind === 'review' && job.review.state === 'open' && (
        <div className="flex flex-col items-start gap-1.5">
          <span className="aj-muted">
            Waiting for {job.review.reviewers.filter((r) => !r.decision).map((r) => r.name.split(' ')[0]).join(' and ') || 'your reviewers'}. Remind emails them again (simulated).
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {job.review.reviewers.some((r) => !r.decision) && (
              <button type="button" className="aj-ink-btn" onClick={() => remindReviewers(job.id)}>
                Remind
              </button>
            )}
            <button type="button" className="aj-pill" onClick={() => open.part('review')}>
              Open Review
            </button>
          </div>
        </div>
      )}
      {kind === 'review' && job.review.state !== 'open' && (
        <div className="flex flex-col items-start gap-1.5">
          <span className="aj-muted">Who reviews it, by when, under which rule, and the email they get.</span>
          <button type="button" className="aj-ink-btn" onClick={() => open.tab('reviewmail')}>
            Choose the reviewers
          </button>
        </div>
      )}
      {kind === 'publish' && <PublishCard job={job} s={s} open={open} compact />}
      {kind === 'live' && <LiveCard job={job} s={s} open={open} compact />}
    </section>
  );
}

/**
 * Reviewers in the window (section 19, phase 4): the chat column becomes the Review panel, with the status, the round, the rule, the due
 * date, each reviewer's decision, what changed since the last round, every comment, a comment or suggestion tied to the part open on the
 * line, and Approve or Request changes with a note. The author's chat is not shown, and nothing can be edited from here.
 */
function ReviewColumn({ job, s, on, onSection }: { job: DemoJob; s: State; on?: string; onSection: (key: string) => void }) {
  return (
    <div className="aj-scroll flex h-full min-h-0 flex-col" role="region" aria-label="Review">
      <ReviewPanel job={job} s={s} onSend={() => {}} on={on} onSection={onSection} />
      <p className="aj-faint m-0 px-3 pb-3" style={{ fontSize: 11.5 }}>
        Reviewers comment, suggest, and decide; only the author changes the job.
      </p>
    </div>
  );
}

function WindowChat({ job, s, reading, subject, onSend, onSkip, autoFocus, open, act }: { job: DemoJob; s: State; reading: boolean; subject: string; onSend: (text: string) => void; onSkip: () => void; autoFocus: boolean; open: Opener; act: (a: StateAction) => void }) {
  const [text, setText] = useState('');
  const [tapped, setTapped] = useState<{ id: string; q: string } | null>(null);
  const [box, setBox] = useState(() => readNumber(BOX_KEY, 0));
  // Messages already there when the window opened show at once; those that arrive while it is open are revealed as they are written.
  const [born] = useState(() => new Set(job.chat.map((m) => m.id)));
  const input = useRef<ComposerHandle>(null);
  const end = useRef<HTMLDivElement>(null);
  const ai = useAi();
  const waiting = ai.pending[job.id];
  // The first reply is "Reading your role…" while that shows, and "Thinking…" after, so the window never waits without saying so.
  const thinking = Boolean(waiting) && !waiting?.silent && !(waiting?.first && reading);
  const busy = Boolean(waiting) || reading;
  // Enter while busy says why nothing was sent, for that answer only: the note goes when the answer it waited for has come.
  const busyWith: unknown = waiting ?? (reading ? 'reading' : null);
  const [heldFor, setHeldFor] = useState<unknown>(null);
  const held = busyWith !== null && heldFor === busyWith;
  const firstUser = job.chat.findIndex((m) => m.from === 'user');
  const shown = reading ? job.chat.slice(0, firstUser + 1) : job.chat;
  useEffect(() => {
    scrollInside(end.current, 'end', false);
  }, [shown.length, thinking, waiting?.silent]);
  const reviewing = Boolean(s.reviewerAs);
  const lastUser = shown.map((m) => m.from).lastIndexOf('user');
  // Only the latest card is live: an older one would show the job as it is now under words written for an earlier moment.
  const lastCard = shown.map((m) => Boolean(m.card)).lastIndexOf(true);
  const last = shown[shown.length - 1];
  const own = [...s.jobs.map((j) => j.facts.title).filter(Boolean), ...s.org.countries.flatMap((c) => PLACES.filter((p) => p.country === c).map((p) => `${p.city}, ${p.country}`))];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <button type="button" className="aj-pill sr-only focus:not-sr-only focus:m-2" onClick={onSkip}>
        Skip to the job description
      </button>
      <div className="ej-wchat aj-scroll flex min-h-0 flex-1 flex-col gap-2 px-4 py-3" role="log" aria-label="Conversation with AidJobs" aria-live="polite">
        {shown.length === 0 && !reviewing && <p className="aj-faint m-0">Ask AidJobs for any change to the job description, or open a part of it.</p>}
        {shown.map((m, i) => (
          <div key={m.id} className="ej-bubble" data-from={m.from}>
            {m.from === 'user' && <span className="sr-only">You said: </span>}
            <Reveal id={m.id} text={m.text} active={m.from === 'ai' && m === last && !born.has(m.id)} render={rich} />
            {m.ai && m.by && (
              <span className="ej-ai-by">
                <span className="sr-only">Written by </span>
                {m.by}
              </span>
            )}
            {m.from === 'ai' && m.quick && m.quick.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.quick.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="aj-pill ej-answer"
                    style={{ height: 30 }}
                    aria-pressed={(shown[i + 1]?.from === 'user' ? shown[i + 1].text : tapped?.id === m.id ? tapped.q : null) === q}
                    disabled={i < lastUser || reviewing || busy || tapped?.id === m.id}
                    onClick={() => {
                      setTapped({ id: m.id, q });
                      onSend(q);
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {m.from === 'ai' && m === last && m.ask && !reviewing && !busy && <AskAnswer job={job} s={s} kind={m.ask} onAnswered={() => setTimeout(() => input.current?.focus(), 0)} />}
            {m.from === 'ai' &&
              m.card &&
              !reviewing &&
              (m.card !== 'state' || !m.state || m.state === job.status) &&
              (() => {
                // R2-P0-3: while setup is still about/project, keep the matching card live even after an intervening AI bubble hid lastCard.
                const setupLive =
                  (m.card === 'website' && job.setup === 'about') || (m.card === 'project' && job.setup === 'project');
                if (setupLive) {
                  const lastMatch = shown.reduce((acc, x, idx) => (x.card === m.card ? idx : acc), -1);
                  return i === lastMatch;
                }
                return i === lastCard && i > lastUser;
              })() && <ChatCardView kind={m.card} job={job} s={s} open={open} act={act} />}
          </div>
        ))}
        {reading && (
          <div className="ej-bubble ej-reading" data-from="ai" role="status">
            Reading your role…
          </div>
        )}
        {thinking && (
          <>
            {!waiting?.first && (
              <div className="ej-bubble" data-from="user">
                <span className="sr-only">You said: </span>
                {waiting?.text}
              </div>
            )}
            <div className="ej-bubble ej-reading" data-from="ai" role="status">
              Thinking…
            </div>
          </>
        )}
        {waiting?.silent && (
          <div className="ej-bubble ej-reading" data-from="ai" role="status">
            Writing {waiting.silent}…
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="shrink-0 border-t px-3 pb-2.5 aj-hair">
        {!reviewing && (
          <>
            <BoxGrip
              height={box}
              onChange={(h) => {
                setBox(h);
                save(BOX_KEY, h);
              }}
            />
            <div className="ej-subject" aria-live="polite">
              About: <strong>{subject}</strong>
            </div>
            {ai.fallback[job.id] && (
              <p className="ej-ai-note m-0" role="status">
                {ai.fallback[job.id]}
              </p>
            )}
            {held && (
              <p className="ej-ai-note m-0" role="status">
                One moment: I am still answering. Your message stays in the box; send it when I am done.
              </p>
            )}
            <Composer
              ref={input}
              value={text}
              onChange={setText}
              onSend={(v) => {
                if (busy) {
                  setHeldFor(busyWith);
                  return;
                }
                onSend(v);
                setText('');
              }}
              suggestion={completeText(text, own)}
              placeholder={job.setup === 'template' ? 'Answer here, choose a template, or drop your own job description' : last?.ask ? 'Answer here, or pick above' : `Ask about ${subject}, or anything else`}
              label="Message AidJobs about this job"
              compact
              autoFocus={autoFocus}
              minHeight={box}
              onFile={
                job.setup === 'template' && !busy
                  ? (file) =>
                      void readJobFile(file).then((r) => {
                        if (r.error) return chatNote(job.id, file.name, r.error);
                        chatNote(job.id, file.name, 'Reading it…');
                        bringDocument(job.id, r.text ?? '');
                      })
                  : undefined
              }
            />
            {ai.status === 'on' && <p className="ej-ai-note m-0">Messages go to an AI model through {ai.provider || 'an AI provider'}. Use sample details only.</p>}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Creating a job in one window (employer-side plan, section 19): the chat guides and does the work; the output panel shows the result,
 * with the progress line in the header row as the way around. A new job waits for its template (chosen in the chat, in the template
 * panel, or on a phone in the job description itself) and its style before anything is written.
 */
export default function Window({ id }: { id?: string }) {
  const s = useDemo();
  if (!id || !s.jobs.some((j) => j.id === id)) {
    return (
      <div className="mx-auto max-w-[560px] p-6">
        <p className="aj-muted">This job is not in the demo any more.</p>
        <button type="button" className="aj-ink-btn" onClick={() => go('create')}>
          Create a job
        </button>
      </div>
    );
  }
  return <JobWindow id={id} />;
}

function JobWindow({ id }: { id: string }) {
  const s = useDemo();
  const phone = useIsPhone();
  const job = s.jobs.find((j) => j.id === id) as DemoJob;
  const [reading, setReading] = useState(() => readingNow(id));
  const [view, setView] = useState<'chat' | 'job'>('chat');
  const [tab, setTab] = useState('doc');
  const [preview, setPreview] = useState(false);
  const [extra, setExtra] = useState<string[]>([]);
  const [skipOpen, setSkipOpen] = useState(false);
  const [hidden, setHidden] = useState<string | null>(null);
  const [fact, setFact] = useState<RowKey | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [jobDialog, setJobDialog] = useState<Kind | null>(null);
  const [partsOpen, setPartsOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const [said, setSaid] = useState('');
  const [pick, setPick] = useState<Pick | null>(null);
  const [chatW, setChatW] = useState(() => readNumber(SPLIT_KEY, 400));
  const [dragging, setDragging] = useState(false);
  const [body, setBody] = useState({ w: 0, h: 0, left: 220, top: 120 });
  const bodyRef = useRef<HTMLDivElement>(null);
  const changeKey = job?.lastChange?.keys.length ? `${job.versions.length}:${job.lastChange.keys.join()}` : '';
  const lastMsg = job?.chat[job.chat.length - 1];
  const askId = lastMsg?.from === 'ai' && lastMsg.ask ? lastMsg.id : '';
  const seenChange = useRef(changeKey);
  const seenAsk = useRef(askId);
  const [changeShown, setChangeShown] = useState(changeKey);
  if (changeShown !== changeKey) {
    setChangeShown(changeKey);
    if (changeKey && job?.lastChange) {
      setPreview(false);
      setTab('doc');
      setSaid(`Updated in the job description: ${job.lastChange.keys.map((k) => job.sections.find((x) => x.key === k)?.title ?? k).join(', ')}.`);
      if (phone) setUnseen(true);
    }
  }

  const openRef = useRef<(t: OpenTarget) => void>(() => {});

  // A published job whose state changes here (published now, closed, reopened, back to a draft) says so the same way.
  const status = job?.status;
  const seenStatus = useRef(status);
  useEffect(() => {
    const was = seenStatus.current;
    seenStatus.current = status;
    if (was && was !== status && ['scheduled', 'live', 'closed'].includes(was)) greetState(id);
  }, [status, id]);

  // "Reading your role…" shows for at least a moment; with the AI on, until the AI has written the first reply in place of the rules'.
  useEffect(() => {
    if (!reading || !id) return;
    try {
      localStorage.removeItem(READING_KEY);
    } catch {
      /* storage unavailable */
    }
    let timeUp = false;
    let answered = false;
    let over = false;
    const end = () => {
      if (over || !timeUp || !answered) return;
      over = true;
      setReading(false);
    };
    const t = setTimeout(() => {
      timeUp = true;
      if (!aiOn()) answered = true;
      end();
    }, 900);
    void probeAi().then(async (on) => {
      const said = getState().jobs.find((x) => x.id === id)?.chat.find((m) => m.from === 'user')?.text;
      // Run twice (React's development check), the second run waits for the first's answer rather than ending "Reading" early.
      if (on && said && !answered && !(await askAi(id, said, { first: true, open: (x) => openRef.current(x) }))) await whenAnswered(id);
      answered = true;
      end();
    });
    return () => clearTimeout(t);
  }, [reading, id]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBody({ w: el.clientWidth, h: el.clientHeight, left: r.left, top: r.top });
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, [phone]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const b = bodyRef.current?.getBoundingClientRect();
      if (!b) return;
      const w = Math.min(Math.max(300, e.clientX - b.left), Math.max(300, b.width - 420));
      setChatW(w);
      save(SPLIT_KEY, w);
    };
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging]);

  // A placeholder in the text ("[Closing date]") opens that fact's picker.
  useEffect(() => {
    const open = (e: Event) => {
      if (!job || s.reviewerAs) return;
      setFact((e as CustomEvent<FactKey>).detail);
      setPart(job.id, 'details');
    };
    window.addEventListener('ej-open-fact', open);
    return () => window.removeEventListener('ej-open-fact', open);
  }, [job, s.reviewerAs]);

  // The line follows the chat: a section the chat has just changed comes into view, and a fact asked for makes Details current.
  useEffect(() => {
    if (!job || changeKey === seenChange.current) return;
    seenChange.current = changeKey;
    if (!changeKey || !job.lastChange) return;
    setPart(job.id, `s:${job.lastChange.keys[0]}`);
    scrollToId(`ej-sec-${job.lastChange.keys[0]}`);
  }, [changeKey, job]);
  useEffect(() => {
    if (!job || askId === seenAsk.current) return;
    seenAsk.current = askId;
    if (askId) setPart(job.id, 'details');
  }, [askId, job]);

  // A job opened in its state says where it stands and what fits (section 19, phase 4); a draft picks up where it left off.
  useEffect(() => {
    if (reading) return;
    greetState(id);
    // Opened at a part (Check, Review, a section), the job stays there even when the chat's next question is a fact.
    const j = getState().jobs.find((x) => x.id === id);
    const l = j?.chat[j.chat.length - 1];
    if (j?.part && l?.from === 'ai' && l.ask) seenAsk.current = l.id;
  }, [id, reading]);

  // The line follows a new employer's writing: each step brings its part into view; a language version to review opens its tab.
  const step = nextStep(job, s);
  const stepNow = stepKey(step);
  const seenStep = useRef(stepNow);
  // Step key held back while an outline edit/Undo was open; that same key is not auto-opened when the guard clears (U-2).
  const suppressedStep = useRef<string | null>(null);
  const [versionShown, setVersionShown] = useState('');
  if (step?.kind === 'version' && versionShown !== stepNow && !reading) {
    setVersionShown(stepNow);
    setPreview(false);
    setTab(`lang:${step.lang}`);
  }
  useEffect(() => {
    if (stepNow === seenStep.current || reading) return;
    const decision = walkAutoOpen(job, step, stepNow, suppressedStep.current);
    if (decision === 'hold') {
      // Remember the blocked step; do not mark it seen, so a later different step can still follow.
      if (stepNow && (outlineEditOpen(job) || job.part?.startsWith('s:'))) suppressedStep.current = stepNow;
      return;
    }
    if (decision === 'skip-suppressed') {
      suppressedStep.current = null;
      seenStep.current = stepNow;
      return;
    }
    suppressedStep.current = null;
    const p = partOfStep(step, job);
    if (!p || s.reviewerAs) {
      seenStep.current = stepNow;
      return;
    }
    seenStep.current = stepNow;
    // R2-P1-9: walk focus leaves the preview panel — clear the preview flag so Eye returns.
    setPreview(false);
    setPart(job.id, p);
    const sec = sectionOf(p);
    scrollToId(sec && p !== 's:apply' ? `ej-sec-${sec}` : 'ej-part-card');
  }, [stepNow, step, job, reading, s.reviewerAs]);

  // A section reached in the writing is written by the AI when it is on; if it cannot, the rules write it.
  const ai = useAi();
  const writeKey = step?.kind === 'write' ? step.sections.filter((k) => !FIXED_SECTIONS.includes(k)).join(',') : '';
  const busyAi = Boolean(ai.pending[job.id]);
  const askedToWrite = useRef('');
  useEffect(() => {
    if (!writeKey || reading || s.reviewerAs || busyAi || askedToWrite.current === `${job.id}:${writeKey}`) return;
    if (ai.status === 'off') {
      writeNow(job.id);
      return;
    }
    if (ai.status !== 'on') return;
    askedToWrite.current = `${job.id}:${writeKey}`;
    const keys = writeKey.split(',');
    const j0 = getState().jobs.find((x) => x.id === job.id);
    const label = keys.length > 1 ? 'the whole draft' : (j0?.renamed?.[keys[0]] ?? headingFor(keys[0], formatOf(getState(), j0?.format ?? '')));
    void askAi(job.id, GO_ON, { silent: label, focus: keys[0], open: (x) => openRef.current(x) }).then(() => {
      const j = getState().jobs.find((x) => x.id === job.id);
      const now = j ? nextStep(j, getState()) : null;
      if (now?.kind === 'write' && now.sections.filter((k) => !FIXED_SECTIONS.includes(k)).join(',') === writeKey) writeNow(job.id);
    });
  }, [writeKey, reading, s.reviewerAs, busyAi, ai.status, job.id]);

  // A language version added with the AI on is written by the AI (the user's decision, 12 November 2026); if it cannot, the table's draft stays.
  const toWrite = ai.status === 'on' ? versionsOf(job).find((k) => { const t = job.translations?.[k]; return t && !t.reviewed && !t.sections.some((x) => x.ai); }) : undefined;
  const askedVersion = useRef<string[]>([]);
  useEffect(() => {
    if (!toWrite || reading || s.reviewerAs || busyAi || askedVersion.current.includes(`${job.id}:${toWrite}`)) return;
    askedVersion.current.push(`${job.id}:${toWrite}`);
    const label = langOf(toWrite).label;
    void askAi(job.id, writeVersion(label), { silent: `the ${label} version`, version: toWrite, open: (x) => openRef.current(x) });
  }, [toWrite, reading, s.reviewerAs, busyAi, job.id]);

  // A linked change's text (section 19, phase 6, E): written by the AI when it is on; when it is off or cannot answer, by the rules.
  const carryKey = job.carrying ? JSON.stringify(job.carrying) : '';
  const askedCarry = useRef('');
  useEffect(() => {
    if (!carryKey || reading || s.reviewerAs || busyAi || askedCarry.current === carryKey) return;
    askedCarry.current = carryKey;
    const c = getState().jobs.find((x) => x.id === job.id)?.carrying;
    if (!c) return;
    if (ai.status !== 'on') return carryByRules(job.id);
    void askAi(job.id, carryMessage(c), { silent: 'the linked languages', carry: c, open: (x) => openRef.current(x) }).then((done) => (done ? carried(job.id) : carryByRules(job.id)));
  }, [carryKey, reading, s.reviewerAs, busyAi, ai.status, job.id]);

  const reviewing = Boolean(s.reviewerAs);
  const inVersion = tab.startsWith('lang:') && job.translations?.[tab.slice(5) as JobLang] ? (tab.slice(5) as JobLang) : undefined;
  const version = inVersion ? job.translations?.[inVersion] : undefined;
  // In a language tab the line shows that version's own sections (section 19, "Free jobs, downloads, and languages").
  const jobParts = partsOf(job, s);
  const parts = version ? [...jobParts.filter((p) => !p.section), ...version.sections.map((x): Part => ({ key: `s:${x.key}`, label: x.title, section: x.key, done: version.reviewed }))].sort((a, b) => (a.key === 'outline' ? -1 : b.key === 'outline' ? 1 : a.section && !b.section ? -1 : !a.section && b.section ? 1 : 0)) : jobParts;
  const current = currentPart(job, s, jobParts);
  const currentLabel =
    job.setup === 'template'
      ? 'Template'
      : job.setup === 'about'
        ? 'About us'
        : job.setup === 'project'
          ? 'Project'
          : job.setup === 'style'
            ? 'Writing style'
            : job.setup === 'pace'
              ? 'Pace'
              : (parts.find((p) => p.key === current)?.label ?? 'the job');
  const focus = sectionOf(current);
  const langs = versionsOf(job).map((k) => langOf(k));
  const ownLang = langOf(jobLang(job));
  const tabs: TabDef[] = [
    // With other languages, the original is named (e.g. English), not "Job description".
    { key: 'doc', label: langs.length ? ownLang.label : 'Job description', lang: langs.length ? ownLang.key : undefined, linked: (job.linked ?? []).includes(jobLang(job)) },
    ...langs.map((l) => ({ key: `lang:${l.key}`, label: l.native, lang: l.key, linked: (job.linked ?? []).includes(l.key), removable: !reviewing })),
    ...(preview ? [{ key: 'preview', label: 'Preview' }] : []),
    ...extra.map((k) => ({ key: k, label: EXTRA_TABS[k] ?? k })),
  ];
  const removeLangTab = (t: TabDef) => {
    if (!t.lang || t.key === 'doc') return;
    const name = langOf(t.lang).label;
    if (!window.confirm(`Remove the ${name} version? This deletes that language draft from this job.`)) return;
    removeTranslation(job.id, t.lang);
    if (tab === t.key) {
      setPreview(false);
      setTab('doc');
    }
    notify(`Removed the ${name} version.`);
  };
  const active = tabs.some((t) => t.key === tab) ? tab : 'doc';
  const card = !reviewing && !job.setup && hasFields(current) && hidden !== current;
  const previewing = Boolean(job.setup) || (pick !== null && pick.tab !== 'sections');

  const openPick = (t: Pick['tab']) => {
    setPick(startPick(s, job, t));
    if (phone) setView('job');
  };
  /** R2-P1-9: opening Preview sets both flags; any other panel tab clears the preview flag so Eye returns. */
  const pickPanelTab = (k: string) => {
    if (k === 'preview') {
      setPreview(true);
      setTab('preview');
      if (phone) setView('job');
      return;
    }
    setPreview(false);
    setTab(k);
  };
  const goPart = (key: string) => {
    settleAsk(job.id);
    setPartsOpen(false);
    if (!reviewing) unparkPart(job.id, key);
    // Reviewers see the outline read only, in the same design (section 19, phase 6, B).
    if (key === 'outline' && reviewing) return phone ? setOutlineOpen(true) : openPick('sections');
    if (key === 'outline') {
      if (phone && !job.setup) return setOutlineOpen(true);
      return openPick(job.setup ? 'templates' : 'sections');
    }
    if (inVersion && sectionOf(key)) {
      if (phone) setView('job');
      return scrollToId(`ej-ver-${sectionOf(key)}`);
    }
    setPart(job.id, key);
    setPreview(false);
    setTab('doc');
    setHidden(null);
    if (phone) setView('job');
    const sec = sectionOf(key);
    // About us and Project live in the JD: the progress line scrolls to that section. Apply still opens its fields card.
    scrollToId(sec && key !== 's:apply' ? `ej-sec-${sec}` : 'ej-part-card');
  };
  const applyPick = () => {
    if (!pick) return;
    const wasSetup = Boolean(job.setup);
    const keys = pick.order.map((o) => o.key);
    if (pick.tab === 'own') {
      const key = createFormat(pick.name.trim(), pick.order, toneOf(job.style ?? proposedStyle(s)), pick.groupOrder, pick.customGroups);
      if (wasSetup) applyTemplate(job.id, key, undefined, keys, pickGrouping(pick));
      else applyFormat(job.id, key);
    } else {
      // The template as adjusted in the panel: its sections, their groups and order, and any heading renamed for this job.
      if (wasSetup) applyTemplate(job.id, pick.key, undefined, keys, pickGrouping(pick));
      else if (pick.key !== job.format) applyFormat(job.id, pick.key);
      applyOutline(job.id, pick.order, pick.groupOrder, pick.customGroups);
    }
    setPick(null);
    if (phone) setView(wasSetup ? 'chat' : 'job');
  };
  const openPreview = () => {
    setPreview(true);
    setTab('preview');
    if (phone) setView('job');
  };
  /** A panel tab opened only when needed (section 19): a language version, the flyer, the Reach emails, the review email, payment. */
  const openTab = (k: string) => {
    if (k === 'flyer' && reachOpen(job, s)) markFlyerMade(job.id);
    if (!k.startsWith('lang:') && !extra.includes(k)) setExtra((x) => (x.includes(k) ? x : [...x, k]));
    setPreview(false);
    setTab(k);
    if (phone) setView('job');
    requestAnimationFrame(() => document.getElementById(`ej-wtab-${k}`)?.focus({ preventScroll: true }));
  };
  const closeTab = (k: string) => {
    setExtra((x) => x.filter((y) => y !== k));
    setPreview(false);
    setTab('doc');
    requestAnimationFrame(() => (document.getElementById('ej-wtab-doc') ?? document.getElementById('ej-w-panel'))?.focus({ preventScroll: true }));
  };
  const opener: Opener = { tab: openTab, part: (k) => goPart(k), preview: openPreview };
  const toJob = () => {
    setPreview(false);
    setTab('doc');
    if (phone) setView('job');
    requestAnimationFrame(() => document.getElementById('ej-w-panel')?.focus());
  };
  /**
   * One of section 17's actions for the job's state, from its card (section 19, phase 4): its dialog opens, and its button does it;
   * Close now, Amplify, Hire again, and Download are their own buttons, as in Manage jobs. Nothing outside the state's actions is done.
   */
  const act = (a: StateAction) => {
    const st = getState();
    const j = st.jobs.find((x) => x.id === job.id);
    if (!j || !stateActionsOf(st, j).includes(a)) return;
    const dialog = DIALOGS[a];
    if (dialog) return setJobDialog(dialog);
    if (a === 'close') return closeJob(j.id, 'early');
    if (a === 'delete') return setDeleteOpen(true);
    if (a === 'download') return void downloadCopy(j, st.org.name, true);
    if (a === 'amplify') {
      setChoice(j.id, 'amplify');
      return goPart('publish');
    }
    const copy = hireAgain(j.id);
    if (copy) go('job', copy);
  };
  /** What the AI asked to bring into view; a delete only opens its confirmation. */
  const openTarget = (t: OpenTarget) => {
    const j = getState().jobs.find((x) => x.id === job.id);
    if (!j) return;
    if (STATE_DIALOGS[t]) return act(STATE_DIALOGS[t]);
    if (t === 'templates' || t === 'own') return openPick(t);
    if (t === 'preview') return j.sections.length ? openPreview() : undefined;
    if (t === 'versions') return j.versions.length ? setVersionsOpen(true) : undefined;
    if (t === 'download') return void downloadCopy(j, getState().org.name);
    if (t === 'delete') return canDelete(getState(), j) ? undefined : setDeleteOpen(true);
    if ((t === 'flyer' || t === 'reach') && !reachOpen(j, getState())) return goPart(t);
    if (t === 'flyer' || t === 'reach' || t === 'payment') return openTab(t);
    if (t.startsWith('lang:')) return j.translations?.[t.slice(5) as JobLang] ? openTab(t) : undefined;
    goPart(t.startsWith('section:') ? `s:${t.slice(8)}` : t);
  };
  useEffect(() => {
    openRef.current = openTarget;
  });
  /** The window's own requests, exact and at once; everything else goes to the AI when it is on, or to the rules. */
  const send = (text: string) => {
    const t = text.toLowerCase().trim();
    const last = job.chat[job.chat.length - 1];
    // An answer offered by the last message, and a typed choice of Free or Amplify, belong to that step, not to the window's shortcuts.
    const answer = last?.from === 'ai' && Boolean(last.quick?.includes(text));
    const planChoice = !job.choice && /\b(free|amplify|package)\b/.test(t);
    const asked = isPublished(job) && !answer ? STATE_ASKS.find(([re]) => re.test(t))?.[1] : undefined;
    if (isPublished(job) && !answer && /^(?:so )?what (?:else )?(?:can|could) (?:i|we) do\b|^what now\b|^(?:show (?:me )?)?(?:the )?options\b/.test(t)) return chatNote(job.id, text, stateOffer(s, job) || 'Nothing to do from here for now.', undefined, 'state');
    if (asked) {
      if (!stateActionsOf(s, job).includes(asked)) return chatNote(job.id, text, `${STATE_LABEL[asked]} is not for ${STATE_WORD[job.status]}. ${stateOffer(s, job)}`.trim(), undefined, 'state');
      if (DIALOGS[asked]) {
        act(asked);
        return chatNote(job.id, text, 'Confirm in the dialog: it says exactly what happens.');
      }
      return chatNote(job.id, text, `Here it is: ${STATE_LABEL[asked]} is on the card below, and nothing changes until you press it.`, undefined, 'state');
    }
    // Phase 5's context (section 19, A): the profile's About us kept, the project's conflicts, and the sections that used an earlier project.
    if (answer && text === KEEP_PROFILE_ABOUT) return keepProfileAbout(job.id, text);
    if (answer && (text.startsWith('Keep ') || text.startsWith('Use ')) && job.pack?.project) {
      const hit = openConflicts(job, s.today).find((c) => text === `Use ${c.page}` || text === `Keep ${c.now}`);
      if (hit) {
        resolveConflict(job.id, hit.fact, text.startsWith('Use ') ? hit.page : null);
        const after = getState().jobs.find((x) => x.id === job.id);
        const next = after ? openConflicts(after, s.today)[0] : undefined;
        const done = text.startsWith('Use ') ? `Done: the job now says ${hit.page}.` : `Kept: the job still says ${hit.now}.`;
        const redo = after?.pack?.project?.redo ?? [];
        const then = next ? conflictQuestion(next) : redo.length && after ? redoQuestion(redo.map((k) => headingOf(s, after, k))) : null;
        return then ? chatNote(job.id, text, `${done} ${then.text}`, then.quick) : chatNote(job.id, text, done);
      }
    }
    if (answer && text === 'Keep them as they are') return chatNote(job.id, text, 'Kept as they are.');
    if (answer && text === 'Update them') {
      const used = job.pack?.project?.redo ?? [];
      if (!aiOn()) return chatNote(job.id, text, `The AI is off here, so I can't rewrite them: edit ${used.length === 1 ? 'it' : 'them'} by hand with the pencil, using the new project.`);
    }
    if (text === SHOW_FLYER && reachOpen(job, s)) openTab('flyer');
    if (text === INVITE && reachOpen(job, s)) openTab('reach');
    if (text === SKIP_APPROVAL) return setSkipOpen(true);
    if (LINK.test(t)) return chatNote(job.id, text, LINK_REPLY);
    if (PREVIEW.test(t) && !job.setup) {
      openPreview();
      return chatNote(job.id, text, 'The preview is open in the panel: the job page, how it shows in Google, and how it looks when shared.');
    }
    if (VERSIONS.test(t)) {
      if (job.versions.length) setVersionsOpen(true);
      return chatNote(job.id, text, job.versions.length ? 'Earlier versions are open: pick one to see it or go back to it.' : 'There are no earlier versions yet.');
    }
    if (DOWNLOAD.test(t)) {
      const no = downloadBlock(job);
      if (!no) downloadCopy(job, s.org.name);
      return chatNote(job.id, text, no ? `${no}. Until then you can still copy the text from the screen.` : 'Downloaded a copy of the job description.');
    }
    if (DELETE.test(t)) {
      const no = canDelete(s, job);
      if (!no) setDeleteOpen(true);
      return chatNote(job.id, text, no ? `${no}.` : 'Confirm in the dialog: it lists what is deleted and what is kept.');
    }
    if (PUBLISH.test(t) && !answer && !planChoice && !job.setup && job.sections.length) {
      goPart('publish');
      return chatNote(job.id, text, isPublished(job) && job.plan !== 'free' ? 'It is already published.' : 'Here it is, with anything still needed first. The button says exactly what happens, and nothing goes out until you press it.', undefined, 'publish');
    }
    if (REVIEW.test(t) && !answer && isReviewable(job) && job.sections.length) {
      goPart('review');
      return chatNote(job.id, text, 'Choose who reviews it, by when, and under which rule; the email they get is shown before you send.', undefined, 'review');
    }
    if (text === CHOOSE_SDGS) setFact('sdgs');
    if (parkingReply(job, s, text)) return byRules(text);
    // R2-P0-3: About/Project setup chips must hit setupTurn even when the last bubble is OpenRouter-tagged (stops About↔project loop).
    const setupStageQuick =
      (job.setup === 'about' || job.setup === 'project') &&
      (text === ABOUT_QUICK[0] ||
        text === ABOUT_QUICK[1] ||
        text === PROJECT_QUICK[0] ||
        text === PROJECT_QUICK[1] ||
        text === 'Skip for now');
    const rulesAnswer =
      (last?.from === 'ai' && !last.ai && Boolean(last.quick?.includes(text)) && text !== OTHER_WORDING) || setupStageQuick;
    if (aiOn() && !rulesAnswer) {
      void askAi(job.id, text, { focus: focus ?? undefined, version: inVersion, open: (x) => openRef.current(x) }).then((done) => {
        if (!done) byRules(text);
      });
      return;
    }
    byRules(text);
  };
  const byRules = (text: string) => {
    const j = getState().jobs.find((x) => x.id === job.id);
    if (!j) return;
    const t = text.toLowerCase().trim();
    if (j.setup === 'template' && !/^use /i.test(t)) {
      if (OWN.test(t)) openPick('own');
      else if (OTHERS.test(t)) openPick('templates');
    }
    sendChat(j.id, text, sectionOf(currentPart(j, getState(), partsOf(j, getState()))) ?? undefined, inVersion);
  };

  const pickOrder = pick ? previewOrder(s, job, pick) : null;
  const headings = (() => {
    if (pick && pickOrder && pick.tab !== 'sections') {
      const name = pick.tab === 'own' ? pick.name.trim() || 'Your template' : formatOf(s, pick.key).label;
      return <HeadingsPreview order={pickOrder} groupOrder={pick.groupOrder} title={name} note={`${pickOrder.length} sections · about ${wordsFor(pickOrder.length)} words · ${job.setup ? 'choose Use in the template panel to start writing' : 'choose Change to use it; text you edited is kept where its section stays'}`} />;
    }
    if (job.setup === 'about' || job.setup === 'project' || job.setup === 'style' || job.setup === 'pace') {
      const format = formatOf(s, job.format);
      const note =
        job.setup === 'about'
          ? 'Add your About us page in the chat first; then the project, tone, and writing follow these sections.'
          : job.setup === 'project'
            ? 'Add a project page in the chat if this role needs one; then tone and writing follow these sections.'
            : job.setup === 'style'
              ? 'Choose in the chat how it should sound; then it is written in these sections.'
              : 'Choose in the chat whether to write one section at a time or all of it first.';
      return <HeadingsPreview order={job.tags.map((k) => ({ key: k, heading: job.sections.find((x) => x.key === k)?.title ?? headingFor(k, format), ...(job.groupOf?.[k] ? { group: job.groupOf[k] } : {}) }))} groupOrder={job.groupOrder} title={format.label} note={note} />;
    }
    return (
      <div className="aj-card flex flex-col items-center gap-3 p-8 text-center aj-muted">
        <FileText size={22} strokeWidth={1.5} />
        {reading ? 'Reading your role…' : 'Your job description appears here once the template is chosen.'}
        {!reading && !reviewing && (
          <div className="flex flex-wrap justify-center gap-1.5">
            <button type="button" className="aj-pill" onClick={() => openPick('templates')}>
              Browse templates
            </button>
            <button type="button" className="aj-pill" onClick={() => openPick('own')}>
              Create your own
            </button>
          </div>
        )}
      </div>
    );
  })();

  const doc = previewing ? (
    headings
  ) : (
    <div className="flex flex-col gap-3">
      {card && <PartFields part={current} job={job} s={s} onClose={() => setHidden(current)} onFact={(k) => setFact(k)} open={opener} act={act} />}
      {job.status === 'live' && changesSince(job).length > 0 && (
        <div className="aj-card px-3 py-2" role="status" aria-label="Changed since publishing">
          <strong>Changed since publishing:</strong> <span className="aj-muted">{changeSummary(changesSince(job))}</span>
        </div>
      )}
      {job.sections.length ? (
        <DocumentView
          job={job}
          s={s}
          current={focus}
          noteEdits
          draft
          onSeeChat={phone ? () => setView('chat') : undefined}
          open={(t) => goPart(t.startsWith('section:') ? `s:${t.slice(8)}` : t)}
        />
      ) : (
        <div className="aj-card flex flex-col gap-2 p-5">
          <TitleEditor job={job} disabled={reviewing} />
          <div className="flex flex-col items-center gap-2 py-4 text-center aj-muted">
            <FileText size={22} strokeWidth={1.5} />
            Your job description appears here as soon as AidJobs knows the role.
          </div>
        </div>
      )}
    </div>
  );
  const lang = active.startsWith('lang:') ? (active.slice(5) as JobLang) : null;
  const panel = (
    <div id="ej-w-panel" className="aj-scroll min-h-0 flex-1 px-3 py-3 lg:px-5" role={tabs.length > 1 ? 'tabpanel' : 'region'} aria-labelledby={tabs.length > 1 ? `ej-wtab-${active}` : undefined} aria-label={tabs.length > 1 ? undefined : 'Job description'} tabIndex={-1}>
      {active === 'preview' ? (
        <PreviewPanel
          job={job}
          s={s}
          onClose={() => {
            setPreview(false);
            setTab('doc');
          }}
        />
      ) : lang ? (
        <LangDoc job={job} s={s} lang={lang} readOnly={reviewing} />
      ) : EXTRA_TABS[active] ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="ej-panel-label min-w-0 flex-1">{EXTRA_TABS[active]}</span>
            <button type="button" className="aj-text-btn inline-flex items-center gap-1" style={{ height: 28 }} onClick={() => closeTab(active)}>
              <X size={13} strokeWidth={2} aria-hidden /> Close
            </button>
          </div>
          {active === 'flyer' && <FlyerPanel job={job} s={s} url={jobUrl(job)} />}
          {active === 'reach' && !reachOpen(job, s) && <p className="aj-muted m-0" role="status">{amplifying(job) ? 'Reach opens once review is done: approved, or no review where your organisation does not ask for one. The invitations you prepared are kept.' : 'Reach comes with Amplify.'}</p>}
          {active === 'reach' && reachOpen(job, s) && <ReachEditor key={job.id} job={job} s={s} mode={isPublished(job) && job.plan === 'amplify' && job.status === 'live' ? 'send' : 'plan'} sendsOn={job.publishOn ?? null} live={job.status === 'live'} onDone={() => goOn(job.id)} />}
          {active === 'reviewmail' && (isReviewable(job) ? <ReviewForm job={job} s={s} onSent={() => closeTab('reviewmail')} /> : <p className="aj-muted m-0">Review happens before publishing.</p>)}
          {active === 'payment' && <PaymentPanel job={job} s={s} open={opener} />}
        </div>
      ) : (
        doc
      )}
    </div>
  );
  const tools = !job.setup && (
    <span className="flex shrink-0 items-center gap-1">
      {!preview && job.sections.length > 0 && (
        <Tip label="Preview: the job page, in Google, and when shared" side="bottom">
          <button type="button" className="aj-icon-btn" style={{ width: 30, height: 30 }} onClick={openPreview} aria-label="Preview">
            <Eye size={14} strokeWidth={1.8} />
          </button>
        </Tip>
      )}
      {job.versions.length > 0 && (
        <Tip label="Earlier versions" side="bottom">
          <button type="button" className="aj-icon-btn" style={{ width: 30, height: 30 }} onClick={() => setVersionsOpen(true)} aria-label="Earlier versions">
            <History size={14} strokeWidth={1.8} />
          </button>
        </Tip>
      )}
    </span>
  );
  const chat = reviewing ? <ReviewColumn job={job} s={s} on={focus ?? undefined} onSection={(k) => goPart(`s:${k}`)} /> : <WindowChat job={job} s={s} reading={reading} subject={currentLabel} onSend={send} onSkip={toJob} autoFocus={!phone} open={opener} act={act} />;
  const titleBox = (
    <span className="ej-w-titlebox">
      <h1 className="ej-w-title">{job.facts.title || 'Untitled job'}</h1>
      <Tip label={statusLine(s, job)} side="bottom" className="min-w-0">
        <span className="ej-w-status" tabIndex={0}>
          {statusLine(s, job)}
        </span>
      </Tip>
    </span>
  );
  const back = (
    <Tip label="Back" side="bottom">
      <button type="button" className="aj-icon-btn" onClick={() => goBack('create')} aria-label="Back">
        <ArrowLeft size={15} strokeWidth={1.8} />
      </button>
    </Tip>
  );
  const overlays = (
    <>
      <div className="sr-only" aria-live="polite">
        {said}
      </div>
      {fact === 'sdgs' && <SdgDialog job={job} onClose={() => setFact(null)} />}
      {fact === 'lang' && <LangDialog job={job} onClose={() => setFact(null)} />}
      {fact && fact !== 'sdgs' && fact !== 'title' && fact !== 'lang' && (
        <FactDialog
          which={fact}
          job={job}
          s={s}
          onClose={() => {
            setFact(null);
            settleAsk(job.id);
          }}
        />
      )}
      {versionsOpen && <VersionsDialog job={job} readOnly={reviewing} onClose={() => setVersionsOpen(false)} />}
      {deleteOpen && <DeleteDialog job={job} s={s} onClose={() => setDeleteOpen(false)} onDeleted={() => go(isPublished(job) ? 'jobs' : 'create')} />}
      {jobDialog && <JobDialog job={job} s={s} kind={jobDialog} onClose={() => setJobDialog(null)} onDeleted={() => go('jobs')} />}
      {skipOpen && (
        <SkipDialog
          job={job}
          onClose={() => setSkipOpen(false)}
          onDone={() => {
            setSkipOpen(false);
            windowSays(job.id, null, 'Approval skipped, with your reason in the job’s history. The reviewers you asked are told when it is published.');
          }}
        />
      )}
    </>
  );

  if (phone) {
    const question = reading ? 'Reading your role…' : plain([...job.chat].reverse().find((m) => m.from === 'ai')?.text ?? 'Choose a template');
    const choosing = pick !== null && pick.tab !== 'sections';
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 aj-hair">
          {back}
          {titleBox}
          <div className="ej-switch shrink-0" role="group" aria-label="Show">
            <button type="button" className="ej-switch-btn" aria-pressed={view === 'chat'} onClick={() => setView('chat')}>
              {reviewing ? 'Review' : 'Chat'}
            </button>
            <button
              type="button"
              className="ej-switch-btn"
              aria-pressed={view === 'job'}
              onClick={() => {
                setView('job');
                setUnseen(false);
              }}
            >
              Job
              {unseen && view !== 'job' ? (
                <>
                  <span className="ej-new-dot" aria-hidden />
                  <span className="sr-only">, updated</span>
                </>
              ) : null}
            </button>
          </div>
        </div>
        {view === 'chat' ? (
          <div className="min-h-0 flex-1">{chat}</div>
        ) : choosing && pick ? (
          <PhoneTemplate job={job} s={s} pick={pick} setPick={setPick} onApply={applyPick} onChat={() => setView('chat')} onCancel={job.setup ? undefined : () => setPick(null)} question={question} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-1.5 aj-hair">
              <button type="button" className="ej-parts-btn" aria-haspopup="dialog" onClick={() => setPartsOpen(true)}>
                <span className="ej-line-label">{currentLabel}</span>
                <span className="ej-jump-count">
                  · {parts.filter((p) => p.done).length} of {parts.length} done
                </span>
                <ChevronDown size={13} strokeWidth={2} aria-hidden />
              </button>
              <span className="ml-auto">{tools}</span>
            </div>
            {tabs.length > 1 && (
              <div className="shrink-0 border-b aj-hair">
                <PanelTabs tabs={tabs} active={active} onPick={pickPanelTab} onRemove={removeLangTab} end={langs.length && !reviewing ? <LinkLangs job={job} disabled={false} /> : undefined} />
              </div>
            )}
            {panel}
          </div>
        )}
        {partsOpen && (
          <Dialog title="Parts of this job" subtitle={`${parts.filter((p) => p.done).length} of ${parts.length} done`} onClose={() => setPartsOpen(false)} half>
            <PartsList parts={parts} current={current} onGo={goPart} />
          </Dialog>
        )}
        {outlineOpen && (
          <Dialog title={formatOf(s, job.format).label} subtitle="This job's sections" onClose={() => setOutlineOpen(false)} half>
            <div className="flex flex-col gap-3">
              {!reviewing && (
                <button
                  type="button"
                  className="aj-pill self-start"
                  onClick={() => {
                    setOutlineOpen(false);
                    openPick('templates');
                  }}
                >
                  Change the template
                </button>
              )}
              <JobOutline job={job} s={s} lang={inVersion} />
            </div>
          </Dialog>
        )}
        {overlays}
      </div>
    );
  }

  const tabRow = tabs.length > 1;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="ej-w-head">
        {back}
        {titleBox}
        <span className="min-w-0 flex-1" />
        {tools}
      </div>
      <div ref={bodyRef} className="relative flex min-h-0 flex-1" style={{ userSelect: dragging ? 'none' : undefined }}>
        <section className="ej-w-chat flex min-h-0 flex-col" style={{ width: chatW }} aria-label={reviewing ? 'Review' : 'Chat with AidJobs'}>
          <div className="aj-card flex min-h-0 flex-1 flex-col overflow-hidden">{chat}</div>
        </section>
        <div
          className="aj-divider"
          data-dragging={dragging}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the chat and the job description"
          aria-valuenow={Math.round(chatW)}
          aria-valuemin={300}
          aria-valuemax={Math.max(300, body.w - 420)}
          tabIndex={0}
          onPointerDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const w = Math.min(Math.max(300, chatW + (e.key === 'ArrowLeft' ? -24 : 24)), Math.max(300, (body.w || 1200) - 420));
            setChatW(w);
            save(SPLIT_KEY, w);
          }}
        />
        <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="The job">
          <div className={tabRow ? 'ej-pline ej-pline--tabs' : 'ej-pline'}>
            <PanelLine parts={parts} current={current} onGo={goPart} />
          </div>
          {tabRow && (
            <div className="shrink-0 border-b aj-hair">
              <PanelTabs tabs={tabs} active={active} onPick={pickPanelTab} onRemove={removeLangTab} end={langs.length && !reviewing ? <LinkLangs job={job} disabled={false} /> : undefined} />
            </div>
          )}
          {panel}
        </section>
        {pick && (
          <TemplatePanel
            job={job}
            s={s}
            pick={pick}
            setPick={setPick}
            onApply={applyPick}
            onClose={() => setPick(null)}
            lang={inVersion}
            start={{ x: body.left + 12, y: Math.round(body.top + (body.h || 700) * 0.08), w: Math.min(520, Math.max(360, chatW - 24)), h: Math.round((body.h || 700) * 0.88) - 12 }}
          />
        )}
      </div>
      {overlays}
    </div>
  );
}
