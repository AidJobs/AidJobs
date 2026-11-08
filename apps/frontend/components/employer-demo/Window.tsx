'use client';

import { ArrowLeft, Check, ChevronDown, ChevronRight, Eye, FileText, History, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useIsPhone } from '@/components/site/BottomSheet';
import Tip from '@/components/site/Tip';
import { canDelete, chatNote, downloadCopy, isReviewable, sendChat, setPart, settleAsk } from './actions';
import { changesSince, changeSummary } from './changes';
import { openPoints } from './Checks';
import Composer, { type ComposerHandle } from './Composer';
import { READING_KEY } from './CreateEntry';
import { ApplyFields, AskAnswer, DocumentView, rich, TitleEditor } from './DocPane';
import { arrangementLabel, completeText, longDate, PLACES, salaryText } from './engine';
import { FactDialog, typeLabel, type FactKey } from './FactBar';
import { statusLine } from './Home';
import { DeleteDialog } from './JobActions';
import { LangDoc } from './LangDoc';
import { currentPart, hasFields, partsOf, sectionOf, type Part } from './parts';
import { canGoFree } from './plans';
import { GooglePreview, JobPageLangs, ShareCards } from './Publish';
import { VersionsDialog } from './Review';
import { go, goBack, useDemo } from './store';
import Structure, { Commitments } from './Structure';
import { LANGS } from './translate';
import type { DemoJob, Lang, State } from './types';
import { Dialog, radioKeys } from './ui';

/** Requests the window answers itself; everything else goes to the writer. */
const PREVIEW = /^(please\s+)?((show|open|see)( me)?( the)?( job page)? preview|preview( it)?|how (will|does) it look)\b/;
const VERSIONS = /\b(earlier|previous|older) versions?\b|\bversion history\b/;
const DOWNLOAD = /^(please\s+)?(download|export)\b/;
const DELETE = /^(please\s+)?(delete|discard) (this|the) (job|draft|job draft)\b/;
const PUBLISH = /^(please\s+)?(publish|post it|go live|schedule)\b/;
const REVIEW = /^(please\s+)?(send|submit|ask)\b.*\breview/;
const OPEN_PUBLISH = 'Open Check and publish';
const OPEN_EARLIER = 'Open the earlier workspace';

type PreviewView = 'page' | 'google' | 'share';

function readingNow(id?: string): boolean {
  try {
    return Boolean(id) && localStorage.getItem(READING_KEY) === id;
  } catch {
    return false;
  }
}

function scrollToId(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }));
}

/** A part's mark on the line: a tick when done, a dot when current, an empty ring still to do. */
function Mark({ state }: { state: 'done' | 'current' | 'todo' }) {
  return <span className="ej-line-mark" aria-hidden>{state === 'done' ? <Check size={9} strokeWidth={3.2} /> : null}</span>;
}

function PartButton({ part, current, onGo, wide }: { part: Part; current: boolean; onGo: (k: string) => void; wide?: boolean }) {
  const state = current ? 'current' : part.done ? 'done' : 'todo';
  const button = (
    <button type="button" className="ej-line-part" data-state={state} aria-current={current ? 'step' : undefined} onClick={() => onGo(part.key)}>
      <Mark state={state} />
      <span className="ej-line-label">{part.label}</span>
      <span className="sr-only">{part.done ? ', done' : ', to do'}</span>
    </button>
  );
  return wide || part.label.length < 22 ? button : <Tip label={part.label} side="bottom">{button}</Tip>;
}

/**
 * The progress line, above the output panel: every part of the job, done, current, or to do. It is also the way around: a part opens in
 * the panel and becomes the chat's subject. The sections are one entry that opens out, so the line stays short.
 */
function ProgressLine({ parts, current, onGo }: { parts: Part[]; current: string; onGo: (k: string) => void }) {
  const sections = parts.filter((p) => p.section);
  const inSections = Boolean(sectionOf(current));
  const [open, setOpen] = useState(inSections);
  const [seen, setSeen] = useState(current);
  const list = useRef<HTMLOListElement>(null);
  if (seen !== current) {
    setSeen(current);
    if (inSections) setOpen(true);
  }
  useEffect(() => {
    list.current?.querySelector('[aria-current]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [current, open]);
  const done = sections.filter((p) => p.done).length;
  const groupCurrent = inSections && !open;
  return (
    <nav className="min-w-0 flex-1" aria-label="Parts of this job">
      <ol ref={list} className="ej-line">
        {parts
          .filter((p) => !p.section)
          .flatMap((p) => {
            const item = (
              <li key={p.key}>
                <PartButton part={p} current={p.key === current} onGo={onGo} />
              </li>
            );
            if (p.key !== 'outline' || !sections.length) return [item];
            return [
              item,
              <li key="sections">
                <button type="button" className="ej-line-part" data-state={groupCurrent ? 'current' : done === sections.length ? 'done' : 'todo'} aria-current={groupCurrent ? 'step' : undefined} aria-expanded={open} onClick={() => setOpen(!open)}>
                  <ChevronRight size={13} strokeWidth={2.2} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease' }} aria-hidden />
                  <span className="ej-line-label">Sections</span>
                  <span className="ej-jump-count">
                    {done} of {sections.length}
                  </span>
                </button>
              </li>,
              ...(open
                ? sections.map((sec) => (
                    <li key={sec.key} className="ej-line-sub">
                      <PartButton part={sec} current={sec.key === current} onGo={onGo} />
                    </li>
                  ))
                : []),
            ];
          })}
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
            <PartButton part={p} current={p.key === current} onGo={onGo} wide />
          </li>
        ))}
      </ol>
    </nav>
  );
}

type TabDef = { key: string; label: string; lang?: string };

/** The output panel's tabs: the job description always; a language version, or the preview, only when there is one to show. */
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

function FactRows({ job, s, onFact }: { job: DemoJob; s: State; onFact: (k: FactKey) => void }) {
  const f = job.facts;
  const ro = Boolean(s.reviewerAs);
  const more = [f.eligibility !== 'anyone' ? { nationals: 'Nationals only', internal: 'Internal candidates only', righttowork: 'Right to work needed' }[f.eligibility] : '', f.languages.join(', '), Number(f.positions) > 1 ? `${f.positions} positions` : '', f.donor].filter(Boolean).join(' · ');
  const rows: Array<{ key: FactKey | 'title'; label: string; value: string; missing?: boolean; hint?: string }> = [
    { key: 'title', label: 'Job title', value: f.title, missing: !f.title },
    { key: 'place', label: 'Duty station', value: f.location ? `${f.location} · ${arrangementLabel(f.arrangement)}` : f.arrangement === 'remote' ? 'Remote' : '', missing: !f.location && f.arrangement !== 'remote' },
    { key: 'type', label: 'Job type', value: typeLabel(f), missing: !f.contract && f.engagement === 'job' },
    { key: 'grade', label: 'Grade or band', value: f.grade },
    { key: 'closes', label: 'Closing date', value: f.deadline ? `${longDate(f.deadline)}${f.closingTime ? `, ${f.closingTime}` : ''}` : '', missing: !f.deadline },
    { key: 'salary', label: 'Salary', value: salaryText(f) || 'Not shown' },
    { key: 'more', label: 'More details', value: more, hint: 'Who can apply, languages, positions, donor' },
  ];
  return (
    <ul className="ej-fact-rows">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="aj-muted">{r.label}</span>
          <span className={r.value || r.missing ? 'min-w-0' : 'aj-faint min-w-0'} data-missing={r.missing || undefined}>
            {r.value || (r.missing ? 'To add' : (r.hint ?? 'None'))}
          </span>
          <button
            type="button"
            className="aj-pill"
            style={{ height: 30 }}
            disabled={ro}
            aria-label={`${r.value ? 'Change' : 'Add'} ${r.label.toLowerCase()}`}
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

/** A part's own fields, in the panel above the job description, so it can be set without the chat. */
function PartFields({ part, job, s, onClose, onFact, onPreview }: { part: string; job: DemoJob; s: State; onClose: () => void; onFact: (k: FactKey) => void; onPreview: () => void }) {
  const amplify = Boolean(job.paidFor) || !canGoFree(s, job.id, null);
  const points = job.sections.length ? openPoints(job, s, amplify) : [];
  const reviewable = isReviewable(job);
  const head: Record<string, [string, string]> = {
    outline: ['JD outline', 'The JD format, and the sections in their order'],
    details: ['Details', 'The facts the job description and Google use'],
    fixed: ['Fixed text', "Your organisation's commitments, word for word"],
    check: ['Check', 'Clarity, inclusive language, placeholders, and dates'],
    publish: ['Publish', statusLine(s, job)],
    's:apply': ['How to apply', 'The section below is written from these'],
  };
  const [title, hint] = head[part] ?? ['', ''];
  let body: ReactNode = null;
  if (part === 'outline') body = <Structure job={job} s={s} bare hideCommitments />;
  else if (part === 'details') body = <FactRows job={job} s={s} onFact={onFact} />;
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
        <p className="aj-muted m-0">For now, the market check, the full advert check, and language versions are on the Check and publish page.</p>
        {reviewable && (
          <button type="button" className="aj-pill self-start" onClick={() => go('publish', job.id)}>
            {OPEN_PUBLISH}
          </button>
        )}
      </div>
    );
  else if (part === 'publish')
    body = reviewable ? (
      <div className="flex flex-col gap-2">
        <p className="aj-muted m-0">For now, Free or Amplify, payment, and publishing are on the Check and publish page, and review is in the earlier workspace.</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="aj-ink-btn" onClick={() => go('publish', job.id)}>
            Check and publish
          </button>
          <button type="button" className="aj-pill" onClick={onPreview}>
            Preview
          </button>
          <button type="button" className="aj-text-btn" onClick={() => go('create', job.id)}>
            Review, in the earlier workspace
          </button>
        </div>
      </div>
    ) : (
      <button type="button" className="aj-pill self-start" onClick={() => go('jobs', job.id)}>
        Open it in Manage jobs
      </button>
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

/** The guide: the whole conversation, answers inside the questions, and the box, with the part in view as its subject. */
function WindowChat({ job, s, reading, subject, onSend, onSkip, autoFocus }: { job: DemoJob; s: State; reading: boolean; subject: string; onSend: (text: string) => void; onSkip: () => void; autoFocus: boolean }) {
  const [text, setText] = useState('');
  const box = useRef<ComposerHandle>(null);
  const end = useRef<HTMLDivElement>(null);
  const firstUser = job.chat.findIndex((m) => m.from === 'user');
  const shown = reading ? job.chat.slice(0, firstUser + 1) : job.chat;
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [shown.length]);
  const reviewing = Boolean(s.reviewerAs);
  const lastUser = shown.map((m) => m.from).lastIndexOf('user');
  const last = shown[shown.length - 1];
  const own = [...s.jobs.map((j) => j.facts.title).filter(Boolean), ...s.org.countries.flatMap((c) => PLACES.filter((p) => p.country === c).map((p) => `${p.city}, ${p.country}`))];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <button type="button" className="aj-pill sr-only focus:not-sr-only focus:m-2" onClick={onSkip}>
        Skip to the job description
      </button>
      <div className="aj-scroll flex min-h-0 flex-1 flex-col gap-2 px-4 py-3" role="log" aria-label="Conversation with AidJobs" aria-live="polite">
        {shown.length === 0 && !reviewing && <p className="aj-faint m-0">Ask AidJobs for any change to the job description, or open a part above it.</p>}
        {shown.map((m, i) => (
          <div key={m.id} className="ej-bubble" data-from={m.from}>
            {rich(m.text)}
            {m.from === 'ai' && m.quick && m.quick.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.quick.map((q) => (
                  <button key={q} type="button" className="aj-pill" style={{ height: 30 }} disabled={i < lastUser || reviewing} onClick={() => onSend(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            {m.from === 'ai' && m === last && m.ask && !reviewing && <AskAnswer job={job} s={s} kind={m.ask} onAnswered={() => setTimeout(() => box.current?.focus(), 0)} />}
          </div>
        ))}
        {reading && (
          <div className="ej-bubble ej-reading" data-from="ai" role="status">
            Reading your role…
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="shrink-0 border-t px-3 py-2.5 aj-hair">
        {reviewing ? (
          <div className="flex flex-col gap-2">
            <span className="aj-muted">You are looking as a reviewer. For now, comments and approval are in the earlier workspace.</span>
            <button type="button" className="aj-pill self-start" onClick={() => go('create', job.id)}>
              {OPEN_EARLIER}
            </button>
          </div>
        ) : (
          <>
            <div className="ej-subject" aria-live="polite">
              About: <strong>{subject}</strong>
            </div>
            <Composer
              ref={box}
              value={text}
              onChange={setText}
              onSend={(v) => {
                onSend(v);
                setText('');
              }}
              suggestion={completeText(text, own)}
              placeholder={last?.ask ? 'Answer here, or pick above' : `Ask about ${subject}, or anything else`}
              label="Message AidJobs about this job"
              compact
              autoFocus={autoFocus}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Creating a job in one window (employer-side plan, section 19): the chat guides and does the work; the output panel shows the result,
 * with the progress line above it as the way around; each part's fields open in the panel, so nothing depends on the chat alone.
 */
export default function Window({ id }: { id?: string }) {
  const s = useDemo();
  const phone = useIsPhone();
  const job = id ? s.jobs.find((j) => j.id === id) : undefined;
  const [reading, setReading] = useState(() => readingNow(id));
  const [view, setView] = useState<'chat' | 'job'>('chat');
  const [tab, setTab] = useState('doc');
  const [preview, setPreview] = useState(false);
  const [hidden, setHidden] = useState<string | null>(null);
  const [fact, setFact] = useState<FactKey | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const [said, setSaid] = useState('');
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

  useEffect(() => {
    if (!reading) return;
    try {
      localStorage.removeItem(READING_KEY);
    } catch {
      /* storage unavailable */
    }
    const t = setTimeout(() => setReading(false), 900);
    return () => clearTimeout(t);
  }, [reading]);

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

  if (!job) {
    return (
      <div className="mx-auto max-w-[560px] p-6">
        <p className="aj-muted">This job is not in the demo any more.</p>
        <button type="button" className="aj-ink-btn" onClick={() => go('create')}>
          Create a job
        </button>
      </div>
    );
  }

  const reviewing = Boolean(s.reviewerAs);
  const parts = partsOf(job, s);
  const current = currentPart(job, s, parts);
  const currentLabel = parts.find((p) => p.key === current)?.label ?? 'the job';
  const focus = sectionOf(current);
  const langs = LANGS.filter((l) => job.translations?.[l.key]);
  const tabs: TabDef[] = [{ key: 'doc', label: 'Job description' }, ...langs.map((l) => ({ key: `lang:${l.key}`, label: l.native, lang: l.key })), ...(preview ? [{ key: 'preview', label: 'Preview' }] : [])];
  const active = tabs.some((t) => t.key === tab) ? tab : 'doc';
  const card = !reviewing && hasFields(current) && hidden !== current;

  const goPart = (key: string) => {
    settleAsk(job.id);
    setPart(job.id, key);
    setTab('doc');
    setHidden(null);
    setPartsOpen(false);
    if (phone) setView('job');
    const sec = sectionOf(key);
    scrollToId(sec && key !== 's:apply' ? `ej-sec-${sec}` : 'ej-part-card');
  };
  const openPreview = () => {
    setPreview(true);
    setTab('preview');
    if (phone) setView('job');
  };
  const toJob = () => {
    setTab('doc');
    if (phone) setView('job');
    requestAnimationFrame(() => document.getElementById('ej-w-panel')?.focus());
  };
  const send = (text: string) => {
    const t = text.toLowerCase().trim();
    if (t === OPEN_PUBLISH.toLowerCase()) return go('publish', job.id);
    if (t === OPEN_EARLIER.toLowerCase()) return go('create', job.id);
    if (PREVIEW.test(t)) {
      openPreview();
      return chatNote(job.id, text, 'The preview is open in the panel: the job page, how it shows in Google, and how it looks when shared.');
    }
    if (VERSIONS.test(t)) {
      if (job.versions.length) setVersionsOpen(true);
      return chatNote(job.id, text, job.versions.length ? 'Earlier versions are open: pick one to see it or go back to it.' : 'There are no earlier versions yet.');
    }
    if (DOWNLOAD.test(t)) {
      if (job.sections.length) downloadCopy(job, s.org.name);
      return chatNote(job.id, text, job.sections.length ? 'Downloaded a copy of the job description.' : 'There is no job description to download yet.');
    }
    if (DELETE.test(t)) {
      const no = canDelete(s, job);
      if (!no) setDeleteOpen(true);
      return chatNote(job.id, text, no ? `${no}.` : 'Confirm in the dialog: it lists what is deleted and what is kept.');
    }
    if (PUBLISH.test(t)) return chatNote(job.id, text, 'For now, publishing is on the Check and publish page.', isReviewable(job) ? [OPEN_PUBLISH] : undefined);
    if (REVIEW.test(t)) return chatNote(job.id, text, 'For now, review is in the earlier workspace, in its Review panel.', [OPEN_EARLIER]);
    sendChat(job.id, text, focus ?? undefined);
  };

  const fields = card && (
    <PartFields part={current} job={job} s={s} onClose={() => setHidden(current)} onFact={setFact} onPreview={openPreview} />
  );
  const doc = (
    <div className="flex flex-col gap-3">
      {fields}
      {job.status === 'live' && changesSince(job).length > 0 && (
        <div className="aj-card px-3 py-2" role="status" aria-label="Changed since publishing">
          <strong>Changed since publishing:</strong> <span className="aj-muted">{changeSummary(changesSince(job))}</span>
        </div>
      )}
      {reading ? (
        <div className="aj-card ej-reading flex items-center gap-2 p-5 aj-muted" aria-hidden>
          <FileText size={18} strokeWidth={1.5} /> Reading your role…
        </div>
      ) : job.sections.length ? (
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
  const lang = active.startsWith('lang:') ? (active.slice(5) as Lang) : null;
  const panel = (
    <div id="ej-w-panel" className="aj-scroll min-h-0 flex-1 px-3 py-3 lg:px-5" role="tabpanel" aria-labelledby={`ej-wtab-${active}`} tabIndex={-1}>
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
      ) : (
        doc
      )}
    </div>
  );
  const tools = (
    <span className="flex shrink-0 items-center gap-1">
      {!preview && (
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
  const chat = <WindowChat job={job} s={s} reading={reading} subject={currentLabel} onSend={send} onSkip={toJob} autoFocus={!phone} />;
  const head = (
    <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 aj-hair lg:px-4">
      <Tip label="Back" side="bottom">
        <button type="button" className="aj-icon-btn" onClick={() => goBack('create')} aria-label="Back">
          <ArrowLeft size={15} strokeWidth={1.8} />
        </button>
      </Tip>
      <span className="flex min-w-0 flex-1 flex-col">
        <h1 className="ej-w-title">{job.facts.title || 'Untitled job'}</h1>
        <span className="aj-faint truncate" style={{ fontSize: 11 }}>
          {statusLine(s, job)}
        </span>
      </span>
      {phone ? (
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
      ) : (
        <Tip label="The workspace before this round, kept until this window has everything" side="bottom">
          <button type="button" className="aj-text-btn" style={{ height: 30 }} onClick={() => go('create', job.id)}>
            Earlier workspace
          </button>
        </Tip>
      )}
    </div>
  );
  const overlays = (
    <>
      <div className="sr-only" aria-live="polite">
        {said}
      </div>
      {fact && (
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
    </>
  );

  if (phone) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {head}
        {view === 'chat' ? (
          <div className="min-h-0 flex-1">{chat}</div>
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
        {overlays}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {head}
      <div className="flex min-h-0 flex-1">
        <section className="ej-w-chat flex min-h-0 flex-col border-r aj-hair" aria-label="Chat with AidJobs">
          {chat}
        </section>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="The job">
          <div className="flex shrink-0 items-center gap-2 border-b px-3 aj-hair">
            <ProgressLine parts={parts} current={current} onGo={goPart} />
          </div>
          <div className="flex shrink-0 items-end gap-2 border-b pe-3 aj-hair">
            <PanelTabs tabs={tabs} active={active} onPick={setTab} />
            <span className="ml-auto pb-1">{tools}</span>
          </div>
          {panel}
        </section>
      </div>
      {overlays}
    </div>
  );
}
