'use client';

import { AlertCircle, Check, CheckCircle2, Info, Lock, MessageSquare, Pencil, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Tip from '@/components/site/Tip';
import { addRemark, canWrite, dismissChange, editSection, markGenuine, sendChat, setApply, setFacts, settleRemark, undoLastChange, writeDraft } from './actions';
import { DOCUMENTS } from './apply';
import Composer from './Composer';
import { commitmentText, COMMITMENTS, findInclusive, longDate, quality, type QualityItem } from './engine';
import { ReviewerBar, ReviewSummary } from './Review';
import type { ApplySettings, DemoJob, Section as Sec, State } from './types';
import { Dialog, Field, inputStyle } from './ui';

function rich(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

type Flag = { key: string; why: string; alt: string; source: string; match: string; section: string };

/** One line of text with inclusive-language highlights. Highlight only: the user decides (3 November 2026). */
function MarkedText({ text, job, section, onFlag }: { text: string; job: DemoJob; section: string; onFlag: (f: Flag) => void }) {
  const hits = findInclusive(text, job.format).filter((h) => !job.genuine[`${h.rule.id}:${section}:${h.match.toLowerCase()}`]);
  if (!hits.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let at = 0;
  hits.forEach((h, i) => {
    if (h.index > at) out.push(<Fragment key={`t${i}`}>{text.slice(at, h.index)}</Fragment>);
    const flag: Flag = { key: `${h.rule.id}:${section}:${h.match.toLowerCase()}`, why: h.rule.why, alt: h.rule.alt, source: h.rule.source, match: h.match, section };
    out.push(
      <Tip key={`m${i}`} label={`${h.rule.why} Possible alternative: ${h.rule.alt}. (${h.rule.source})`}>
        <button type="button" className="ej-mark" onClick={() => onFlag(flag)} aria-label={`"${h.match}" highlighted: ${h.rule.why}`}>
          {h.match}
        </button>
      </Tip>,
    );
    at = h.index + h.match.length;
  });
  if (at < text.length) out.push(<Fragment key="end">{text.slice(at)}</Fragment>);
  return <>{out}</>;
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
              <MarkedText text={l} job={job} section={section} onFlag={onFlag} />
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
            <MarkedText text={l} job={job} section={section} onFlag={onFlag} />
          </p>
        ),
      );
    }
  });
  flush('end');
  return <>{blocks}</>;
}

function ApplyDialog({ job, onClose }: { job: DemoJob; onClose: () => void }) {
  const a = job.apply;
  const set = (p: Partial<ApplySettings>) => setApply(job.id, p);
  const toggleDoc = (d: string) => set({ documents: a.documents.includes(d) ? a.documents.filter((x) => x !== d) : [...a.documents, d] });
  return (
    <Dialog title="How to apply" subtitle="Writes the section for you" onClose={onClose} wide footer={<div className="flex justify-end"><button type="button" className="aj-ink-btn" onClick={onClose}>Done</button></div>}>
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
    </Dialog>
  );
}

function SectionView({ job, sec, s, notes, onFlag, onSeeChat }: { job: DemoJob; sec: Sec; s: State; notes: QualityItem[]; onFlag: (f: Flag) => void; onSeeChat?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [remark, setRemark] = useState<'comment' | 'suggestion' | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [suggestText, setSuggestText] = useState('');
  const [applyOpen, setApplyOpen] = useState(false);
  const reviewing = Boolean(s.reviewerAs);
  const remarks = job.review.remarks.filter((r) => r.section === sec.key && r.state === 'open');
  const changed = Boolean(job.lastChange?.keys.includes(sec.key));
  return (
    <section id={`ej-sec-${sec.key}`} className="rounded-2xl px-3 py-2" data-changed={changed} aria-label={sec.title} style={{ scrollMarginTop: 12 }}>
      <div className="flex items-center gap-2">
        <h3 style={{ flex: 1 }}>{sec.title}</h3>
        {sec.edited && <span className="aj-chip">Your text</span>}
        {!reviewing && sec.key === 'apply' && (
          <Tip label="Set up how to apply">
            <button type="button" className="aj-icon-btn" style={{ width: 28, height: 28 }} onClick={() => setApplyOpen(true)} aria-label="Set up how to apply">
              <Settings2 size={13} strokeWidth={1.8} />
            </button>
          </Tip>
        )}
        {!reviewing && !editing && (
          <Tip label={`Edit ${sec.title}`}>
            <button type="button" className="aj-icon-btn" style={{ width: 28, height: 28 }} onClick={() => { setText(sec.lines.map((l) => (l.startsWith('- ') ? `• ${l.slice(2)}` : l)).join('\n')); setEditing(true); }} aria-label={`Edit ${sec.title}`}>
              <Pencil size={13} strokeWidth={1.8} />
            </button>
          </Tip>
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
      {changed && job.lastChange && !reviewing && (
        <div className="ej-change-note" role="status">
          <Check size={12} strokeWidth={2.4} />
          <span className="min-w-0 flex-1">{job.lastChange.text}</span>
          <button type="button" className="aj-text-btn" style={{ height: 24 }} onClick={() => undoLastChange(job.id)}>
            Undo
          </button>
          {onSeeChat && (
            <button type="button" className="aj-text-btn" style={{ height: 24 }} onClick={onSeeChat}>
              See in chat
            </button>
          )}
          <button type="button" className="aj-icon-btn" style={{ width: 24, height: 24, border: 'none' }} onClick={() => dismissChange(job.id)} aria-label="Hide this note">
            <X size={12} strokeWidth={2} />
          </button>
        </div>
      )}
      {notes.map((n) => (
        <div key={n.key} className="ej-check mb-1" style={{ color: 'var(--amber)' }}>
          <AlertCircle size={12} strokeWidth={2} /> <span style={{ color: 'var(--text-2)' }}>{n.text.replace(`${sec.title}: `, '')}</span>
        </div>
      ))}
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea style={{ ...inputStyle, minHeight: 140, lineHeight: 1.6 }} value={text} onChange={(e) => setText(e.target.value)} aria-label={`${sec.title} text`} autoFocus />
          <div className="flex gap-1.5">
            <button type="button" className="aj-ink-btn" onClick={() => { editSection(job.id, sec.key, text); setEditing(false); }}>
              Save
            </button>
            <button type="button" className="aj-pill" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <Lines lines={sec.lines} job={job} section={sec.key} onFlag={onFlag} />
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
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [job.facts.title]);
  return (
    <textarea
      ref={ref}
      id="ej-title-edit"
      className="ej-title-edit"
      rows={1}
      value={job.facts.title}
      onChange={(e) => setFacts(job.id, { title: e.target.value.replace(/\n/g, ' ') })}
      onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
      placeholder="Job title"
      aria-label="Job title"
      disabled={disabled}
    />
  );
}
export function DocumentView({ job, s, onSeeChat }: { job: DemoJob; s: State; onSeeChat?: () => void }) {
  const [flag, setFlag] = useState<Flag | null>(null);
  const live = s.jobs.filter((j) => j.id !== job.id && (j.status === 'live' || j.status === 'scheduled')).map((j) => j.facts.title);
  const checks = quality(job.sections, job.facts, s.today, live);
  return (
    <>
      <article className="ej-doc aj-card flex flex-col gap-1 p-3 lg:p-5" aria-label="Job description">
        <div className="px-3 pb-2">
          <div className="aj-faint" style={{ fontSize: 11 }}>
            {s.org.name}
            {job.facts.location ? ` · ${job.facts.location}` : ''}
            {job.facts.deadline ? ` · closes ${longDate(job.facts.deadline)}` : ''}
            {job.facts.recruitment === 'roster' ? ' · Roster' : job.facts.recruitment === 'proposal' ? ' · Proposal stage' : ''}
          </div>
          <TitleEditor job={job} disabled={Boolean(s.reviewerAs)} />
        </div>
        {job.sections.map((sec) => (
          <SectionView key={sec.key} job={job} sec={sec} s={s} notes={checks.filter((c) => c.section === sec.key)} onFlag={setFlag} onSeeChat={onSeeChat} />
        ))}
        {job.commitments.length > 0 && (
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
        )}
      </article>
      {flag && <FlagDialog job={job} flag={flag} onClose={() => setFlag(null)} />}
    </>
  );
}

export function ChecksBar({ job, s }: { job: DemoJob; s: State }) {
  const live = s.jobs.filter((j) => j.id !== job.id && (j.status === 'live' || j.status === 'scheduled')).map((j) => j.facts.title);
  const checks = quality(job.sections, job.facts, s.today, live).filter((c) => !c.section);
  const flags = job.sections.reduce((n, sec) => n + sec.lines.reduce((m, l) => m + findInclusive(l, job.format).filter((h) => !job.genuine[`${h.rule.id}:${sec.key}:${h.match.toLowerCase()}`]).length, 0), 0);
  const tone = (l: QualityItem['level']) => (l === 'ok' ? 'var(--sage-7)' : l === 'issue' ? 'var(--red)' : l === 'warn' ? 'var(--amber)' : 'var(--text-3)');
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Checks">
      {checks.map((i) => (
        <span key={i.key} className="ej-check" style={{ color: tone(i.level) }}>
          {i.level === 'ok' ? <CheckCircle2 size={13} strokeWidth={2} /> : i.level === 'info' ? <Info size={13} strokeWidth={2} /> : <AlertCircle size={13} strokeWidth={2} />}
          <span style={{ color: 'var(--text-2)' }}>{i.text}</span>
        </span>
      ))}
      <span className="ej-check shrink-0" style={{ color: flags ? 'var(--amber)' : 'var(--sage-7)' }}>
        {flags ? <AlertCircle size={13} strokeWidth={2} /> : <CheckCircle2 size={13} strokeWidth={2} />}
        <span style={{ color: 'var(--text-2)' }}>{flags ? `Inclusive language: ${flags} highlighted; hover to see why` : 'Inclusive language ✓'}</span>
      </span>
    </div>
  );
}

/** The chat, docked under the document: the latest reply and the box, with the whole conversation one tap away. */
/** The whole conversation, for the Chat tab beside the job description. */
export function ChatHistory({ job }: { job: DemoJob }) {
  if (!job.chat.length) return <p className="aj-faint m-0 px-4 py-3">The conversation about this job description appears here.</p>;
  return (
    <div className="flex flex-col gap-2 px-4 py-3" aria-label="Conversation" aria-live="polite">
      {job.chat.map((m) => (
        <div key={m.id} className="ej-bubble" data-from={m.from}>
          {rich(m.text)}
        </div>
      ))}
    </div>
  );
}

/**
 * The slim chat line under the job description: AidJobs' current question in one line with quick answers, and a box
 * that grows only while typing. The whole conversation is in the Chat tab.
 */
export function ChatLine({ job, s, onTyping }: { job: DemoJob; s: State; onTyping?: () => void }) {
  const [text, setText] = useState('');
  const [writing, setWriting] = useState(false);
  const last = job.chat[job.chat.length - 1];
  const asking = last?.from === 'ai' ? last : undefined;
  const write = canWrite(job);
  const start = () => {
    setWriting(true);
    setTimeout(() => {
      writeDraft(job.id);
      setWriting(false);
    }, 900);
  };
  if (s.reviewerAs) return null;
  const quick = asking?.quick ?? [];
  const showWrite = !job.sections.length && !quick.includes('Write the description');
  return (
    <div className="ej-dock flex shrink-0 flex-col gap-1.5">
      {writing ? (
        <div className="ej-ask">
          <Sparkles size={13} strokeWidth={2} /> Writing the job description… (simulated)
        </div>
      ) : (
        asking && (
          <div className="ej-ask" aria-live="polite">
            <Sparkles size={13} strokeWidth={2} className="shrink-0" />
            <span className="min-w-0 flex-1">{rich(asking.text)}</span>
          </div>
        )
      )}
      {(quick.length > 0 || showWrite) && !writing && (
        <div className="aj-no-scrollbar flex items-center gap-1.5 overflow-x-auto">
          {quick.map((q) =>
            q === 'Write the description' ? (
              <button key={q} type="button" className="aj-ink-btn shrink-0" style={{ height: 30 }} onClick={start} disabled={!write.ok}>
                <Sparkles size={13} strokeWidth={2} /> Write the job description
              </button>
            ) : (
              <button key={q} type="button" className="aj-pill shrink-0" style={{ height: 30 }} onClick={() => sendChat(job.id, q)}>
                {q}
              </button>
            ),
          )}
          {showWrite && (
            <button type="button" className="aj-ink-btn ml-auto shrink-0" style={{ height: 30 }} onClick={start} disabled={!write.ok}>
              <Sparkles size={13} strokeWidth={2} /> {write.ok ? 'Write the job description' : write.why}
            </button>
          )}
        </div>
      )}
      <Composer
        value={text}
        onChange={(v) => {
          if (!text && v) onTyping?.();
          setText(v);
        }}
        onSend={(v) => {
          sendChat(job.id, v);
          setText('');
        }}
        suggestion=""
        placeholder={job.sections.length ? 'Ask for a change: "shorten the responsibilities", "add French"…' : 'Answer, or add details'}
        label="Message AidJobs about this job description"
        compact
      />
    </div>
  );
}
export function ReviewArea({ job, s }: { job: DemoJob; s: State }) {
  return (
    <>
      <ReviewSummary job={job} s={s} />
      {s.reviewerAs && <ReviewerBar job={job} s={s} />}
    </>
  );
}

