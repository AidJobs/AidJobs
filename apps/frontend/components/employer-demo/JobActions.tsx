'use client';

import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useIsPhone } from '@/components/site/BottomSheet';
import { canDelete, closeJob, deleteJob, involved, type Tell } from './actions';
import { longDate } from './engine';
import { isPublished, KEEP_DELETED_DAYS } from './lifecycle';
import MenuButton, { type MenuAction } from './MenuButton';
import { hasFreeUse, monthName } from './plans';
import type { DemoJob, State } from './types';
import { Dialog, inputStyle } from './ui';

function jobLabel(job: DemoJob): string {
  const city = job.facts.location.split(',')[0];
  return `${job.facts.title || 'Untitled job'}${city ? ` – ${city}` : ''}`;
}

/** The "⋯" menu of a job: a short list on a desktop, a bottom sheet on a phone. */
export function JobMenu({ job, actions }: { job: DemoJob; actions: MenuAction[] }) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const label = `Actions for ${job.facts.title || 'this job'}`;
  if (!actions.length) return null;
  if (!phone) return <MenuButton label={label} trigger={<MoreHorizontal size={15} strokeWidth={1.8} />} actions={actions} />;
  return (
    <>
      <button type="button" className="aj-icon-btn" aria-label={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <MoreHorizontal size={15} strokeWidth={1.8} />
      </button>
      {open && (
        <Dialog title={job.facts.title || 'Untitled job'} subtitle="Actions" onClose={() => setOpen(false)} half>
          <div className="flex flex-col gap-1">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className="ej-menu-item"
                data-danger={a.danger ? 'true' : undefined}
                style={{ minHeight: 44 }}
                onClick={() => {
                  setOpen(false);
                  a.run();
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}

/** Deleting a job at any stage (plan section 17, decision 2): what goes, what stays, who is told, and 14 days to restore it. */
export function DeleteDialog({ job, s, onClose, onDeleted }: { job: DemoJob; s: State; onClose: () => void; onDeleted?: () => void }) {
  const people = involved(s, job);
  const [tell, setTell] = useState<Tell>({ reviewers: people.reviewers.length > 0 });
  const [typed, setTyped] = useState('');
  const block = canDelete(s, job);
  const published = isPublished(job);
  const title = job.facts.title || 'Untitled job';
  const confirmed = !published || typed.trim().toLowerCase() === title.trim().toLowerCase();
  const waiting = [...(job.reach?.candidates ?? []), ...(job.reach?.team ?? [])].filter((r) => r.status === 'waiting').length;
  const freeMonth = s.freeUses.find((u) => u.jobId === job.id)?.month;
  const cancels = [
    job.status === 'scheduled' && job.scheduledFor ? `its go-live on ${longDate(job.scheduledFor)}` : '',
    waiting ? `${waiting} Reach ${waiting === 1 ? 'email' : 'emails'} waiting for go-live` : '',
    job.payRequest ? `the request to ${job.payRequest.name} to pay ${job.payRequest.amount}` : '',
    job.status === 'live' ? 'the job comes off AidJobs at once' : '',
  ].filter(Boolean);
  const groups: Array<{ key: keyof Tell; label: string }> = [
    ...(people.reviewers.length ? [{ key: 'reviewers' as const, label: `Reviewers: ${people.reviewers.join(', ')}` }] : []),
    ...(people.payer ? [{ key: 'payer' as const, label: `${people.payer}, asked to pay` }] : []),
    ...(people.reach ? [{ key: 'reach' as const, label: `The ${people.reach} people Reach invited` }] : []),
    ...(people.team.length ? [{ key: 'team' as const, label: `Your team: ${people.team.join(', ')}` }] : []),
  ];
  return (
    <Dialog
      title={`Delete “${title}”?`}
      subtitle="Simulated · nothing leaves this browser"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {block && <span className="aj-faint mr-auto">{block}.</span>}
          <button type="button" className="aj-pill" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="aj-ink-btn"
            style={{ background: 'var(--red)', borderColor: 'var(--red)', color: '#fff', opacity: block || !confirmed ? 0.45 : 1 }}
            disabled={Boolean(block) || !confirmed}
            onClick={() => {
              if (deleteJob(job.id, tell)) {
                onClose();
                onDeleted?.();
              }
            }}
          >
            Delete
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <strong>Deleted</strong>
          <span className="aj-muted">Its text, versions, comments and suggestions, language versions, Reach lists and messages, and its history.</span>
        </div>
        <div className="flex flex-col gap-1">
          <strong>Kept</strong>
          <ul className="aj-muted" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Receipts and invoices, which the law requires.</li>
            {freeMonth && hasFreeUse(s, job.id) && <li>The free job it used still counts for {monthName(freeMonth)}.</li>}
            <li>One line in your organisation&apos;s activity log: who deleted it, and when. Never public.</li>
            {published && <li>Links already shared open a page saying &ldquo;This vacancy is no longer available&rdquo;.</li>}
          </ul>
        </div>
        {cancels.length > 0 && (
          <div className="flex flex-col gap-1">
            <strong>Also cancelled</strong>
            <span className="aj-muted">{cancels.join('; ').replace(/^./, (c) => c.toUpperCase())}.</span>
          </div>
        )}
        {job.plan === 'amplify' && <span className="aj-muted">A paid job is not refunded.</span>}
        {groups.length > 0 && (
          <fieldset className="flex flex-col gap-1.5" style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={{ fontWeight: 650, padding: 0, marginBottom: 4 }}>Tell the people involved</legend>
            {groups.map((g) => (
              <label key={g.key} className="flex items-start gap-2" style={{ cursor: 'pointer' }}>
                <input type="checkbox" className="mt-0.5" checked={Boolean(tell[g.key])} onChange={(e) => setTell({ ...tell, [g.key]: e.target.checked })} />
                <span>{g.label}</span>
              </label>
            ))}
            <span className="aj-faint">They receive: &ldquo;{s.org.name} has deleted the vacancy {jobLabel(job)}. Nothing more is needed from you.&rdquo;</span>
          </fieldset>
        )}
        {published && (
          <label className="flex flex-col gap-1">
            <span>
              Type the job title, <strong>{title}</strong>, to confirm
            </span>
            <input style={inputStyle} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
        )}
        <span className="aj-faint">It stays in Recently deleted for {KEEP_DELETED_DAYS} days, where you can restore it; then it is erased.</span>
      </div>
    </Dialog>
  );
}

/** Withdrawing a live job: cancelled, not filled. The reason is for the history only. */
export function WithdrawDialog({ job, onClose }: { job: DemoJob; onClose: () => void }) {
  const reached = (job.reach?.candidates.length ?? 0) + (job.reach?.team.length ?? 0);
  const [reason, setReason] = useState('');
  const [tell, setTell] = useState(false);
  return (
    <Dialog
      title="Withdraw this vacancy?"
      subtitle={job.facts.title}
      onClose={onClose}
      half
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="aj-pill" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="aj-ink-btn"
            onClick={() => {
              closeJob(job.id, 'withdrawn', tell && reached > 0, reason);
              onClose();
            }}
          >
            Withdraw
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p style={{ margin: 0 }}>The job closes now, and its page says &ldquo;This vacancy has been withdrawn&rdquo;. It is not deleted: links already shared keep working.</p>
        <textarea style={{ ...inputStyle, minHeight: 60 }} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason (optional, for the history)" placeholder="Reason (optional, kept in the job's history only), for example: the funding was not renewed." />
        {reached > 0 && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} /> Tell the {reached} people it was shared with (simulated)
          </label>
        )}
      </div>
    </Dialog>
  );
}
