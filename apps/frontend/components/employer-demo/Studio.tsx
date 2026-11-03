'use client';

import { AlertCircle, ArrowLeft, Check, CheckCircle2, FileText, History, MessageSquare, Pencil, Send, ShieldCheck, Sparkles, UserCheck, X } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { useIsPhone } from '@/components/site/BottomSheet';
import {
  addRemark,
  applyStyle,
  approvalRequired,
  canWrite,
  editSection,
  isApproved,
  restoreVersion,
  reviewerDecision,
  sendChat,
  sendForReview,
  setFact,
  settleRemark,
  toggleTag,
  writeDraft,
} from './actions';
import Composer from './Composer';
import { addDays, daysUntil, detectFamily, longDate, quality, recommendTags, shortDate, suggestNext, TAG_BY_KEY, TAGS, type QualityItem } from './engine';
import { statusLine } from './Home';
import { go, update, useDemo } from './store';
import type { DemoJob, Facts, Section as Sec, State } from './types';
import { Dialog, Field, inputStyle, PlanBadge, RecipientInput } from './ui';

function rich(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

function Lines({ lines }: { lines: string[] }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: string) => {
    if (list.length) {
      blocks.push(
        <ul key={`u${k}`}>
          {list.map((l, i) => (
            <li key={i}>{l}</li>
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
      blocks.push(<p key={i}>{l}</p>);
    }
  });
  flush('end');
  return <>{blocks}</>;
}

const FACT_FIELDS: Array<{ key: keyof Facts; label: string; required?: boolean }> = [
  { key: 'title', label: 'Title', required: true },
  { key: 'location', label: 'Duty station', required: true },
  { key: 'contract', label: 'Contract', required: true },
  { key: 'duration', label: 'Duration' },
  { key: 'grade', label: 'Grade' },
  { key: 'deadline', label: 'Closes', required: true },
  { key: 'salary', label: 'Salary' },
  { key: 'languages', label: 'Languages' },
];

function factValue(f: Facts, key: keyof Facts): string {
  if (key === 'location') return f.remote && !f.location ? 'Remote' : f.location;
  if (key === 'deadline') return f.deadline ? longDate(f.deadline) : '';
  if (key === 'languages') return f.languages.join(', ');
  return String(f[key] ?? '');
}

export function FactStrip({ job, readOnly }: { job: DemoJob; readOnly?: boolean }) {
  const [editing, setEditing] = useState<keyof Facts | null>(null);
  const [draft, setDraft] = useState('');
  const f = job.facts;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="aj-faint" style={{ fontSize: 11 }}>
        What I understood{readOnly ? '' : ' · tap to correct'}
      </div>
      <div className="aj-no-scrollbar flex gap-1.5 overflow-x-auto lg:flex-wrap" aria-label="Job facts">
        {FACT_FIELDS.map((ff) => {
          const v = factValue(f, ff.key);
          const missing = !v && ff.required;
          if (!v && !ff.required && readOnly) return null;
          return (
            <button
              key={ff.key}
              type="button"
              className="ej-fact shrink-0"
              data-missing={missing}
              disabled={readOnly}
              onClick={() => {
                setEditing(ff.key);
                setDraft(ff.key === 'deadline' ? f.deadline : ff.key === 'languages' ? f.languages.join(', ') : ff.key === 'location' ? f.location : String(f[ff.key] ?? ''));
              }}
              aria-label={`${ff.label}: ${v || 'missing'}${readOnly ? '' : '. Edit'}`}
            >
              <span className="aj-faint">{ff.label}</span>
              <span style={{ fontWeight: 600 }}>{v || 'Add'}</span>
            </button>
          );
        })}
      </div>
      {editing && (
        <Dialog
          title={FACT_FIELDS.find((x) => x.key === editing)?.label ?? ''}
          onClose={() => setEditing(null)}
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" className="aj-pill" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="aj-ink-btn"
                onClick={() => {
                  setFact(job.id, editing, draft);
                  setEditing(null);
                }}
              >
                Save
              </button>
            </div>
          }
        >
          {editing === 'deadline' ? (
            <input type="date" style={inputStyle} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Closing date" />
          ) : editing === 'contract' ? (
            <div className="flex flex-wrap gap-1.5">
              {['Fixed-term', 'Open-ended', 'Temporary', 'Consultancy', 'Internship'].map((c) => (
                <button key={c} type="button" className="aj-pill" data-active={draft === c} onClick={() => setDraft(c)}>
                  {c}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input style={inputStyle} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={editing} autoFocus />
              {editing === 'location' && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={job.facts.remote} onChange={(e) => setFact(job.id, 'remote', String(e.target.checked))} /> Remote or home-based
                </label>
              )}
              {editing === 'languages' && <span className="aj-faint">The first is required; the others are an advantage. Separate with commas.</span>}
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}

function QualityList({ items }: { items: QualityItem[] }) {
  const tone = (l: QualityItem['level']) => (l === 'ok' ? 'var(--sage-7)' : l === 'warn' ? 'var(--amber)' : 'var(--red)');
  return (
    <ul className="flex flex-col gap-1" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Quality checks">
      {items
        .filter((i) => !i.section)
        .map((i) => (
          <li key={i.key} className="ej-check" style={{ color: tone(i.level) }}>
            {i.level === 'ok' ? <CheckCircle2 size={13} strokeWidth={2} /> : <AlertCircle size={13} strokeWidth={2} />}
            <span style={{ color: 'var(--text-2)' }}>{i.text}</span>
          </li>
        ))}
    </ul>
  );
}

function TagBar({ job, s }: { job: DemoJob; s: State }) {
  const { family, modifier } = detectFamily(`${job.facts.title} ${job.facts.contract}`);
  const rec = new Set(recommendTags(family, modifier, job.facts));
  const groups = Array.from(new Set(TAGS.map((t) => t.group)));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="aj-faint" style={{ fontSize: 11 }}>
          Sections · {job.tags.length} chosen{job.tags.length < 3 ? ', choose at least 3' : ''}
        </span>
      </div>
      {groups.map((g) => (
        <div key={g} className="aj-no-scrollbar flex items-center gap-1.5 overflow-x-auto lg:flex-wrap">
          <span className="aj-faint shrink-0" style={{ fontSize: 10.5, width: 78 }}>
            {g}
          </span>
          {TAGS.filter((t) => t.group === g).map((t) => {
            const std = s.org.standard.find((x) => x.key === t.key);
            return (
              <button
                key={t.key}
                type="button"
                className="ej-tag shrink-0"
                data-on={job.tags.includes(t.key)}
                data-recommended={rec.has(t.key)}
                onClick={() => toggleTag(job.id, t.key)}
                aria-pressed={job.tags.includes(t.key)}
                title={`${t.hint}${rec.has(t.key) ? ' · recommended for this role' : ''}${std?.locked ? ' · locked text' : ''}`}
              >
                {job.tags.includes(t.key) ? <Check size={11} strokeWidth={2.4} /> : rec.has(t.key) ? <Sparkles size={11} strokeWidth={2} /> : null}
                {t.label}
                {std?.locked && <ShieldCheck size={11} strokeWidth={2} aria-label="locked" />}
              </button>
            );
          })}
        </div>
      ))}
      <div className="aj-no-scrollbar flex items-center gap-1.5 overflow-x-auto">
        <span className="aj-faint shrink-0" style={{ fontSize: 10.5, width: 78 }}>
          Styles
        </span>
        {s.styles.map((st) => (
          <button key={st.key} type="button" className="ej-tag shrink-0" data-on={job.style === st.key} onClick={() => applyStyle(job.id, st)} aria-pressed={job.style === st.key} title={st.note}>
            {st.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionView({ job, sec, changed, s, notes }: { job: DemoJob; sec: Sec; changed: boolean; s: State; notes: QualityItem[] }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [remark, setRemark] = useState<'comment' | 'suggestion' | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [suggestText, setSuggestText] = useState('');
  const std = s.org.standard.find((x) => x.key === sec.key);
  const reviewing = Boolean(s.reviewerAs);
  const remarks = job.review.remarks.filter((r) => r.section === sec.key && r.state === 'open');
  return (
    <section className="rounded-2xl px-3 py-2" data-changed={changed} aria-label={sec.title}>
      <div className="flex items-center gap-2">
        <h3 style={{ flex: 1 }}>{sec.title}</h3>
        {std?.locked && (
          <span className="aj-chip" title="Your organisation's fixed text; only an owner can change it in Organisation settings">
            <ShieldCheck size={11} strokeWidth={2} /> Locked
          </span>
        )}
        {sec.edited && <span className="aj-chip">Edited</span>}
        {!reviewing && !std?.locked && !editing && (
          <button
            type="button"
            className="aj-icon-btn"
            style={{ width: 28, height: 28 }}
            onClick={() => {
              setText(sec.lines.map((l) => (l.startsWith('- ') ? `• ${l.slice(2)}` : l)).join('\n'));
              setEditing(true);
            }}
            aria-label={`Edit ${sec.title}`}
          >
            <Pencil size={13} strokeWidth={1.8} />
          </button>
        )}
        {reviewing && (
          <>
            <button type="button" className="aj-pill" style={{ height: 28 }} onClick={() => setRemark('comment')}>
              <MessageSquare size={12} strokeWidth={1.8} /> Comment
            </button>
            {!std?.locked && (
              <button type="button" className="aj-pill" style={{ height: 28 }} onClick={() => setRemark('suggestion')}>
                <Pencil size={12} strokeWidth={1.8} /> Suggest
              </button>
            )}
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
          <textarea style={{ ...inputStyle, minHeight: 140, lineHeight: 1.6 }} value={text} onChange={(e) => setText(e.target.value)} aria-label={`${sec.title} text`} autoFocus />
          <div className="flex gap-1.5">
            <button
              type="button"
              className="aj-ink-btn"
              onClick={() => {
                editSection(job.id, sec.key, text);
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
        <Lines lines={sec.lines} />
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
    </section>
  );
}

function Document({ job, s }: { job: DemoJob; s: State }) {
  const prev = job.versions[job.versions.length - 2];
  const live = s.jobs.filter((j) => j.id !== job.id && (j.status === 'live' || j.status === 'scheduled')).map((j) => j.facts.title);
  const checks = quality(job.sections, job.facts, s.today, live);
  const lastChanged = job.sections.filter((sec) => prev && JSON.stringify(prev.sections.find((p) => p.key === sec.key)?.lines) !== JSON.stringify(sec.lines)).map((x) => x.title);
  return (
    <div className="flex flex-col gap-3">
      <div className="aj-sr-live sr-only" aria-live="polite">
        {lastChanged.length ? `Updated: ${lastChanged.join(', ')}` : ''}
      </div>
      <QualityList items={checks} />
      <article className="ej-doc aj-card flex flex-col gap-1 p-3 lg:p-5" aria-label="Job description">
        <div className="px-3 pb-2">
          <div className="aj-faint" style={{ fontSize: 11 }}>
            {s.org.name}
            {job.facts.location ? ` · ${job.facts.location}` : ''}
            {job.facts.deadline ? ` · closes ${longDate(job.facts.deadline)}` : ''}
          </div>
          <h2 style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700 }}>{job.facts.title || 'Untitled job'}</h2>
        </div>
        {job.sections.map((sec) => (
          <SectionView key={sec.key} job={job} sec={sec} s={s} changed={lastChanged.includes(sec.title)} notes={checks.filter((c) => c.section === sec.key)} />
        ))}
      </article>
    </div>
  );
}

function ReviewDialog({ job, s, onClose }: { job: DemoJob; s: State; onClose: () => void }) {
  const candidates = s.team.filter((p) => p.id !== s.me.id);
  const [picked, setPicked] = useState<string[]>(candidates.filter((p) => p.role === 'reviewer').map((p) => p.id));
  const [outside, setOutside] = useState<string[]>([]);
  const [due, setDue] = useState(3);
  const [rule, setRule] = useState<'any' | 'all'>(s.org.approvalRule);
  const [note, setNote] = useState('');
  const total = picked.length + outside.length;
  return (
    <Dialog
      title="Send for review"
      subtitle="Optional"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="aj-faint">{total} {total === 1 ? 'reviewer' : 'reviewers'} · simulated, nothing is sent</span>
          <button
            type="button"
            className="aj-ink-btn"
            disabled={total === 0}
            onClick={() => {
              sendForReview(
                job.id,
                [...candidates.filter((p) => picked.includes(p.id)).map((p) => ({ name: p.name, email: p.email, outside: false })), ...outside.map((e) => ({ name: e, email: e, outside: true }))],
                addDays(s.today, due),
                rule,
                note,
              );
              onClose();
            }}
          >
            <Send size={14} strokeWidth={2} /> Send
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Your team">
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((p) => (
              <button key={p.id} type="button" className="aj-pill" data-active={picked.includes(p.id)} onClick={() => setPicked(picked.includes(p.id) ? picked.filter((x) => x !== p.id) : [...picked, p.id])} aria-pressed={picked.includes(p.id)}>
                {p.name}
                <span style={{ opacity: 0.7 }}>· {p.role}</span>
              </button>
            ))}
          </div>
        </Field>
        <RecipientInput label="Someone outside your team (private link, no account, expires in 7 days)" value={outside} onChange={setOutside} max={3} placeholder="name@example.org" />
        <Field label="Answer by">
          <div className="flex flex-wrap gap-1.5">
            {[2, 3, 5].map((d) => (
              <button key={d} type="button" className="aj-pill" data-active={due === d} onClick={() => setDue(d)}>
                {shortDate(addDays(s.today, d))}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Approval needs">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="aj-pill" data-active={rule === 'any'} onClick={() => setRule('any')}>
              Any one reviewer
            </button>
            <button type="button" className="aj-pill" data-active={rule === 'all'} onClick={() => setRule('all')}>
              Every reviewer
            </button>
          </div>
        </Field>
        <Field label="Note (optional)">
          <textarea style={{ ...inputStyle, minHeight: 64 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything they should look at" />
        </Field>
        <p className="aj-faint" style={{ margin: 0 }}>
          Reviewers can comment, suggest edits, approve, or ask for changes. You get each answer by email and in your decision inbox. An approval covers this version; a later content change resets it.
        </p>
      </div>
    </Dialog>
  );
}

function VersionsDialog({ job, onClose }: { job: DemoJob; onClose: () => void }) {
  return (
    <Dialog title="Versions" subtitle={`${job.versions.length} saved`} onClose={onClose}>
      <ul className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {[...job.versions].reverse().map((v, i) => (
          <li key={v.n} className="aj-card flex items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <div style={{ fontWeight: 650 }}>
                Version {v.n}
                {i === 0 ? ' · current' : ''}
                {job.review.approvedVersion === v.n ? ' · approved' : ''}
              </div>
              <div className="aj-muted truncate">{v.note}</div>
            </div>
            {i > 0 && (
              <button
                type="button"
                className="aj-pill"
                onClick={() => {
                  restoreVersion(job.id, v.n);
                  onClose();
                }}
              >
                Restore
              </button>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function ReviewerBar({ job, s }: { job: DemoJob; s: State }) {
  const [note, setNote] = useState('');
  const me = s.team.find((p) => p.id === s.reviewerAs);
  const mine = job.review.reviewers.find((r) => r.name === me?.name);
  if (!me) return null;
  if (!mine)
    return (
      <div className="aj-card p-3 aj-muted">
        {me.name} is not a reviewer on this job. Switch reviewer in the top bar, or send it for review first.
      </div>
    );
  return (
    <div className="aj-card flex flex-col gap-2 p-3" style={{ borderColor: 'var(--sage-3)' }}>
      <div className="flex items-center gap-2" style={{ fontWeight: 650 }}>
        <UserCheck size={15} strokeWidth={1.8} /> Reviewing as {me.name}
        {mine.decision && <span className="aj-chip" data-tone={mine.decision === 'approved' ? 'sage' : 'amber'}>{mine.decision === 'approved' ? 'You approved' : 'You asked for changes'}</span>}
      </div>
      <span className="aj-muted">Comment or suggest on any section, then decide. {job.review.due ? `Answer by ${longDate(job.review.due)}.` : ''}</span>
      <textarea style={{ ...inputStyle, minHeight: 56 }} placeholder="A note for the author (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note for the author" />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="aj-ink-btn" onClick={() => reviewerDecision(job.id, 'approved', note)}>
          <Check size={14} strokeWidth={2} /> Approve
        </button>
        <button type="button" className="aj-pill" onClick={() => reviewerDecision(job.id, 'changes', note)}>
          Request changes
        </button>
      </div>
    </div>
  );
}

function ReviewSummary({ job, s }: { job: DemoJob; s: State }) {
  if (job.review.state === 'none') return null;
  const open = job.review.remarks.filter((r) => r.state === 'open').length;
  return (
    <div className="aj-card flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2" style={{ fontWeight: 650 }}>
        <UserCheck size={15} strokeWidth={1.8} /> {statusLine(s, job)}
      </div>
      <ul className="flex flex-col gap-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {job.review.reviewers.map((r) => (
          <li key={r.email} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">
              {r.name}
              {r.outside ? ' · outside, private link' : ''}
            </span>
            <span className="aj-chip" data-tone={r.decision === 'approved' ? 'sage' : r.decision === 'changes' ? 'amber' : undefined}>
              {r.decision === 'approved' ? 'Approved' : r.decision === 'changes' ? 'Changes' : 'Waiting'}
            </span>
          </li>
        ))}
      </ul>
      {open > 0 && <span className="aj-muted">{open} open {open === 1 ? 'comment' : 'comments'} on the sections below.</span>}
      <span className="aj-faint" style={{ fontSize: 11 }}>
        {job.review.rule === 'any' ? 'Any one approval is enough.' : 'Every reviewer must approve.'} Reminders go out the day before the due date.
      </span>
    </div>
  );
}

export default function Studio({ id }: { id?: string }) {
  const s = useDemo();
  const phone = useIsPhone();
  const job = s.jobs.find((j) => j.id === id);
  const [text, setText] = useState('');
  const [writing, setWriting] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);

  if (!job) {
    return (
      <div className="mx-auto max-w-[560px] p-6">
        <p className="aj-muted">This job is not in the demo any more.</p>
        <button type="button" className="aj-ink-btn" onClick={() => go('home')}>
          Back to home
        </button>
      </div>
    );
  }

  const reviewing = Boolean(s.reviewerAs);
  const last = job.chat[job.chat.length - 1];
  const write = canWrite(job);
  const required = approvalRequired(s, job);
  const approved = isApproved(job) || job.status === 'approved';
  const blocked = required && !approved;
  const start = () => {
    setWriting(true);
    setTimeout(() => {
      writeDraft(job.id);
      setWriting(false);
    }, 900);
  };

  const chat = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {phone && <FactStrip job={job} readOnly={reviewing} />}
      <div className="aj-scroll flex min-h-0 flex-1 flex-col gap-2 pr-1" aria-live="polite" aria-label="Conversation">
        {job.chat.map((m) => (
          <div key={m.id} className="ej-bubble" data-from={m.from}>
            {rich(m.text)}
          </div>
        ))}
        {writing && (
          <div className="ej-bubble" data-from="ai">
            <Sparkles size={13} strokeWidth={2} className="mr-1 inline" /> Writing… (simulated)
          </div>
        )}
        {last?.from === 'ai' && last.quick && !reviewing && (
          <div className="flex flex-wrap gap-1.5">
            {last.quick.map((q) =>
              q === 'Write the description' ? (
                <button key={q} type="button" className="aj-ink-btn" onClick={start} disabled={!write.ok || writing}>
                  <Sparkles size={13} strokeWidth={2} /> Write the description
                </button>
              ) : (
                <button key={q} type="button" className="aj-pill" onClick={() => sendChat(job.id, q)}>
                  {q}
                </button>
              ),
            )}
          </div>
        )}
      </div>
      {!reviewing && (
        <>
          <TagBar job={job} s={s} />
          {!job.sections.length && !last?.quick?.includes('Write the description') && (
            <button type="button" className="aj-ink-btn self-start" onClick={start} disabled={!write.ok || writing} title={write.why}>
              <Sparkles size={14} strokeWidth={2} /> {write.ok ? 'Write the description' : write.why}
            </button>
          )}
          <Composer
            value={text}
            onChange={setText}
            onSend={(v) => {
              sendChat(job.id, v);
              setText('');
            }}
            suggestion={!job.sections.length && !job.facts.title && text ? suggestNext(text, s.today) : ''}
            placeholder={job.sections.length ? 'Ask for a change: "shorten the responsibilities", "add French"…' : 'Answer, or add details'}
            label="Message the generator"
          />
        </>
      )}
    </div>
  );

  const doc = job.sections.length ? (
    <div className="flex flex-col gap-3">
      {!phone && <FactStrip job={job} readOnly={reviewing} />}
      <ReviewSummary job={job} s={s} />
      {reviewing && <ReviewerBar job={job} s={s} />}
      <Document job={job} s={s} />
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      {!phone && <FactStrip job={job} />}
      <div className="aj-card flex flex-col items-center gap-2 p-8 text-center aj-muted">
        <FileText size={22} strokeWidth={1.5} />
        The description appears here once it is written.
        <span className="aj-faint">Choose at least 3 sections, answer any questions, then write.</span>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 aj-hair lg:px-6">
        <button type="button" className="aj-icon-btn" onClick={() => go('home')} aria-label="Back to home">
          <ArrowLeft size={15} strokeWidth={1.8} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate" style={{ fontWeight: 700 }}>
            {job.facts.title || 'New job'}
          </div>
          <div className="aj-faint truncate" style={{ fontSize: 11 }}>
            {statusLine(s, job)}
            {job.facts.deadline && daysUntil(s.today, job.facts.deadline) >= 0 ? ` · closes ${shortDate(job.facts.deadline)}` : ''}
          </div>
        </div>
        <PlanBadge plan={job.plan} />
        {job.versions.length > 0 && (
          <button type="button" className="aj-icon-btn" onClick={() => setVersionsOpen(true)} aria-label="Versions">
            <History size={15} strokeWidth={1.8} />
          </button>
        )}
        {!reviewing && job.sections.length > 0 && job.status !== 'live' && (
          <span className="hidden sm:inline-flex">
            <button type="button" className="aj-pill" onClick={() => setReviewOpen(true)}>
              <UserCheck size={14} strokeWidth={1.8} /> {job.review.state === 'none' ? 'Send for review' : 'Review again'}
            </button>
          </span>
        )}
        {!reviewing && job.sections.length > 0 && job.status !== 'live' && (
          <button type="button" className="aj-ink-btn" onClick={() => go('publish', job.id)} title={blocked ? 'Approval is required before publishing' : undefined}>
            {blocked ? 'Publish…' : 'Review & publish'}
          </button>
        )}
        {job.status === 'live' && (
          <button type="button" className="aj-ink-btn" onClick={() => go('jobs', job.id)}>
            Done editing
          </button>
        )}
      </div>

      {phone ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
          {reviewing && job.sections.length > 0 ? doc : chat}
          {!reviewing && job.sections.length > 0 && (
            <div className="flex gap-1.5">
              <button type="button" className="aj-pill flex-1 justify-center" onClick={() => setDocOpen(true)}>
                <FileText size={14} strokeWidth={1.8} /> Document · {job.sections.length} sections
              </button>
              {job.status !== 'live' && (
                <button type="button" className="aj-pill" onClick={() => setReviewOpen(true)} aria-label="Send for review">
                  <UserCheck size={14} strokeWidth={1.8} />
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {!reviewing && <div className="flex min-h-0 w-[42%] min-w-[360px] max-w-[520px] flex-col border-r p-4 aj-hair">{chat}</div>}
          <div className="aj-scroll min-h-0 flex-1 p-4 lg:p-6">{doc}</div>
        </div>
      )}

      {docOpen && (
        <Dialog title="Document" subtitle={`${job.sections.length} sections`} onClose={() => setDocOpen(false)} wide>
          {doc}
        </Dialog>
      )}
      {reviewOpen && <ReviewDialog job={job} s={s} onClose={() => setReviewOpen(false)} />}
      {versionsOpen && <VersionsDialog job={job} onClose={() => setVersionsOpen(false)} />}
    </div>
  );
}

export function setReviewer(id: string | null) {
  update((s) => ({ ...s, reviewerAs: id }));
}
