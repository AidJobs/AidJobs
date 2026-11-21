'use client';

import { AlertCircle, Check, CheckCircle2, ChevronUp, Info, Lock, MessageSquare, Pencil, Plus, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Tip from '@/components/site/Tip';
import { addRemark, alsoIn, answerFact, approveSection, bringBackFixed, changeSub, changedSinceLastRound, editSection, formatOf, groupingOf, markGenuine, outlineOp, sendChat, setApply, setFacts, setMethod, settleRemark, subId, undoLastChange, undoStep, versionOp } from './actions';
import type { OpenTarget } from './aiActions';
import Grip, { dropAt, type GripAction } from './Grip';
import FixedBlock from './FixedBlock';
import { fixedLabel, fixedList, offeredFixed } from './fixed';
import { PageFillTools } from './ContextCards';
import { viewOf } from './langs';
import { jobLang, langOf } from './translate';
import { placeFor } from './MenuButton';
import { groupLabelOf, groupOfKey, groupOrderOf, KEPT, placeSaid } from './outline';
import { contractPicks, deadlinePicks, eligibilityPicks, gradePicks, languagePicks, methodPicks, placePatch, placePicks, salaryPicks, safeguardingPicks, type Pick } from './answers';
import { DOCUMENTS } from './apply';
import { PROJECT_SECTION, saveAboutForOrg, savePageFieldText } from './context';
import Composer, { type ComposerHandle } from './Composer';
import { addDays, commitmentText, COMMITMENTS, completeText, findInclusive, GROUPS, headingFor, inOutlineOrder, longDate, looseLocation, PLACES, quality, recommendSections, SECTIONS, suggestTitle, titleSuggestions, type QualityItem } from './engine';
import { MAX_TEXT } from './pages';
import type { ApplySettings, ChatMsg, DemoJob, Facts, GroupKey, JobLang, Section as Sec, State } from './types';
import { RevealBlock } from './Reveal';
import { getState } from './store';
import { Dialog, Field, inputStyle, scrollInside } from './ui';

/**
 * Hide only the “Removed …” note after ~2s (polish `3f0f4c4`). Does not call `dismissChange`, so `undoStep` stays for chat Undo and
 * Earlier versions until the next outline change (R1-05). Edit / StepNote stays until Undo.
 */
export function useRemovedNoteHidden(removedKey: string | undefined): boolean {
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  useEffect(() => {
    if (!removedKey) {
      setHiddenFor(null);
      return;
    }
    setHiddenFor(null);
    const t = window.setTimeout(() => setHiddenFor(removedKey), 2000);
    return () => clearTimeout(t);
  }, [removedKey]);
  return Boolean(removedKey && hiddenFor === removedKey);
}

export function rich(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

type Flag = { key: string; why: string; alt: string; source: string; match: string; section: string };

/** One line of text with inclusive-language highlights. Highlight only: the user decides (3 November 2026). */
function MarkedText({ text, job, section, onFlag }: { text: string; job: DemoJob; section: string; onFlag: (f: Flag) => void }) {
  const hits = findInclusive(text, job.format).filter((h) => !job.genuine[`${h.rule.id}:${section}:${h.match.toLowerCase()}`]);
  if (!hits.length) return <>{text}</>;
  const reviewing = Boolean(getState().reviewerAs);
  const out: ReactNode[] = [];
  let at = 0;
  hits.forEach((h, i) => {
    if (h.index > at) out.push(<Fragment key={`t${i}`}>{text.slice(at, h.index)}</Fragment>);
    const flag: Flag = { key: `${h.rule.id}:${section}:${h.match.toLowerCase()}`, why: h.rule.why, alt: h.rule.alt, source: h.rule.source, match: h.match, section };
    out.push(
      <Tip key={`m${i}`} label={`${h.rule.why} Possible alternative: ${h.rule.alt}. (${h.rule.source})`}>
        {reviewing ? (
          <span className="ej-mark" tabIndex={0} aria-label={`"${h.match}" highlighted: ${h.rule.why}`}>
            {h.match}
          </span>
        ) : (
          <button type="button" className="ej-mark" onClick={() => onFlag(flag)} aria-label={`"${h.match}" highlighted: ${h.rule.why}`}>
            {h.match}
          </button>
        )}
      </Tip>,
    );
    at = h.index + h.match.length;
  });
  if (at < text.length) out.push(<Fragment key="end">{text.slice(at)}</Fragment>);
  return <>{out}</>;
}

const SLOTS: Record<string, 'place' | 'closes'> = { 'Duty station': 'place', 'Closing date': 'closes' };

/** Text with clickable placeholders for missing facts ("[Closing date]"); each opens the fact's editor. */
function SlotText({ text, job, section, onFlag }: { text: string; job: DemoJob; section: string; onFlag: (f: Flag) => void }) {
  const parts = text.split(/\[(Duty station|Closing date)\]/);
  if (parts.length === 1) return <MarkedText text={text} job={job} section={section} onFlag={onFlag} />;
  const reviewing = Boolean(getState().reviewerAs);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 && reviewing ? (
          <span key={i} className="ej-slot">{part}</span>
        ) : i % 2 ? (
          <Tip key={i} label={`Missing: ${part.toLowerCase()}. Click to add it.`}>
            <button type="button" className="ej-slot" onClick={() => window.dispatchEvent(new CustomEvent('ej-open-fact', { detail: SLOTS[part] }))}>
              {part}
            </button>
          </Tip>
        ) : (
          <MarkedText key={i} text={part} job={job} section={section} onFlag={onFlag} />
        ),
      )}
    </>
  );
}

function Lines({ lines, job, section, onFlag }: { lines: string[]; job: DemoJob; section: string; onFlag: (f: Flag) => void }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: string) => {
    if (list.length) {
      blocks.push(
        <ul key={`u${k}`}>
          {list.map((l, i) => (
            <li key={i}>
              <SlotText text={l} job={job} section={section} onFlag={onFlag} />
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((l, i) => {
    if (l.startsWith('- ')) list.push(l.slice(2));
    else {
      flush(String(i));
      blocks.push(
        /:$/.test(l) && l.length < 40 ? (
          <p key={i} className="ej-sub">
            {l}
          </p>
        ) : (
          <p key={i}>
            <SlotText text={l} job={job} section={section} onFlag={onFlag} />
          </p>
        ),
      );
    }
  });
  flush('end');
  return <>{blocks}</>;
}

function ApplyDialog({ job, onClose }: { job: DemoJob; onClose: () => void }) {
  return (
    <Dialog title="How to apply" subtitle="Writes the section for you" onClose={onClose} wide footer={<div className="flex justify-end"><button type="button" className="aj-ink-btn" onClick={onClose}>Done</button></div>}>
      <ApplyFields job={job} />
    </Dialog>
  );
}

/** How to apply: method, documents, and process; the section is written from them. */
export function ApplyFields({ job }: { job: DemoJob }) {
  const a = job.apply;
  const set = (p: Partial<ApplySettings>) => setApply(job.id, p);
  const toggleDoc = (d: string) => set({ documents: a.documents.includes(d) ? a.documents.filter((x) => x !== d) : [...a.documents, d] });
  return (
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Method">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['system', 'Careers site'],
                ['email', 'By email'],
                ['form', 'Online form'],
                ['formOnly', 'Form only, no CVs'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" className="aj-pill" data-active={a.method === k} onClick={() => set({ method: k })}>
                {l}
              </button>
            ))}
          </div>
        </Field>
        <Field label={a.method === 'email' ? 'Email address' : 'Link'}>
          <input style={inputStyle} value={a.address} onChange={(e) => set({ address: e.target.value })} placeholder={a.method === 'email' ? 'jobs@example.org' : 'https://…'} />
        </Field>
        <Field label="Documents">
          <div className="flex flex-wrap gap-1.5">
            {DOCUMENTS.map((d) => (
              <button key={d} type="button" className="ej-tag" data-on={a.documents.includes(d)} onClick={() => toggleDoc(d)} aria-pressed={a.documents.includes(d)}>
                {d}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="CV pages">
            <input style={inputStyle} value={a.cvPages} onChange={(e) => set({ cvPages: e.target.value })} placeholder="e.g. 3" />
          </Field>
          <Field label="Statement words">
            <input style={inputStyle} value={a.statementWords} onChange={(e) => set({ statementWords: e.target.value })} placeholder="e.g. 500" />
          </Field>
          <Field label="References">
            <input style={inputStyle} value={a.references} onChange={(e) => set({ references: e.target.value })} placeholder="e.g. 3" />
          </Field>
        </div>
        {a.method === 'email' && (
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={a.subjectLine} onChange={(e) => set({ subjectLine: e.target.checked })} /> Job title as the email subject
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={a.onePdf} onChange={(e) => set({ onePdf: e.target.checked })} /> Everything in one PDF
            </label>
            <input style={inputStyle} value={a.maxMb} onChange={(e) => set({ maxMb: e.target.value })} placeholder="Attachment limit in MB" aria-label="Attachment limit in MB" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={a.rolling} onChange={(e) => set({ rolling: e.target.checked })} /> Reviewed as they arrive
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={a.earlyClose} onChange={(e) => set({ earlyClose: e.target.checked })} /> May close early
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={a.shortlistedOnly} onChange={(e) => set({ shortlistedOnly: e.target.checked })} /> Only shortlisted candidates contacted
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={a.anonymised} onChange={(e) => set({ anonymised: e.target.checked })} /> Anonymised CVs
          </label>
        </div>
        <Field label="Interview dates (optional)">
          <input style={inputStyle} value={a.interviewDates} onChange={(e) => set({ interviewDates: e.target.value })} placeholder="e.g. the week of 7 December" />
        </Field>
        <Field label="Reply within, weeks (optional)">
          <input style={inputStyle} value={a.replyWeeks} onChange={(e) => set({ replyWeeks: e.target.value })} placeholder="e.g. 2" />
        </Field>
      </div>
  );
}

type SectionProps = { job: DemoJob; sec: Sec; s: State; notes: QualityItem[]; onFlag: (f: Flag) => void; onSeeChat?: () => void; current?: boolean; noteEdits?: boolean; since?: number; draft?: DraftTools };

/** What the window's draft gives each section (section 19, phase 6, C): its grip's moves and the + panel opened from it. */
type DraftTools = { grip: (sec: Sec) => GripAction[]; onKey: (key: string, by: -1 | 1) => void; onDrag: (key: string, y: number | null, done: boolean) => void; dropAfter: string | null | undefined };

/**
 * The change note for the last change made with the icons, with its Undo; while a linked translation is written, Undo waits. After a
 * change the other languages do not follow, it offers them once, quietly: "Also in French · Arabic".
 */
export function StepNote({ job, onSeeChat }: { job: DemoJob; onSeeChat?: () => void }) {
  const st = job.undoStep;
  if (!st) return null;
  return (
    <div className="ej-change-note" role="status">
      <Check size={12} strokeWidth={2.4} className="shrink-0" />
      <span className="ej-change-text">
        {st.text}
        {st.settings ? '. Organisation settings changed too; Undo leaves them' : ''}
        {st.writing ? '. Writing the linked languages…' : ''}
        {st.also && (
          <span className="ej-also">
            . Also in{' '}
            {st.also.langs.map((l, i) => (
              <Fragment key={l}>
                {i > 0 && <span aria-hidden> · </span>}
                <Tip label={`Make the same change in ${langOf(l).label}`}>
                  <button type="button" className="aj-text-btn ej-also-btn" onClick={() => alsoIn(job.id, [l])}>
                    {langOf(l).label}
                  </button>
                </Tip>
              </Fragment>
            ))}
          </span>
        )}
      </span>
      <span className="ej-change-actions">
        <Tip label={st.writing ? 'Waits until the linked translation is written' : 'Put it back as it was, in every language'}>
          <button type="button" className="aj-text-btn" style={{ height: 24 }} onClick={() => undoStep(job.id)} aria-disabled={st.writing || undefined}>
            Undo
          </button>
        </Tip>
        {onSeeChat && (
          <button type="button" className="aj-text-btn" style={{ height: 24 }} onClick={onSeeChat}>
            See in chat
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * A section's text revealed as it is written (section 19, phase 5, E): when the AI or the rules stored new text for it after the window
 * opened (the latest version changed it), not when it was edited by hand. Its rich view (marks, placeholders) shows once it is all there.
 */
function SectionText({ job, sec, since, children }: { job: DemoJob; sec: Sec; since?: number; children: ReactNode }) {
  const v = job.versions[job.versions.length - 1];
  const before = job.versions[job.versions.length - 2]?.sections.find((x) => x.key === sec.key);
  const fresh = Boolean(since && v && v.at >= since && !sec.edited && JSON.stringify(before?.lines) !== JSON.stringify(sec.lines));
  const id = `${job.id}:${sec.key}:${v?.n ?? 0}`;
  return (
    <RevealBlock key={id} id={id} active={fresh}>
      {children}
    </RevealBlock>
  );
}

const asText = (lines: string[]) => lines.map((l) => (l.startsWith('- ') ? `• ${l.slice(2)}` : l)).join('\n');

const PROJECT_SUB = 'About the project';

/** Text shown in the open About the project editor: the project sub when present, else the section lines. */
function projectBoxText(sec: Sec): string {
  const sub = sec.subs?.find((sb) => sb.title === PROJECT_SUB);
  if (sub) return asText(sub.lines);
  return asText(sec.lines);
}

function sectionStartsEmpty(sec: Sec, pageKind: 'about' | 'project' | null): boolean {
  if (!pageKind) return false;
  if (pageKind === 'about') return sec.lines.length === 0;
  const sub = sec.subs?.find((sb) => sb.title === PROJECT_SUB);
  if (sub) return sub.lines.length === 0;
  return sec.lines.length === 0;
}

function SectionView({ job, sec, s, notes, onFlag, onSeeChat, current, noteEdits, since, draft }: SectionProps) {
  const reviewing = Boolean(s.reviewerAs);
  const pageKind = sec.key === 'about' ? 'about' : sec.key === PROJECT_SECTION ? 'project' : null;
  const [editing, setEditing] = useState(() => !reviewing && sectionStartsEmpty(sec, pageKind));
  const [text, setText] = useState(() => (!reviewing && pageKind === 'project' ? projectBoxText(sec) : !reviewing && pageKind === 'about' ? asText(sec.lines) : ''));
  const [title, setTitle] = useState(() => (!reviewing && pageKind ? sec.title : ''));
  const [subs, setSubs] = useState<Array<{ id: string; title: string; text: string }>>([]);
  const others = editing ? titleSuggestions(s.formats, sec.key, title) : [];
  const startEdit = () => {
    setText(pageKind === 'project' ? projectBoxText(sec) : asText(sec.lines));
    setTitle(sec.title);
    setSubs(pageKind === 'project' ? [] : (sec.subs ?? []).map((sb) => ({ id: sb.id, title: sb.title, text: asText(sb.lines) })));
    setEditing(true);
  };
  const [remark, setRemark] = useState<'comment' | 'suggestion' | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [suggestText, setSuggestText] = useState('');
  const [applyOpen, setApplyOpen] = useState(false);
  const remarks = job.review.remarks.filter((r) => r.section === sec.key && r.state === 'open');
  const changed = Boolean(job.lastChange?.keys.includes(sec.key)) || Boolean(job.undoStep?.tab === 'doc' && job.undoStep.keys?.[0] === sec.key);
  const sinceLastRound = reviewing && changedSinceLastRound(job).includes(sec.key);
  // One header row: heading, Approve, Undo, pencil, grip. About us / Project helpers live inside the open editor (like other sections).
  const icons = Boolean(draft) && !reviewing;
  const editTip = `Edit ${sec.title}${sec.key === 'apply' ? ': its text and how people apply' : ''}${sec.edited ? ' · Edited by you' : ''}`;
  const noteText = changed && !reviewing ? (job.lastChange?.text ?? (job.undoStep && !job.undoStep.removed ? job.undoStep.text : undefined)) : undefined;
  return (
    <section id={`ej-sec-${sec.key}`} className="ej-dsec rounded-2xl px-3 py-2" data-changed={changed} data-review-changed={sinceLastRound} data-current={current || undefined} data-drop-key={draft ? sec.key : undefined} data-drop-group={draft ? groupOfKey(groupingOf(job), sec.key) : undefined} data-drop={draft && draft.dropAfter === sec.key ? 'after' : undefined} aria-label={sec.title} style={{ scrollMarginTop: 12 }}>
      <div className="ej-sec-head flex items-center gap-2">
        <h3 className="ej-sec-title">{sec.title}</h3>
        {sinceLastRound && (
          <span className="aj-chip" data-tone="amber">
            Changed since round {job.review.round - 1}
          </span>
        )}
        {!draft && sec.edited && <span className="aj-chip">Your text</span>}
        {job.walk && !job.setup && !reviewing && !editing && sec.lines.length > 0 && !job.walk.approved.includes(sec.key) && (
          <button type="button" className="aj-pill" style={{ height: 28 }} onClick={() => approveSection(job.id, sec.key)} aria-label={`Approve ${sec.title}`}>
            <Check size={12} strokeWidth={2} aria-hidden /> Approve
          </button>
        )}
        {/* R2-P0-5 / R1-19: after Approve, keep a quiet mark so the section does not look untouched. */}
        {job.walk && !job.setup && !reviewing && !editing && sec.lines.length > 0 && job.walk.approved.includes(sec.key) && (
          <span className="aj-chip" aria-label={`${sec.title} approved`}>
            <Check size={11} strokeWidth={2} aria-hidden /> Approved
          </span>
        )}
        {noteText && (
          <>
            <span className="ej-change-text" title={noteText}>
              {noteText}
              {job.undoStep?.also && !job.lastChange && (
                <span className="ej-also">
                  . Also in{' '}
                  {job.undoStep.also.langs.map((l, i) => (
                    <Fragment key={l}>
                      {i > 0 && <span aria-hidden> · </span>}
                      <Tip label={`Make the same change in ${langOf(l).label}`}>
                        <button type="button" className="aj-text-btn ej-also-btn" onClick={() => alsoIn(job.id, [l])}>
                          {langOf(l).label}
                        </button>
                      </Tip>
                    </Fragment>
                  ))}
                </span>
              )}
            </span>
            <Tip label={job.undoStep?.writing ? 'Waits until the linked translation is written' : 'Put it back as it was'}>
              <button
                type="button"
                className="aj-text-btn"
                style={{ height: 28 }}
                onClick={() => (job.lastChange ? undoLastChange(job.id) : undoStep(job.id))}
                aria-disabled={job.undoStep?.writing || undefined}
              >
                Undo
              </button>
            </Tip>
            {onSeeChat && (
              <button type="button" className="aj-text-btn" style={{ height: 28 }} onClick={onSeeChat}>
                See in chat
              </button>
            )}
          </>
        )}
        {!draft && !reviewing && sec.key === 'about' && s.me.role === 'owner' && sec.lines.length > 0 && sec.lines.join('\n').trim() !== s.org.about.trim() && (
          <Tip label="Each new job's About us starts from it; jobs already written keep theirs">
            <button type="button" className="aj-text-btn" style={{ height: 28 }} onClick={() => saveAboutForOrg(job.id)}>
              Save as our About us
            </button>
          </Tip>
        )}
        {!draft && !reviewing && sec.key === 'apply' && (
          <Tip label="Set up how to apply">
            <button type="button" className="aj-icon-btn" style={{ width: 28, height: 28 }} onClick={() => setApplyOpen(true)} aria-label="Set up how to apply">
              <Settings2 size={13} strokeWidth={1.8} />
            </button>
          </Tip>
        )}
        {!reviewing && !editing && (
          <span className={icons ? 'ej-sec-tools' : 'contents'}>
            <Tip label={icons ? editTip : `Edit ${sec.title}`}>
              <button type="button" className={icons ? 'ej-sec-icon' : 'aj-icon-btn'} style={icons ? undefined : { width: 28, height: 28 }} onClick={startEdit} aria-label={`Edit ${sec.title}`}>
                <Pencil size={13} strokeWidth={1.8} />
              </button>
            </Tip>
            {icons && draft && (
              <Grip
                gripKey={sec.key}
                className="ej-grip ej-sec-icon"
                label={`Move ${sec.title}, or press for its menu`}
                tip="Drag to move, or press for more"
                actions={draft.grip(sec)}
                onKey={(by) => draft.onKey(sec.key, by)}
                onDrag={(y) => draft.onDrag(sec.key, y, false)}
                onDrop={(y) => draft.onDrag(sec.key, y, true)}
              />
            )}
          </span>
        )}
        {reviewing && (
          <>
            <button type="button" className="aj-pill" style={{ height: 28 }} onClick={() => setRemark('comment')}>
              <MessageSquare size={12} strokeWidth={1.8} /> Comment
            </button>
            <button type="button" className="aj-pill" style={{ height: 28 }} onClick={() => setRemark('suggestion')}>
              <Pencil size={12} strokeWidth={1.8} /> Suggest
            </button>
          </>
        )}
      </div>
      {notes.map((n) => (
        <div key={n.key} className="ej-check mb-1" style={{ color: 'var(--amber)' }}>
          <AlertCircle size={12} strokeWidth={2} /> <span style={{ color: 'var(--text-2)' }}>{n.text.replace(`${sec.title}: `, '')}</span>
        </div>
      ))}
      {editing ? (
        <div className="flex flex-col gap-2">
          {draft && sec.key === 'apply' && (
            <div className="flex flex-col gap-2 rounded-xl border p-3 aj-hair">
              <span className="ej-panel-label">How people apply</span>
              <ApplyFields job={job} />
            </div>
          )}
          {/* R2-P0-4: project editor writes the About the project body only; parent heading stays the format name (outline rename). */}
          {pageKind !== 'project' && (
            <>
              <label className="flex flex-col gap-1">
                <span className="aj-faint" style={{ fontSize: 11.5 }}>
                  Heading
                </span>
                <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} aria-label={`Heading of ${sec.title}`} />
              </label>
              {others.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Other titles">
                  <span className="aj-faint" style={{ fontSize: 11.5 }}>
                    Other titles:
                  </span>
                  {others.map((t) => (
                    <button key={t} type="button" className="aj-pill" style={{ height: 26 }} onClick={() => setTitle(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {pageKind && <PageFillTools kind={pageKind} website={s.org.website} text={text} onText={(t) => setText(t.slice(0, MAX_TEXT))} disabled={reviewing} />}
          <textarea style={{ ...inputStyle, minHeight: 140, lineHeight: 1.6 }} value={text} onChange={(e) => setText(e.target.value)} aria-label={`${sec.title} text`} autoFocus placeholder={pageKind ? `Write ${sec.title} here` : undefined} />
          {!pageKind &&
            subs.map((sb, i) => (
              <div key={sb.id} className="flex flex-col gap-1 rounded-xl border p-2 aj-hair">
                <div className="flex items-center gap-1">
                  <input style={{ ...inputStyle, fontWeight: 650, flex: 1 }} value={sb.title} onChange={(e) => setSubs(subs.map((x) => (x.id === sb.id ? { ...x, title: e.target.value } : x)))} aria-label={`Heading ${i + 1} inside ${sec.title}`} placeholder="Heading" />
                  <Tip label="Move this heading up">
                    <button type="button" className="aj-icon-btn" style={{ width: 28, height: 28 }} disabled={i === 0} onClick={() => setSubs(swap(subs, i, i - 1))} aria-label={`Move ${sb.title || 'this heading'} up`}>
                      <ChevronUp size={13} strokeWidth={2} />
                    </button>
                  </Tip>
                  <Tip label="Remove this heading and its text">
                    <button type="button" className="aj-icon-btn" style={{ width: 28, height: 28 }} onClick={() => setSubs(subs.filter((x) => x.id !== sb.id))} aria-label={`Remove ${sb.title || 'this heading'}`}>
                      <X size={13} strokeWidth={2} />
                    </button>
                  </Tip>
                </div>
                <textarea style={{ ...inputStyle, minHeight: 80, lineHeight: 1.6 }} value={sb.text} onChange={(e) => setSubs(subs.map((x) => (x.id === sb.id ? { ...x, text: e.target.value } : x)))} aria-label={`${sb.title || 'Heading'} text`} />
              </div>
            ))}
          {!pageKind && (
            <button type="button" className="aj-text-btn self-start" style={{ height: 28, paddingInline: 0 }} onClick={() => setSubs([...subs, { id: subId(), title: '', text: '' }])} aria-label="Add a sub-section heading inside this section">
              <Plus size={12} strokeWidth={2} aria-hidden /> Add a heading inside this section
            </button>
          )}
          <div className="flex gap-1.5">
            <button
              type="button"
              className="aj-ink-btn"
              onClick={() => {
                if (pageKind === 'project') {
                  if (text.trim()) savePageFieldText(job.id, 'project', text);
                  setEditing(false);
                  return;
                }
                if (pageKind === 'about') {
                  editSection(job.id, sec.key, text, noteEdits, { title });
                  setEditing(false);
                  return;
                }
                editSection(job.id, sec.key, text, noteEdits, { title, subs: subs.map((x) => ({ id: x.id, title: x.title, text: x.text })) });
                setEditing(false);
              }}
            >
              Save
            </button>
            <button type="button" className="aj-pill" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        // Reading view only (like other sections). About us / Project open with the pencil: helpers + one box + Save/Cancel.
        <SectionText job={job} sec={sec} since={since}>
          <Lines lines={sec.lines} job={job} section={sec.key} onFlag={onFlag} />
          {sec.subs?.map((sb) => (
            <div key={sb.id} className="ej-subsection">
              <h4>{sb.title}</h4>
              <Lines lines={sb.lines} job={job} section={sec.key} onFlag={onFlag} />
            </div>
          ))}
        </SectionText>
      )}
      {remarks.map((r) => (
        <div key={r.id} className="mt-1 flex flex-col gap-1 rounded-xl p-2.5" style={{ background: 'var(--amber-bg)' }}>
          <div style={{ fontSize: 12 }}>
            <strong>{r.author}</strong> {r.kind === 'suggestion' ? 'suggests' : 'commented'}: {r.text}
          </div>
          {r.suggestion && <div style={{ fontSize: 12, color: 'var(--sage-8)' }}>+ {r.suggestion.replace(/^- /, '')}</div>}
          {!reviewing && (
            <div className="flex gap-1.5">
              {r.kind === 'suggestion' ? (
                <>
                  <button type="button" className="aj-pill" style={{ height: 28 }} onClick={() => settleRemark(job.id, r.id, 'accepted')}>
                    <Check size={12} strokeWidth={2} /> Accept
                  </button>
                  <button type="button" className="aj-pill" style={{ height: 28 }} onClick={() => settleRemark(job.id, r.id, 'rejected')}>
                    <X size={12} strokeWidth={2} /> Reject
                  </button>
                </>
              ) : (
                <button type="button" className="aj-pill" style={{ height: 28 }} onClick={() => settleRemark(job.id, r.id, 'resolved')}>
                  Resolve
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {remark && (
        <div className="mt-2 flex flex-col gap-2 rounded-xl border p-2.5 aj-hair">
          <textarea style={{ ...inputStyle, minHeight: 60 }} placeholder={remark === 'comment' ? 'Your comment' : 'Why this change?'} value={remarkText} onChange={(e) => setRemarkText(e.target.value)} aria-label="Comment" />
          {remark === 'suggestion' && <textarea style={{ ...inputStyle, minHeight: 60 }} placeholder="Text to add" value={suggestText} onChange={(e) => setSuggestText(e.target.value)} aria-label="Suggested text" />}
          <div className="flex gap-1.5">
            <button
              type="button"
              className="aj-ink-btn"
              disabled={!remarkText.trim()}
              onClick={() => {
                addRemark(job.id, sec.key, remark, remarkText.trim(), remark === 'suggestion' && suggestText.trim() ? `- ${suggestText.trim()}` : undefined);
                setRemark(null);
                setRemarkText('');
                setSuggestText('');
              }}
            >
              Add
            </button>
            <button type="button" className="aj-pill" onClick={() => setRemark(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {applyOpen && <ApplyDialog job={job} onClose={() => setApplyOpen(false)} />}
    </section>
  );
}

function swap<T>(list: T[], a: number, b: number): T[] {
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
function FlagDialog({ job, flag, onClose }: { job: DemoJob; flag: Flag; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog title={`"${flag.match}"`} subtitle="Your decision" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p style={{ margin: 0 }}>{flag.why}</p>
        <p className="aj-muted" style={{ margin: 0 }}>
          Possible alternative: {flag.alt}.
        </p>
        <p className="aj-faint" style={{ margin: 0, fontSize: 11 }}>
          Source: {flag.source}
        </p>
        <p className="aj-muted" style={{ margin: 0 }}>
          To change it, edit the section with the pencil. If it is a genuine requirement of the job (for example a female-only post where the context requires it, nationals only, or a licence the work needs), keep it and say why:
        </p>
        <div className="flex gap-1.5">
          <input style={{ ...inputStyle, flex: 1 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, for example: the post supports women survivors" aria-label="Reason" />
          <button
            type="button"
            className="aj-pill"
            disabled={reason.trim().length < 5}
            onClick={() => {
              markGenuine(job.id, flag.key, reason.trim());
              onClose();
            }}
          >
            Keep it
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** The job title as the job description's heading: edited in place, full width, wrapping onto more lines when long. */
export function TitleEditor({ job, disabled }: { job: DemoJob; disabled?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [typing, setTyping] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [job.facts.title]);
  const better = job.facts.title ? suggestTitle(job.facts.title) : null;
  return (
    <>
    <textarea
      ref={ref}
      id="ej-title-edit"
      className="ej-title-edit"
      rows={1}
      value={job.facts.title}
      onChange={(e) => setFacts(job.id, { title: e.target.value.replace(/\n/g, ' ') })}
      onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
      onFocus={() => setTyping(true)}
      onBlur={() => setTyping(false)}
      placeholder="Job title"
      aria-label="Job title"
      disabled={disabled}
    />
    {better && !disabled && !typing && (
      <div className="ej-spell" role="note">
        Did you mean <strong>{better}</strong>?
        <button type="button" className="aj-text-btn" style={{ height: 24 }} onClick={() => setFacts(job.id, { title: better })}>
          Use it
        </button>
      </div>
    )}
    </>
  );
}
/**
 * How the Add panel name field finishes (R1-11 Step B): Enter commits a non-empty name; Escape and blur cancel without adding.
 */
export function addNameFinish(kind: 'enter' | 'escape' | 'blur', raw: string): { action: 'commit'; name: string } | { action: 'cancel' } {
  if (kind === 'escape' || kind === 'blur') return { action: 'cancel' };
  const name = raw.trim();
  return name ? { action: 'commit', name } : { action: 'cancel' };
}

/** Name field for "Add your own" / "Add a group": Enter adds; Escape or blur abandons (does not add). */
function AddNameField({ label, onCommit, onCancel }: { label: string; onCommit: (name: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState('');
  const done = useRef(false);
  const finish = (kind: 'enter' | 'escape' | 'blur') => {
    if (done.current) return;
    done.current = true;
    const result = addNameFinish(kind, draft);
    if (result.action === 'commit') onCommit(result.name);
    else onCancel();
  };
  return (
    <input
      className="ej-ol-input"
      style={{ minWidth: 140 }}
      value={draft}
      autoFocus
      placeholder={label}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish('blur')}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish('enter');
          return;
        }
        if (e.key === 'Escape' || e.key === 'Esc') {
          // Stop the panel's Escape (which closes it) and any later blur-commit race; cancel only.
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation?.();
          finish('escape');
        }
      }}
    />
  );
}

/**
 * The + panel (section 19, phase 6, C): catalog chips by group (place of the + first), Add your own under every group
 * (same as the outline), then fixed texts left out. Catalog chips still insert at the +, Add your own names a section in that group.
 */
export function AddPanel({ job, s, at, onClose, lang }: { job: DemoJob; s: State; at: { after: string | null; anchor: HTMLElement; end: boolean }; onClose: () => void; lang?: JobLang }) {
  const box = useRef<HTMLDivElement>(null);
  const [place] = useState(() => placeFor(at.anchor, 'left', at.end));
  const [ownIn, setOwnIn] = useState<GroupKey | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const ownDone = useRef(false);
  const groupDone = useRef(false);
  const view = viewOf(job, lang);
  const g = { ...(view?.grouping ?? groupingOf(job)), customGroups: view?.customGroups ?? job.customGroups };
  const keys = view?.keys ?? job.tags;
  const here = at.after ? groupOfKey(g, at.after) : groupOrderOf(g)[0];
  const groups = [here, ...groupOrderOf(g).filter((x) => x !== here)];
  const format = formatOf(s, job.format);
  const rec = recommendSections(format, job.facts);
  const left = offeredFixed(s.org).filter((k) => !fixedList(job, lang).includes(k));
  const version = lang && lang !== jobLang(job) ? lang : undefined;
  useEffect(() => {
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true }));
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [onClose]);
  /**
   * After Add: keep the JD scroll where it was (pinning `part` can drop the fields card and yank the panel to the top),
   * then only nudge if the new section is off-screen.
   */
  const focusAdded = (key: string) => {
    const panel = document.getElementById('ej-w-panel');
    const kept = panel?.scrollTop ?? 0;
    const run = (left: number) => {
      const grip = version ? `ver:${key}` : key;
      const sec = document.getElementById(version ? `ej-ver-${key}` : `ej-sec-${key}`);
      if (!sec) {
        if (left > 0) requestAnimationFrame(() => run(left - 1));
        return;
      }
      if (panel) panel.scrollTop = kept;
      scrollInside(sec, 'nearest', false);
      document.querySelector<HTMLElement>(`[data-grip-key="${grip}"]`)?.focus({ preventScroll: true });
    };
    requestAnimationFrame(() => run(24));
  };
  const add = (key: string) => {
    const op = at.end ? ({ op: 'add', key } as const) : ({ op: 'add', key, after: at.after } as const);
    if (version) versionOp(job.id, version, op);
    else outlineOp(job.id, op);
    onClose();
    focusAdded(key);
  };
  const addOwn = (heading: string, group: GroupKey) => {
    if (ownDone.current) return;
    const name = heading.trim();
    if (!name) return;
    ownDone.current = true;
    // At the open +: keep insert place. Under another group: add at the end of that group (like the outline).
    const op =
      group === here && !at.end
        ? ({ op: 'addCustom' as const, heading: name, group, after: at.after } as const)
        : ({ op: 'addCustom' as const, heading: name, group } as const);
    if (version) versionOp(job.id, version, op);
    else outlineOp(job.id, op);
    onClose();
    const added = getState().jobs.find((j) => j.id === job.id)?.undoStep?.keys?.[0];
    if (added) focusAdded(added);
  };
  const addGroup = (label: string) => {
    if (groupDone.current || version) return;
    const name = label.trim();
    if (!name) return;
    groupDone.current = true;
    outlineOp(job.id, { op: 'addGroup', label: name });
    onClose();
  };
  const startOwn = (group: GroupKey) => {
    ownDone.current = false;
    setOwnIn(group);
  };
  const startGroup = () => {
    groupDone.current = false;
    setGroupName('');
  };
  const cancelOwn = () => {
    ownDone.current = true;
    setOwnIn(null);
  };
  const cancelGroup = () => {
    groupDone.current = true;
    setGroupName(null);
  };
  // U-4 Step A: one chip per missing key, labeled with this job's format heading (e.g. Project brief) — not a second "Project" / "About the project" group.
  const chipName = (key: string) => headingFor(key, format);
  return (
    <div
      ref={box}
      className="ej-menu ej-addpanel"
      data-fixed
      style={place}
      role="dialog"
      aria-label="Add a section here"
      onKeyDown={(e) => {
        if (e.key !== 'Escape' && e.key !== 'Esc') return;
        e.preventDefault();
        e.stopPropagation();
        // Naming first: Escape cancels the name field only (must not close+blur into an add).
        if (ownIn !== null) {
          cancelOwn();
          return;
        }
        if (groupName !== null) {
          cancelGroup();
          return;
        }
        onClose();
        at.anchor.isConnected && at.anchor.focus();
      }}
    >
      {groups.map((gk) => {
        const missing = SECTIONS.filter((d) => d.group === gk && !keys.includes(d.key));
        const label = GROUPS.find((x) => x.key === gk)?.label ?? (view?.customGroups ?? job.customGroups)?.find((x) => x.id === gk)?.label ?? gk;
        return (
          <div key={gk} className="flex flex-col gap-1" role="group" aria-label={label}>
            <span className="ej-menu-label">{label}</span>
            <div className="flex flex-wrap gap-1 px-1.5">
              {missing.map((d) => (
                <Tip key={d.key} label={`${d.hint}${rec.includes(d.key) ? ' · recommended for this job' : ''}`}>
                  <button type="button" className="ej-add" data-recommended={rec.includes(d.key)} onClick={() => add(d.key)} aria-label={`Add ${chipName(d.key)}${rec.includes(d.key) ? ', recommended for this job' : ''}`}>
                    <Plus size={11} strokeWidth={2} aria-hidden />
                    {chipName(d.key)}
                    {rec.includes(d.key) && <Sparkles size={10} strokeWidth={2} aria-hidden className="ej-ol-rec" />}
                  </button>
                </Tip>
              ))}
              {ownIn === gk ? (
                <AddNameField label="Name this section" onCommit={(n) => addOwn(n, gk)} onCancel={cancelOwn} />
              ) : (
                <Tip label={`Add a section of your own in ${label}`}>
                  <button type="button" className="ej-add" onClick={() => startOwn(gk)} aria-label={`Add your own section in ${label}`}>
                    <Plus size={11} strokeWidth={2} aria-hidden />
                    Add your own
                  </button>
                </Tip>
              )}
            </div>
          </div>
        );
      })}
      {left.length > 0 && (
        <div className="flex flex-col gap-1" role="group" aria-label="Fixed texts left out">
          <span className="ej-menu-label">Our commitments</span>
          <div className="flex flex-wrap gap-1 px-1.5">
            {left.map((k) => (
              <Tip key={k} label={`Bring back ${fixedLabel(k)} at the end of Our commitments`}>
                <button
                  type="button"
                  className="ej-add"
                  onClick={() => {
                    bringBackFixed(job.id, k, lang);
                    onClose();
                  }}
                >
                  <ShieldCheck size={11} strokeWidth={2} aria-hidden />
                  {fixedLabel(k)}
                </button>
              </Tip>
            ))}
          </div>
        </div>
      )}
      {!version && (
        <div className="ej-ol-add-group px-1.5 pt-1">
          {groupName !== null ? (
            <AddNameField label="Name this group" onCommit={addGroup} onCancel={cancelGroup} />
          ) : (
            <Tip label="Add a top-level group of your own">
              <button type="button" className="ej-ol-add-group-btn" onClick={startGroup} aria-label="Add a group">
                <Plus size={13} strokeWidth={2} aria-hidden />
                Add a group
              </button>
            </Tip>
          )}
        </div>
      )}
    </div>
  );
}

/** A section removed with the grip or the outline leaves a one-line note where it was, with its Undo (hidden after ~2s; undoStep remains). */
function RemovedNote({ job }: { job: DemoJob }) {
  const r = job.undoStep?.removed;
  if (!r) return null;
  return (
    <div className="ej-change-note ej-removed-note" role="status">
      <X size={12} strokeWidth={2.4} />
      <span className="min-w-0 flex-1">Removed {r.title}</span>
      <button type="button" className="aj-text-btn" style={{ height: 24 }} onClick={() => undoStep(job.id)}>
        Undo
      </button>
    </div>
  );
}

/** `current`: the section in view in the window, marked; `noteEdits`: the window's chat notices hand edits; `draft`: the window's icons. */
export function DocumentView({ job, s, onSeeChat, current, noteEdits, draft: inWindow }: { job: DemoJob; s: State; onSeeChat?: () => void; current?: string | null; noteEdits?: boolean; draft?: boolean; open?: (t: OpenTarget) => void }) {
  const [flag, setFlag] = useState<Flag | null>(null);
  const [since] = useState(() => Date.now());
  const [adding, setAdding] = useState<{ after: string | null; anchor: HTMLElement; end: boolean } | null>(null);
  const [dropAfter, setDropAfter] = useState<string | null | undefined>(undefined);
  const removedKey = job.undoStep?.removed && !job.undoStep.writing ? job.undoStep.removed.key : undefined;
  const hideRemoved = useRemovedNoteHidden(removedKey);
  const root = useRef<HTMLElement>(null);
  const live = s.jobs.filter((j) => j.id !== job.id && (j.status === 'live' || j.status === 'scheduled')).map((j) => j.facts.title);
  const checks = quality(job.sections, job.facts, s.today, live);
  const icons = Boolean(inWindow) && !s.reviewerAs;
  const g = groupingOf(job);
  const keys = job.walk ? job.tags : inOutlineOrder(job.sections, job.tags).map((x) => x.key);
  const [said, setSaid] = useState('');
  // Each move is announced with the section's new place (section 19, phase 6, C), and the grip keeps the focus.
  const focusGrip = (key: string) => {
    const now = getState().jobs.find((x) => x.id === job.id);
    if (now) setSaid(`Moved. ${placeSaid(now.tags, groupingOf(now), key, now.sections.find((x) => x.key === key)?.title ?? key)}, ${now.tags.indexOf(key) + 1} of ${now.tags.length} in the job description`);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-grip-key="${key}"]`)?.focus({ preventScroll: true }));
  };
  const openAdd = (after: string | null, anchor: HTMLElement | null, end: boolean) => anchor && setAdding({ after, anchor, end });
  const tools: DraftTools | undefined = icons
    ? {
        grip: (sec) => [
          { label: 'Move up', run: () => (outlineOp(job.id, { op: 'by', key: sec.key, by: -1, reading: true }), focusGrip(sec.key)) },
          { label: 'Move down', run: () => (outlineOp(job.id, { op: 'by', key: sec.key, by: 1, reading: true }), focusGrip(sec.key)) },
          { label: 'Move to group…', items: groupOrderOf(g).filter((x) => x !== groupOfKey(g, sec.key)).map((x) => ({ label: groupLabelOf(x, job.customGroups), run: () => (outlineOp(job.id, { op: 'toGroup', key: sec.key, group: x }), focusGrip(sec.key)) })) },
          { label: 'Add a section below', run: () => openAdd(sec.key, document.querySelector<HTMLElement>(`[data-grip-key="${sec.key}"]`), false) },
          // U-4 / R2-P0-4: missing background → Add format heading; background without "About the project" sub → add that sub only.
          ...(!keys.includes(PROJECT_SECTION)
            ? [
                {
                  label: `Add ${headingFor(PROJECT_SECTION, formatOf(s, job.format))}`,
                  run: () => {
                    outlineOp(job.id, { op: 'add', key: PROJECT_SECTION, after: sec.key });
                    focusGrip(PROJECT_SECTION);
                  },
                },
              ]
            : (() => {
                const bg = job.sections.find((x) => x.key === PROJECT_SECTION);
                if (!bg || bg.subs?.some((sb) => sb.title === PROJECT_SUB)) return [];
                return [
                  {
                    label: `Add ${PROJECT_SUB}`,
                    run: () => {
                      changeSub(job.id, PROJECT_SECTION, { add: PROJECT_SUB });
                      document.getElementById(`ej-sec-${PROJECT_SECTION}`)?.scrollIntoView({ block: 'nearest' });
                      focusGrip(PROJECT_SECTION);
                    },
                  },
                ];
              })()),
          ...(KEPT.includes(sec.key) ? [] : [{ label: 'Remove', danger: true, run: () => outlineOp(job.id, { op: 'remove', key: sec.key }) }]),
          ...(sec.key === 'about' && s.me.role === 'owner' && sec.lines.length > 0 && sec.lines.join('\n').trim() !== s.org.about.trim() ? [{ label: 'Save as our About us', run: () => saveAboutForOrg(job.id) }] : []),
        ],
        onKey: (key, by) => {
          outlineOp(job.id, { op: 'by', key, by, reading: true });
          focusGrip(key);
        },
        onDrag: (key, y, finished) => {
          if (y === null) return setDropAfter(undefined);
          const at = dropAt(root.current, y, key);
          if (!finished) return setDropAfter(at.after);
          setDropAfter(undefined);
          outlineOp(job.id, { op: 'drop', key, after: at.after, group: (at.group ?? groupOrderOf(g)[0]) as GroupKey });
          focusGrip(key);
        },
        dropAfter,
      }
    : undefined;
  const removed = icons && job.undoStep?.tab === 'doc' ? job.undoStep.removed : undefined;
  const removedAt = removed ? (removed.after && keys.includes(removed.after) ? removed.after : null) : undefined;
  const note = icons && job.undoStep?.tab === 'doc' && !job.lastChange && !job.undoStep.removed && !job.undoStep.keys?.some((k) => keys.includes(k));
  const heading = (k: string) => job.renamed?.[k] ?? headingFor(k, formatOf(s, job.format));
  return (
    <>
      <article ref={root} className="ej-doc aj-card flex flex-col gap-1 p-3 lg:p-5" aria-label="Job description" data-drop-top={dropAfter === null || undefined}>
        {icons && (
          <div className="sr-only" role="status">
            {said}
          </div>
        )}
        <div className="px-3 pb-2">
          <div className="aj-faint" style={{ fontSize: 11 }}>
            {s.org.name}
            {job.facts.location ? ` · ${job.facts.location}` : ''}
            {job.facts.deadline ? ` · closes ${longDate(job.facts.deadline)}` : ''}
            {job.facts.recruitment === 'roster' ? ' · Roster' : job.facts.recruitment === 'proposal' ? ' · Proposal stage' : ''}
          </div>
          <TitleEditor job={job} disabled={Boolean(s.reviewerAs)} />
        </div>
        {note && <StepNote job={job} onSeeChat={onSeeChat} />}
        {removedAt === null && !hideRemoved && <RemovedNote job={job} />}
        {keys.map((k) => {
          const sec = job.sections.find((x) => x.key === k);
          const pageKind = k === 'about' ? 'about' : k === PROJECT_SECTION ? 'project' : null;
          return (
            <Fragment key={k}>
              {sec ? (
                <SectionView job={job} sec={sec} s={s} notes={checks.filter((c) => c.section === k)} onFlag={setFlag} onSeeChat={onSeeChat} current={current === k} noteEdits={noteEdits} since={since} draft={tools} />
              ) : (
                <section id={`ej-sec-${k}`} className="rounded-2xl px-3 py-2" data-drop-key={icons ? k : undefined} data-drop-group={icons ? groupOfKey(g, k) : undefined} data-drop={dropAfter === k ? 'after' : undefined} aria-label={`${heading(k)}, not written yet`} style={{ scrollMarginTop: 12 }}>
                  <h3 className="aj-faint">{heading(k)}</h3>
                  {icons && pageKind ? (
                    <button type="button" className="aj-pill" style={{ height: 30 }} onClick={() => editSection(job.id, k, '')}>
                      Write {heading(k)}
                    </button>
                  ) : (
                    <p className="aj-faint m-0" style={{ fontSize: 12.5 }}>
                      Written when we get here.
                    </p>
                  )}
                </section>
              )}
              {removedAt === k && !hideRemoved && <RemovedNote job={job} />}
            </Fragment>
          );
        })}
        {icons && (
          <div className="ej-addend">
            <Tip label="Add a section, or bring back a fixed text">
              <button type="button" className="ej-addend-btn" onClick={(e) => openAdd(keys[keys.length - 1] ?? null, e.currentTarget, true)} aria-label="Add a section" aria-haspopup="dialog">
                <Plus size={14} strokeWidth={2.2} />
              </button>
            </Tip>
          </div>
        )}
        {inWindow ? (
          <FixedBlock job={job} s={s} />
        ) : job.commitments.length > 0 ? (
          <section className="rounded-2xl px-3 py-2" aria-label="Commitments">
            <h3 className="flex items-center gap-1.5">
              <ShieldCheck size={13} strokeWidth={2} /> Our commitments
            </h3>
            {job.commitments.map((k) => {
              const c = commitmentText(k, s.org, job.facts);
              return (
                <p key={k} className="ej-commitment">
                  <strong>{COMMITMENTS.find((x) => x.key === k)?.label}.</strong>{' '}
                  {c.locked && (
                    <Tip label="Your locked text, inserted word for word">
                      <Lock size={11} strokeWidth={2} aria-label="Locked text" className="mr-1" />
                    </Tip>
                  )}
                  {c.text}
                </p>
              );
            })}
          </section>
        ) : null}
      </article>
      {adding && <AddPanel job={job} s={s} at={adding} onClose={() => setAdding(null)} />}
      {flag && <FlagDialog job={job} flag={flag} onClose={() => setFlag(null)} />}
    </>
  );
}
const PICKS: Partial<Record<NonNullable<ChatMsg['ask']>, (s: State, job: DemoJob) => Pick[]>> = {
  place: placePicks,
  deadline: deadlinePicks,
  contract: contractPicks,
  grade: gradePicks,
  eligibility: eligibilityPicks,
  languages: languagePicks,
  safeguarding: () => safeguardingPicks(),
  salary: salaryPicks,
};

/** The fact dialog that offers more than the picks, opened from the question. */
const MORE: Partial<Record<NonNullable<ChatMsg['ask']>, string>> = { grade: 'grade', salary: 'salary', eligibility: 'more', languages: 'more', safeguarding: 'more' };

/** Answers built into AidJobs' question: relevant picks, each with its reason, plus a search or a calendar. Free text in the box works too. */
export function AskAnswer({ job, s, kind, onAnswered }: { job: DemoJob; s: State; kind: NonNullable<ChatMsg['ask']>; onAnswered: () => void }) {
  const [q, setQ] = useState('');
  const [date, setDate] = useState('');
  const min = addDays(s.today, 1);
  const picks = PICKS[kind]?.(s, job) ?? [];
  const answer = (patch: Partial<Facts>, said: string) => {
    answerFact(job.id, patch, said, kind);
    onAnswered();
  };
  if (kind === 'method')
    return (
      <div className="ej-ask-answer">
        <div className="flex flex-wrap gap-1.5">
          {methodPicks(s).map((p) => (
            <Tip key={p.label} label={p.why}>
              <button
                type="button"
                className="aj-pill"
                style={{ height: 30 }}
                onClick={() => {
                  setMethod(job.id, p.method, p.label);
                  onAnswered();
                }}
              >
                {p.label}
              </button>
            </Tip>
          ))}
        </div>
      </div>
    );
  const dateOk = /^20\d\d-\d\d-\d\d$/.test(date) && date >= min;
  const matches = kind === 'place' && q.trim().length >= 2 ? PLACES.filter((p) => `${p.city} ${p.country}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5) : [];
  const choosePlace = (text: string) => {
    const known = PLACES.find((p) => p.city.toLowerCase() === text.trim().toLowerCase());
    if (known) return answer(placePatch(known.city), known.city);
    const loose = looseLocation(`based in ${text}`);
    answer({ location: loose?.location ?? text.trim(), country: loose?.country ?? '', arrangement: 'onsite' }, text.trim());
  };
  return (
    <div className="ej-ask-answer">
      {picks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picks.map((p) => (
            <Tip key={p.label} label={p.why}>
              <button type="button" className="aj-pill" style={{ height: 30 }} onClick={() => answer(p.patch, p.label)}>
                {p.label}
              </button>
            </Tip>
          ))}
        </div>
      )}
      {kind === 'place' && (
        <div className="flex flex-col gap-1">
          <input
            style={{ ...inputStyle, minHeight: 34 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && q.trim() && choosePlace(q)}
            placeholder="Search a place, or type any town and country"
            aria-label="Search a duty station"
          />
          {matches.map((m) => (
            <button key={m.city} type="button" className="ej-menu-item" onClick={() => choosePlace(m.city)}>
              {m.city}, {m.country}
            </button>
          ))}
          {q.trim().length >= 2 && !matches.some((m) => m.city.toLowerCase() === q.trim().toLowerCase()) && (
            <button type="button" className="ej-menu-item" onClick={() => choosePlace(q)}>
              Use &ldquo;{q.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
      {kind === 'deadline' && (
        <div className="flex gap-1.5">
          <input
            type="date"
            style={{ ...inputStyle, minHeight: 34, flex: 1 }}
            min={min}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && dateOk && answer({ deadline: date }, longDate(date))}
            aria-label="Pick a closing date"
          />
          <button type="button" className="aj-pill" style={{ height: 34 }} disabled={!dateOk} onClick={() => answer({ deadline: date }, longDate(date))}>
            Set date
          </button>
        </div>
      )}
      {MORE[kind] && (
        <button type="button" className="aj-text-btn self-start" style={{ height: 26, paddingInline: 0 }} onClick={() => window.dispatchEvent(new CustomEvent('ej-open-fact', { detail: MORE[kind] }))}>
          More options…
        </button>
      )}
    </div>
  );
}

/** The whole conversation with AidJobs, in its own panel beside the job description, with the box to write in. */
export function ChatPanel({ job, s, autoFocus }: { job: DemoJob; s: State; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const box = useRef<ComposerHandle>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [job.chat.length]);
  if (s.reviewerAs) return null;
  const last = job.chat[job.chat.length - 1];
  const lastUser = job.chat.map((m) => m.from).lastIndexOf('user');
  const own = [...s.jobs.map((j) => j.facts.title).filter(Boolean), ...s.org.countries.flatMap((c) => PLACES.filter((p) => p.country === c).map((p) => `${p.city}, ${p.country}`))];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="aj-scroll flex min-h-0 flex-1 flex-col gap-2 px-4 py-3" aria-label="Conversation" aria-live="polite">
        {job.chat.length === 0 && <p className="aj-faint m-0">Ask AidJobs for any change to the job description.</p>}
        {job.chat.map((m, i) => (
          <div key={m.id} className="ej-bubble" data-from={m.from}>
            {rich(m.text)}
            {m.from === 'ai' && i > lastUser && m.quick && m.quick.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.quick.map((q) => (
                  <button key={q} type="button" className="aj-pill" style={{ height: 30 }} onClick={() => sendChat(job.id, q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            {m.from === 'ai' && m === last && m.ask && <AskAnswer job={job} s={s} kind={m.ask} onAnswered={() => setTimeout(() => box.current?.focus(), 0)} />}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="shrink-0 border-t px-3 py-2.5 aj-hair">
        <Composer
          ref={box}
          value={text}
          onChange={setText}
          onSend={(v) => {
            sendChat(job.id, v);
            setText('');
          }}
          suggestion={completeText(text, own)}
          placeholder={last?.ask ? 'Answer here, or pick above' : 'Ask for a change: "shorten the responsibilities", "add French"…'}
          label="Message AidJobs about this job description"
          compact
          autoFocus={autoFocus}
        />
      </div>
    </div>
  );
}

