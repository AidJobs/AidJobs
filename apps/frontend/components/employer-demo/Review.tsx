'use client';

import { BellRing, Check, Send, UserCheck, X } from 'lucide-react';
import { useState } from 'react';
import { addRemark, approvalRequired, changedSinceLastRound, changesAfterApproval, isReviewable, remindReviewers, restoreVersion, reviewerDecision, sendForReview, settleRemark } from './actions';
import { addDays, daysUntil, longDate, shortDate } from './engine';
import { statusLine } from './Home';
import { update } from './store';
import type { DemoJob, State } from './types';
import { Dialog, Field, inputStyle, RecipientInput } from './ui';

export function setReviewer(id: string | null) {
  update((s) => ({ ...s, reviewerAs: id }));
}

export function ReviewDialog({ job, s, onClose }: { job: DemoJob; s: State; onClose: () => void }) {
  return (
    <Dialog title="Send for review" subtitle="Optional" onClose={onClose}>
      <ReviewForm job={job} s={s} onSent={onClose} />
    </Dialog>
  );
}

/**
 * Who reviews, by when, under which rule, and a note, with the email they get: in a dialog, or in the window's Review email tab and
 * the chat's card (section 19, step 9). `preset`: people named in the chat, by name.
 */
export function ReviewForm({ job, s, onSent, preset }: { job: DemoJob; s: State; onSent: () => void; preset?: string[] }) {
  const candidates = s.team.filter((p) => p.id !== s.me.id);
  const named = preset?.length ? candidates.filter((p) => preset.some((n) => p.name.toLowerCase().startsWith(n.toLowerCase()))).map((p) => p.id) : [];
  const [picked, setPicked] = useState<string[]>(named.length ? named : candidates.filter((p) => p.role === 'reviewer').map((p) => p.id));
  const [outside, setOutside] = useState<string[]>([]);
  const [due, setDue] = useState(3);
  const [rule, setRule] = useState<'any' | 'all'>(s.org.approvalRule);
  const [note, setNote] = useState('');
  const total = picked.length + outside.length;
  const names = [...candidates.filter((p) => picked.includes(p.id)).map((p) => p.name.split(' ')[0]), ...outside];
  return (
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
        <div className="flex flex-col gap-1 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
          <span className="aj-faint">The email they get</span>
          <strong>
            {s.me.name} asks you to review {job.facts.title || 'a job'} by {longDate(addDays(s.today, due))}
          </strong>
          {note.trim() && <span className="aj-muted">&ldquo;{note.trim()}&rdquo;</span>}
          <span className="aj-muted">A link opens the job to read, comment, suggest changes, and approve or ask for changes{outside.length ? '; outside reviewers get a private link that expires in 7 days, with no account' : ''}.</span>
        </div>
        <p className="aj-faint" style={{ margin: 0 }}>
          Reviewers can comment, suggest edits, approve, or ask for changes. You get each answer by email and in your decision inbox. An approval covers this version; a later content change resets it.
        </p>
        <div className="flex items-center justify-between gap-2 border-t pt-3 aj-hair">
          <span className="aj-faint">
            {total} {total === 1 ? 'reviewer' : 'reviewers'} · simulated, nothing is sent
          </span>
          <button
            type="button"
            className="aj-ink-btn"
            disabled={total === 0}
            onClick={() => {
              sendForReview(job.id, [...candidates.filter((p) => picked.includes(p.id)).map((p) => ({ name: p.name, email: p.email, outside: false })), ...outside.map((e) => ({ name: e, email: e, outside: true }))], addDays(s.today, due), rule, note);
              onSent();
            }}
          >
            <Send size={14} strokeWidth={2} /> {total ? `Send to ${names.length > 2 ? `${names.length} reviewers` : names.join(' and ')}` : 'Send'}
          </button>
        </div>
      </div>
  );
}

export function VersionsDialog({ job, onClose, readOnly }: { job: DemoJob; onClose: () => void; readOnly?: boolean }) {
  return (
    <Dialog title="Earlier versions" subtitle={`${job.versions.length} saved`} onClose={onClose}>
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
            {i > 0 && !readOnly && (
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

export function ReviewerBar({ job, s }: { job: DemoJob; s: State }) {
  const [note, setNote] = useState('');
  const me = s.team.find((p) => p.id === s.reviewerAs);
  const mine = job.review.reviewers.find((r) => r.name === me?.name);
  if (!me) return null;
  if (!mine) return <div className="aj-card p-3 aj-muted">{me.name} is not a reviewer on this job. Switch reviewer in the top bar, or send it for review first.</div>;
  return (
    <div className="aj-card flex flex-col gap-2 p-3" style={{ borderColor: 'var(--sage-3)' }}>
      <div className="flex items-center gap-2" style={{ fontWeight: 650 }}>
        <UserCheck size={15} strokeWidth={1.8} /> Reviewing as {me.name}
        {mine.decision && (
          <span className="aj-chip" data-tone={mine.decision === 'approved' ? 'sage' : 'amber'}>
            {mine.decision === 'approved' ? 'You approved' : 'You asked for changes'}
          </span>
        )}
      </div>
      <span className="aj-muted">
        {isReviewable(job)
          ? `Comment or suggest on any section, here or on the section itself, then decide. ${job.review.due ? `Answer by ${longDate(job.review.due)}.` : ''}`
          : 'This job is already published. Your answer goes to the author and into its history; it does not change the published job.'}
      </span>
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

export function ReviewSummary({ job, s }: { job: DemoJob; s: State }) {
  if (job.review.state === 'none') return null;
  const waiting = job.review.reviewers.filter((r) => !r.decision).length;
  const late = job.review.due && daysUntil(s.today, job.review.due) < 0;
  return (
    <div className="aj-card flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2" style={{ fontWeight: 650 }}>
        <UserCheck size={15} strokeWidth={1.8} /> {statusLine(s, job)}
      </div>
      <span className="aj-faint">
        Round {job.review.round} · {job.review.rule === 'any' ? 'one approval is enough' : 'every reviewer must approve'}
        {job.review.due ? ` · ${late ? 'was due' : 'due'} ${longDate(job.review.due)}` : ''}
      </span>
      <ul className="flex flex-col gap-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {job.review.reviewers.map((r) => (
          <li key={r.email} className="flex flex-col">
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {r.name}
                {r.outside ? ' · outside, private link' : ''}
              </span>
              <span className="aj-chip" data-tone={r.decision === 'approved' ? 'sage' : r.decision === 'changes' ? 'amber' : undefined}>
                {r.decision === 'approved' ? 'Approved' : r.decision === 'changes' ? 'Changes' : 'Waiting'}
              </span>
            </span>
            {r.note && <span className="aj-faint">&ldquo;{r.note}&rdquo;</span>}
          </li>
        ))}
      </ul>
      {changesAfterApproval(job) && isReviewable(job) && (
        <span className="rounded-xl p-2.5" style={{ background: 'var(--amber-bg)', fontSize: 12.5 }}>
          {changesAfterApproval(job)
            ?.askers.map((a) => a.name.split(' ')[0])
            .join(' and ')}{' '}
          asked for changes after the approval. Under your rule one approval is enough, so whoever publishes decides; publishing anyway is written in the job&apos;s history, and the reviewer is told.
        </span>
      )}
      {!s.reviewerAs && waiting > 0 && job.review.state === 'open' && (
        <button type="button" className="aj-text-btn inline-flex items-center gap-1 self-start" onClick={() => remindReviewers(job.id)}>
          <BellRing size={13} strokeWidth={1.8} /> Remind {waiting === 1 ? 'the reviewer' : `the ${waiting} reviewers`} who {waiting === 1 ? 'has' : 'have'} not answered
          {job.review.reminded ? ` · reminded ${new Date(job.review.reminded).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
        </button>
      )}
    </div>
  );
}

function goToSection(key: string) {
  const el = document.getElementById(`ej-sec-${key}`);
  el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
}

function titleOf(job: DemoJob, key: string): string {
  return job.sections.find((x) => x.key === key)?.title ?? key;
}

/** A reviewer's comment or suggestion from the panel, on a section chosen from a list (also possible on the section itself). */
function AddRemark({ job }: { job: DemoJob }) {
  const [section, setSection] = useState(job.sections[0]?.key ?? '');
  const [kind, setKind] = useState<'comment' | 'suggestion'>('comment');
  const [text, setText] = useState('');
  const [suggest, setSuggest] = useState('');
  return (
    <div className="aj-card flex flex-col gap-2 p-3">
      <span style={{ fontWeight: 650 }}>Add a comment</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <select style={{ ...inputStyle, width: 'auto', minHeight: 32, flex: 1 }} value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section">
          {job.sections.map((sec) => (
            <option key={sec.key} value={sec.key}>
              {sec.title}
            </option>
          ))}
        </select>
        <button type="button" className="aj-pill" style={{ height: 32 }} data-active={kind === 'comment'} onClick={() => setKind('comment')}>
          Comment
        </button>
        <button type="button" className="aj-pill" style={{ height: 32 }} data-active={kind === 'suggestion'} onClick={() => setKind('suggestion')}>
          Suggest text
        </button>
      </div>
      <textarea style={{ ...inputStyle, minHeight: 56 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'comment' ? 'Your comment' : 'Why this change?'} aria-label="Your comment" />
      {kind === 'suggestion' && <textarea style={{ ...inputStyle, minHeight: 48 }} value={suggest} onChange={(e) => setSuggest(e.target.value)} placeholder="Text to add to the section" aria-label="Suggested text" />}
      <button
        type="button"
        className="aj-pill self-start"
        disabled={!text.trim() || !section}
        onClick={() => {
          addRemark(job.id, section, kind, text.trim(), kind === 'suggestion' && suggest.trim() ? `- ${suggest.trim()}` : undefined);
          setText('');
          setSuggest('');
        }}
      >
        Add to {titleOf(job, section)}
      </button>
    </div>
  );
}

/**
 * Review in the workspace's right-hand panel (plan section 16, phase 4), for the author and the reviewer: the status, what changed since the
 * last round, every comment and suggestion with its section, and the decision.
 */
export function ReviewPanel({ job, s, onSend }: { job: DemoJob; s: State; onSend: () => void }) {
  const [settledOpen, setSettledOpen] = useState(false);
  const reviewing = Boolean(s.reviewerAs);
  const open = job.review.remarks.filter((r) => r.state === 'open');
  const settled = job.review.remarks.filter((r) => r.state !== 'open');
  const changed = changedSinceLastRound(job);
  const required = approvalRequired(s, job);
  if (job.review.state === 'none') {
    return (
      <div className="flex flex-col gap-3 p-3">
        <p className="aj-muted" style={{ margin: 0 }}>
          {required ? 'Your organisation asks for approval on this job before it is published.' : 'Review is optional.'}
        </p>
        {isReviewable(job) && (
          <ul className="flex flex-col gap-1.5" style={{ margin: 0, paddingLeft: 18, listStyle: 'disc' }}>
            <li>Ask colleagues, or someone outside with a private link.</li>
            <li>They comment, suggest changes, and approve; they cannot change the job.</li>
            <li>{required ? 'Their answers appear here; you can publish once they approve.' : 'Their answers appear here; publishing does not wait for them.'}</li>
          </ul>
        )}
        {!reviewing && job.sections.length > 0 && isReviewable(job) && (
          <button type="button" className="aj-ink-btn self-start" onClick={onSend}>
            <Send size={14} strokeWidth={2} /> Send for review
          </button>
        )}
        {!isReviewable(job) && <span className="aj-faint">Review happens before publishing; this job is already {job.status === 'closed' ? 'closed' : 'published'}.</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 p-3">
      <ReviewSummary job={job} s={s} />
      {reviewing && <ReviewerBar job={job} s={s} />}
      {changed.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="ej-panel-label">Changed since round {job.review.round - 1}</span>
          <div className="flex flex-wrap gap-1.5">
            {changed.map((k) => (
              <button key={k} type="button" className="aj-pill" style={{ height: 28 }} onClick={() => goToSection(k)}>
                {titleOf(job, k)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="ej-panel-label">Comments and suggestions · {open.length} open</span>
        {open.length === 0 && <span className="aj-muted">{reviewing ? 'Nothing yet. Comment on a section, or below.' : 'Nothing open.'}</span>}
        {open.map((r) => (
          <div key={r.id} className="flex flex-col gap-1 rounded-xl p-2.5" style={{ background: 'var(--amber-bg)' }}>
            <button type="button" className="aj-text-btn self-start" style={{ height: 'auto', padding: 0 }} onClick={() => goToSection(r.section)}>
              {titleOf(job, r.section)}
            </button>
            <span style={{ fontSize: 12.5 }}>
              <strong>{r.author}</strong> {r.kind === 'suggestion' ? 'suggests' : 'commented'}: {r.text}
            </span>
            {r.suggestion && <span style={{ fontSize: 12.5, color: 'var(--sage-8)' }}>+ {r.suggestion.replace(/^- /, '')}</span>}
            {!reviewing && (
              <div className="flex flex-wrap gap-1.5">
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
        {settled.length > 0 && (
          <>
            <button type="button" className="aj-text-btn self-start" aria-expanded={settledOpen} onClick={() => setSettledOpen(!settledOpen)}>
              {settledOpen ? 'Hide' : 'Show'} {settled.length} settled
            </button>
            {settledOpen &&
              settled.map((r) => (
                <span key={r.id} className="aj-faint">
                  {titleOf(job, r.section)}: {r.author}, &ldquo;{r.text}&rdquo; · {r.state}
                </span>
              ))}
          </>
        )}
      </div>
      {reviewing && job.sections.length > 0 && <AddRemark job={job} />}
      {!reviewing && isReviewable(job) && (job.review.state === 'changes' || job.review.reviewers.some((r) => r.decision === 'changes')) && (
        <div className="flex flex-col gap-1.5">
          <span className="aj-muted">When you have made the changes, send it back: the reviewers see only what changed.</span>
          <button type="button" className="aj-ink-btn self-start" onClick={onSend}>
            <Send size={14} strokeWidth={2} /> Send round {job.review.round + 1}
          </button>
        </div>
      )}
      {!reviewing && isReviewable(job) && job.review.state !== 'changes' && !job.review.reviewers.some((r) => r.decision === 'changes') && (
        <button type="button" className="aj-text-btn self-start" onClick={onSend}>
          <Send size={13} strokeWidth={2} /> Review again
        </button>
      )}
    </div>
  );
}
