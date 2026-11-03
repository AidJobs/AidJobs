'use client';

import { Check, Send, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { restoreVersion, reviewerDecision, sendForReview } from './actions';
import { addDays, longDate, shortDate } from './engine';
import { statusLine } from './Home';
import { update } from './store';
import type { DemoJob, State } from './types';
import { Dialog, Field, inputStyle, RecipientInput } from './ui';

export function setReviewer(id: string | null) {
  update((s) => ({ ...s, reviewerAs: id }));
}

export function ReviewDialog({ job, s, onClose }: { job: DemoJob; s: State; onClose: () => void }) {
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
          <span className="aj-faint">
            {total} {total === 1 ? 'reviewer' : 'reviewers'} · simulated, nothing is sent
          </span>
          <button
            type="button"
            className="aj-ink-btn"
            disabled={total === 0}
            onClick={() => {
              sendForReview(job.id, [...candidates.filter((p) => picked.includes(p.id)).map((p) => ({ name: p.name, email: p.email, outside: false })), ...outside.map((e) => ({ name: e, email: e, outside: true }))], addDays(s.today, due), rule, note);
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

export function VersionsDialog({ job, onClose }: { job: DemoJob; onClose: () => void }) {
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

export function ReviewSummary({ job, s }: { job: DemoJob; s: State }) {
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
      {open > 0 && <span className="aj-muted">{open} open {open === 1 ? 'comment' : 'comments'} on the sections.</span>}
    </div>
  );
}
