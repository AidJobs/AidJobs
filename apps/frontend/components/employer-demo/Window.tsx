'use client';

import { ArrowLeft, ChevronDown, Eye, FileText, History, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useIsPhone } from '@/components/site/BottomSheet';
import Tip from '@/components/site/Tip';
import { applyFormat, applyOrgSdgs, applyTemplate, bringDocument, canDelete, chatNote, createFormat, downloadBlock, downloadCopy, formatOf, goOn, isReviewable, LINK_REPLY, sendChat, setJobLang, setPart, setSdgs, settleAsk, windowSays, writeNow } from './actions';
import { FlyerPanel } from './Flyer';
import { isPublished } from './lifecycle';
import { jobUrl } from './links';
import { SkipDialog } from './Publish';
import { LangsPart, LiveCard, FullPart, MarketPart, PaymentPanel, PlanChoice, PublishCard, ReviewPart, type Opener } from './PublishSteps';
import { ReachEditor } from './Reach';
import { planCount } from './invites';
import { ReviewForm } from './Review';
import type { ChatMsg } from './types';
import { aiOn, askAi, GO_ON, probeAi, useAi, writeVersion } from './ai';
import { FIXED_SECTIONS, nextStep, partOfStep, stepKey } from './flow';
import { readJobFile } from './readFile';
import { CHOOSE_SDGS, INVITE, OTHER_WORDING, SHOW_FLYER, SKIP_APPROVAL } from './walkChat';
import type { OpenTarget } from './aiActions';
import { changesSince, changeSummary } from './changes';
import { openPoints } from './Checks';
import Composer, { type ComposerHandle } from './Composer';
import { READING_KEY } from './CreateEntry';
import { ApplyFields, AskAnswer, DocumentView, rich, TitleEditor } from './DocPane';
import { arrangementLabel, completeText, headingFor, longDate, PLACES, salaryText } from './engine';
import { FactDialog, typeLabel, type FactKey } from './FactBar';
import { statusLine } from './Home';
import { DeleteDialog } from './JobActions';
import { LangDoc } from './LangDoc';
import MenuButton from './MenuButton';
import { currentPart, hasFields, lineFit, onLine, partsOf, sectionOf, type Part } from './parts';
import { canGoFree } from './plans';
import { GooglePreview, JobPageLangs, ShareCards } from './Publish';
import { VersionsDialog } from './Review';
import { inferSdgs, proposedStyle, SDG_NAMES, sdgsOf, toneOf, wordsFor } from './setup';
import { getState, go, goBack, useDemo } from './store';
import Structure, { Commitments } from './Structure';
import { HeadingsPreview, PhoneTemplate, previewOrder, startPick, TemplatePanel, type Pick } from './TemplatePanel';
import { ALL_LANGS, jobLang, langOf, versionsOf } from './translate';
import type { DemoJob, JobLang, State } from './types';
import { Dialog, radioKeys } from './ui';

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
const OPEN_EARLIER = 'Open the earlier workspace';
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
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }));
}

/** A message as one plain line, for the phone's slim question line. */
function plain(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\s*\n+\s*/g, ' ');
}

function PartButton({ part, current, onGo }: { part: Part; current: boolean; onGo: (k: string) => void }) {
  const state = current ? 'current' : part.done ? 'done' : 'todo';
  const button = (
    <button type="button" className="ej-line-part" data-state={state} aria-current={current ? 'step' : undefined} onClick={() => onGo(part.key)}>
      <span className="ej-line-label">{part.label}</span>
      <span className="sr-only">{part.done ? ', done' : ', to do'}</span>
    </button>
  );
  return part.label.length < 22 ? button : <Tip label={part.label} side="bottom">{button}</Tip>;
}

/**
 * The progress line, in the header row: every part of the job, current, done, or to do, starting with the template's name. Whatever
 * does not fit goes into "+N", so nothing is out of sight; the part in view always stays on the line.
 */
function HeaderLine({ parts, current, onGo }: { parts: Part[]; current: string; onGo: (k: string) => void }) {
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

type TabDef = { key: string; label: string; lang?: string };

/** The output panel's tabs, shown only when there is a second view: a language version, or the preview. */
function PanelTabs({ tabs, active, onPick }: { tabs: TabDef[]; active: string; onPick: (k: string) => void }) {
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
    <div className="ej-w-tabs" role="tablist" aria-label="What the panel shows" onKeyDown={keys}>
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" id={`ej-wtab-${t.key}`} aria-selected={t.key === active} aria-controls="ej-w-panel" tabIndex={t.key === active ? 0 : -1} className="ej-w-tab" lang={t.lang} onClick={() => onPick(t.key)}>
          {t.label}
        </button>
      ))}
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
              el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
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
function PartFields({ part, job, s, onClose, onFact, open }: { part: string; job: DemoJob; s: State; onClose: () => void; onFact: (k: RowKey) => void; open: Opener }) {
  const points = job.sections.length ? openPoints(job, s, false) : [];
  const head: Record<string, [string, string]> = {
    details: ['Details', 'The facts the job description and Google use'],
    fixed: ['Fixed text', "Your organisation's commitments, word for word"],
    check: ['Check', 'Clarity, inclusive language, placeholders, and dates'],
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
  else if (part === 'fixed') body = <Commitments job={job} s={s} />;
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
  else if (part === 'publish') body = <PublishCard job={job} s={s} open={open} />;
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
/** A card under the chat's message (section 19, steps 8 and 9): the one place, with the part on the line, where it is published, paid, or sent. */
function ChatCardView({ kind, job, s, open }: { kind: NonNullable<ChatMsg['card']>; job: DemoJob; s: State; open: Opener }) {
  const label = { plan: 'Free or Amplify', review: 'Send for review', publish: 'Publish', live: 'Published' }[kind];
  return (
    <section className="aj-card ej-chat-card mt-2 flex flex-col gap-2 p-3" aria-label={label}>
      {kind === 'plan' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="aj-pill" onClick={() => open.part('plan')}>
            Compare Free and Amplify
          </button>
        </div>
      )}
      {kind === 'review' && (
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

function WindowChat({ job, s, reading, subject, onSend, onSkip, autoFocus, open }: { job: DemoJob; s: State; reading: boolean; subject: string; onSend: (text: string) => void; onSkip: () => void; autoFocus: boolean; open: Opener }) {
  const [text, setText] = useState('');
  const [tapped, setTapped] = useState<string | null>(null);
  const [box, setBox] = useState(() => readNumber(BOX_KEY, 0));
  const input = useRef<ComposerHandle>(null);
  const end = useRef<HTMLDivElement>(null);
  const ai = useAi();
  const waiting = ai.pending[job.id];
  const thinking = Boolean(waiting) && !waiting?.first && !waiting?.silent;
  const busy = Boolean(waiting) || reading;
  const firstUser = job.chat.findIndex((m) => m.from === 'user');
  const shown = reading ? job.chat.slice(0, firstUser + 1) : job.chat;
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
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
      <div className="aj-scroll flex min-h-0 flex-1 flex-col gap-2 px-4 py-3" role="log" aria-label="Conversation with AidJobs" aria-live="polite">
        {shown.length === 0 && !reviewing && <p className="aj-faint m-0">Ask AidJobs for any change to the job description, or open a part of it.</p>}
        {shown.map((m, i) => (
          <div key={m.id} className="ej-bubble" data-from={m.from}>
            {rich(m.text)}
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
                    className="aj-pill"
                    style={{ height: 30 }}
                    disabled={i < lastUser || reviewing || busy || tapped === m.id}
                    onClick={() => {
                      setTapped(m.id);
                      onSend(q);
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {m.from === 'ai' && m === last && m.ask && !reviewing && !busy && <AskAnswer job={job} s={s} kind={m.ask} onAnswered={() => setTimeout(() => input.current?.focus(), 0)} />}
            {m.from === 'ai' && m.card && i === lastCard && i > lastUser && !reviewing && <ChatCardView kind={m.card} job={job} s={s} open={open} />}
          </div>
        ))}
        {reading && (
          <div className="ej-bubble ej-reading" data-from="ai" role="status">
            Reading your role…
          </div>
        )}
        {thinking && (
          <>
            <div className="ej-bubble" data-from="user">
              {waiting?.text}
            </div>
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
        {reviewing ? (
          <div className="flex flex-col gap-2 pt-2.5">
            <span className="aj-muted">You are looking as a reviewer. For now, comments and approval are in the earlier workspace.</span>
            <button type="button" className="aj-pill self-start" onClick={() => go('create', job.id)}>
              {OPEN_EARLIER}
            </button>
          </div>
        ) : (
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
            <Composer
              ref={input}
              value={text}
              onChange={setText}
              onSend={(v) => {
                if (busy) return;
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
  const [partsOpen, setPartsOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const [said, setSaid] = useState('');
  const [pick, setPick] = useState<Pick | null>(null);
  const [chatW, setChatW] = useState(() => readNumber(SPLIT_KEY, 400));
  const [dragging, setDragging] = useState(false);
  const [body, setBody] = useState({ w: 0, h: 0 });
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
      setTab('doc');
      setSaid(`Updated in the job description: ${job.lastChange.keys.map((k) => job.sections.find((x) => x.key === k)?.title ?? k).join(', ')}.`);
      if (phone) setUnseen(true);
    }
  }

  const openRef = useRef<(t: OpenTarget) => void>(() => {});

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
      if (on && said && !answered) await askAi(id, said, { first: true, open: (x) => openRef.current(x) });
      answered = true;
      end();
    });
    return () => clearTimeout(t);
  }, [reading, id]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => setBody({ w: el.clientWidth, h: el.clientHeight }));
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

  // The line follows a new employer's writing: each step brings its part into view; a language version to review opens its tab.
  const step = nextStep(job, s);
  const stepNow = stepKey(step);
  const seenStep = useRef(stepNow);
  const [versionShown, setVersionShown] = useState('');
  if (step?.kind === 'version' && versionShown !== stepNow && !reading) {
    setVersionShown(stepNow);
    setTab(`lang:${step.lang}`);
  }
  useEffect(() => {
    if (stepNow === seenStep.current || reading) return;
    seenStep.current = stepNow;
    const p = partOfStep(step, job);
    if (!p || s.reviewerAs) return;
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

  const reviewing = Boolean(s.reviewerAs);
  const inVersion = tab.startsWith('lang:') && job.translations?.[tab.slice(5) as JobLang] ? (tab.slice(5) as JobLang) : undefined;
  const version = inVersion ? job.translations?.[inVersion] : undefined;
  // In a language tab the line shows that version's own sections (section 19, "Free jobs, downloads, and languages").
  const jobParts = partsOf(job, s);
  const parts = version ? [...jobParts.filter((p) => !p.section), ...version.sections.map((x): Part => ({ key: `s:${x.key}`, label: x.title, section: x.key, done: version.reviewed }))].sort((a, b) => (a.key === 'outline' ? -1 : b.key === 'outline' ? 1 : a.section && !b.section ? -1 : !a.section && b.section ? 1 : 0)) : jobParts;
  const current = currentPart(job, s, jobParts);
  const currentLabel = job.setup === 'template' ? 'Template' : job.setup === 'style' ? 'Writing style' : job.setup === 'pace' ? 'Pace' : (parts.find((p) => p.key === current)?.label ?? 'the job');
  const focus = sectionOf(current);
  const langs = versionsOf(job).map((k) => langOf(k));
  const tabs: TabDef[] = [
    { key: 'doc', label: 'Job description' },
    ...langs.map((l) => ({ key: `lang:${l.key}`, label: l.native, lang: l.key })),
    ...(preview ? [{ key: 'preview', label: 'Preview' }] : []),
    ...extra.map((k) => ({ key: k, label: EXTRA_TABS[k] ?? k })),
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : 'doc';
  const card = !reviewing && !job.setup && hasFields(current) && hidden !== current;
  const previewing = Boolean(job.setup) || (pick !== null && pick.tab !== 'sections');

  const openPick = (t: Pick['tab']) => {
    setPick(startPick(s, job, t));
    if (phone) setView('job');
  };
  const goPart = (key: string) => {
    settleAsk(job.id);
    setPartsOpen(false);
    if (key === 'outline') {
      if (phone && !job.setup) return setOutlineOpen(true);
      return openPick(job.setup ? 'templates' : 'sections');
    }
    if (inVersion && sectionOf(key)) {
      if (phone) setView('job');
      return scrollToId(`ej-ver-${sectionOf(key)}`);
    }
    setPart(job.id, key);
    setTab('doc');
    setHidden(null);
    if (phone) setView('job');
    const sec = sectionOf(key);
    scrollToId(sec && key !== 's:apply' ? `ej-sec-${sec}` : 'ej-part-card');
  };
  const applyPick = () => {
    if (!pick) return;
    const wasSetup = Boolean(job.setup);
    if (pick.tab === 'own') {
      const key = createFormat(pick.name.trim(), pick.order, toneOf(job.style ?? proposedStyle(s)));
      if (wasSetup) applyTemplate(job.id, key, undefined, pick.order.map((o) => o.key));
      else applyFormat(job.id, key);
    } else if (wasSetup) applyTemplate(job.id, pick.key);
    else applyFormat(job.id, pick.key);
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
    if (!k.startsWith('lang:') && !extra.includes(k)) setExtra((x) => (x.includes(k) ? x : [...x, k]));
    setTab(k);
    if (phone) setView('job');
    requestAnimationFrame(() => document.getElementById(`ej-wtab-${k}`)?.focus({ preventScroll: true }));
  };
  const closeTab = (k: string) => {
    setExtra((x) => x.filter((y) => y !== k));
    setTab('doc');
  };
  const opener: Opener = { tab: openTab, part: (k) => goPart(k), preview: openPreview };
  const toJob = () => {
    setTab('doc');
    if (phone) setView('job');
    requestAnimationFrame(() => document.getElementById('ej-w-panel')?.focus());
  };
  /** What the AI asked to bring into view; a delete only opens its confirmation. */
  const openTarget = (t: OpenTarget) => {
    const j = getState().jobs.find((x) => x.id === job.id);
    if (!j) return;
    if (t === 'templates' || t === 'own') return openPick(t);
    if (t === 'preview') return j.sections.length ? openPreview() : undefined;
    if (t === 'versions') return j.versions.length ? setVersionsOpen(true) : undefined;
    if (t === 'download') return void downloadCopy(j, getState().org.name);
    if (t === 'delete') return canDelete(getState(), j) ? undefined : setDeleteOpen(true);
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
    if (t === OPEN_EARLIER.toLowerCase()) return go('create', job.id);
    if (text === SHOW_FLYER) openTab('flyer');
    if (text === INVITE) openTab('reach');
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
    if (PUBLISH.test(t) && !job.setup && job.sections.length) {
      goPart('publish');
      return chatNote(job.id, text, isPublished(job) && job.plan !== 'free' ? 'It is already published.' : 'Here it is, with anything still needed first. The button says exactly what happens, and nothing goes out until you press it.', undefined, 'publish');
    }
    if (REVIEW.test(t) && isReviewable(job) && job.sections.length) {
      goPart('review');
      return chatNote(job.id, text, 'Choose who reviews it, by when, and under which rule; the email they get is shown before you send.', undefined, 'review');
    }
    const last = job.chat[job.chat.length - 1];
    if (text === CHOOSE_SDGS) setFact('sdgs');
    const rulesAnswer = last?.from === 'ai' && !last.ai && Boolean(last.quick?.includes(text)) && text !== OTHER_WORDING;
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
      return <HeadingsPreview order={pickOrder} title={name} note={`${pickOrder.length} sections · about ${wordsFor(pickOrder.length)} words · ${job.setup ? 'choose Use in the template panel to start writing' : 'choose Change to use it; text you edited is kept where its section stays'}`} />;
    }
    if (job.setup === 'style' || job.setup === 'pace') {
      const format = formatOf(s, job.format);
      return <HeadingsPreview order={job.tags.map((k) => ({ key: k, heading: job.sections.find((x) => x.key === k)?.title ?? headingFor(k, format) }))} title={format.label} note={job.setup === 'style' ? 'Choose in the chat how it should sound; then it is written in these sections.' : 'Choose in the chat whether to write one section at a time or all of it first.'} />;
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
      {card && <PartFields part={current} job={job} s={s} onClose={() => setHidden(current)} onFact={(k) => setFact(k)} open={opener} />}
      {job.status === 'live' && changesSince(job).length > 0 && (
        <div className="aj-card px-3 py-2" role="status" aria-label="Changed since publishing">
          <strong>Changed since publishing:</strong> <span className="aj-muted">{changeSummary(changesSince(job))}</span>
        </div>
      )}
      {job.sections.length ? (
        <DocumentView job={job} s={s} current={focus} noteEdits onSeeChat={phone ? () => setView('chat') : undefined} />
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
        <LangDoc job={job} lang={lang} readOnly={reviewing} />
      ) : EXTRA_TABS[active] ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="ej-panel-label min-w-0 flex-1">{EXTRA_TABS[active]}</span>
            <button type="button" className="aj-text-btn inline-flex items-center gap-1" style={{ height: 28 }} onClick={() => closeTab(active)}>
              <X size={13} strokeWidth={2} aria-hidden /> Close
            </button>
          </div>
          {active === 'flyer' && <FlyerPanel job={job} s={s} url={jobUrl(job)} />}
          {active === 'reach' && <ReachEditor key={job.id} job={job} s={s} mode={isPublished(job) && job.plan === 'amplify' && job.status === 'live' ? 'send' : 'plan'} sendsOn={job.publishOn ?? null} live={job.status === 'live'} onDone={() => goOn(job.id)} />}
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
  const chat = <WindowChat job={job} s={s} reading={reading} subject={currentLabel} onSend={send} onSkip={toJob} autoFocus={!phone} open={opener} />;
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
      {deleteOpen && <DeleteDialog job={job} s={s} onClose={() => setDeleteOpen(false)} onDeleted={() => go('create')} />}
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
              Chat
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
                <PanelTabs tabs={tabs} active={active} onPick={setTab} />
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
              <Structure job={job} s={s} bare hideCommitments />
            </div>
          </Dialog>
        )}
        {overlays}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="ej-w-head">
        {back}
        {titleBox}
        <HeaderLine parts={parts} current={current} onGo={goPart} />
        {tools}
        <Tip label="The workspace before this round, kept until this window has everything" side="bottom">
          <button type="button" className="aj-text-btn shrink-0" style={{ height: 30 }} onClick={() => go('create', job.id)}>
            Earlier workspace
          </button>
        </Tip>
      </div>
      <div ref={bodyRef} className="relative flex min-h-0 flex-1" style={{ userSelect: dragging ? 'none' : undefined }}>
        <section className="ej-w-chat flex min-h-0 flex-col" style={{ width: chatW }} aria-label="Chat with AidJobs">
          {chat}
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
          {tabs.length > 1 && (
            <div className="shrink-0 border-b aj-hair">
              <PanelTabs tabs={tabs} active={active} onPick={setTab} />
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
            bounds={{ w: body.w || 1200, h: body.h || 700 }}
            start={{ x: 12, y: Math.round((body.h || 700) * 0.24), w: Math.min(460, Math.max(340, chatW - 24)), h: Math.round((body.h || 700) * 0.76) - 12 }}
          />
        )}
      </div>
      {overlays}
    </div>
  );
}
