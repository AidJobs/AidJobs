'use client';

import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useIsPhone } from '@/components/site/BottomSheet';
import { backToDraft, canDelete, closeJob, declineTell, deleteJob, involved, publishNow, reschedule, rescheduleBlock, tellInvited, type Tell } from './actions';
import { changeSummary, tellOffer } from './changes';
import { addDays, isoDay, longDate } from './engine';
import { invitedCount, reachRoom } from './invites';
import { jobUrl } from './links';
import { isPublished, KEEP_DELETED_DAYS } from './lifecycle';
import MenuButton, { type MenuAction } from './MenuButton';
import { currentMonth, hasFreeUse, LISTED_DAYS, monthName } from './plans';
import { go } from './store';
import type { DemoJob, State } from './types';
import { DemoMark, Dialog, inputStyle } from './ui';

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
  const groups: Array<{ key: keyof Tell; label: string; off?: boolean }> = [
    ...(people.reviewers.length ? [{ key: 'reviewers' as const, label: `Reviewers: ${people.reviewers.join(', ')}` }] : []),
    ...(people.payer ? [{ key: 'payer' as const, label: `${people.payer}, asked to pay` }] : []),
    ...(people.reach ? [{ key: 'reach' as const, label: `The ${people.reach} people Reach invited${people.reach > reachRoom(job) ? ` (only ${reachRoom(job)} Reach emails left)` : `: uses ${people.reach} of the job's ${reachRoom(job)} Reach emails left`}`, off: people.reach > reachRoom(job) }] : []),
    ...(people.team.length ? [{ key: 'team' as const, label: `Your team: ${people.team.join(', ')}` }] : []),
  ];
  return (
    <Dialog
      title={`Delete “${title}”?`}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {block && <span className="aj-faint mr-auto">{block}.</span>}
          <button type="button" className="aj-pill" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="aj-ink-btn ej-danger-btn"
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
        <span className="self-start">
          <DemoMark label="Simulated · nothing leaves this browser" />
        </span>
        <div className="flex flex-col gap-1">
          <strong>Deleted</strong>
          <span className="aj-muted">Its text, versions, comments and suggestions, language versions, Reach lists and messages, and its history.</span>
        </div>
        <div className="flex flex-col gap-1">
          <strong>Kept</strong>
          <ul className="aj-muted" style={{ margin: 0, paddingLeft: 18, listStyle: 'disc' }}>
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
              <label key={g.key} className="flex items-start gap-2" style={{ cursor: g.off ? 'default' : 'pointer' }}>
                <input type="checkbox" className="mt-0.5" checked={Boolean(tell[g.key]) && !g.off} disabled={g.off} onChange={(e) => setTell({ ...tell, [g.key]: e.target.checked })} />
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
        <span className="aj-faint">
          It stays in Recently deleted for {KEEP_DELETED_DAYS} days, where you can restore it{job.status === 'scheduled' ? ' as a draft, its go-live still cancelled' : ''}; then it is erased.
        </span>
      </div>
    </Dialog>
  );
}

/** "Tell the people Reach invited" when a job closes: each notice is a Reach email and counts toward the job's allowance. */
export function TellInvited({ job, checked, onChange, what }: { job: DemoJob; checked: boolean; onChange: (on: boolean) => void; what: string }) {
  const count = invitedCount(job);
  const room = reachRoom(job);
  if (!count) return null;
  const short = count > room;
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-0.5" checked={checked && !short} disabled={short} onChange={(e) => onChange(e.target.checked)} />
      <span>
        Tell the {count} {count === 1 ? 'person' : 'people'} Reach invited {what} (simulated)
        <span className="aj-faint block">{short ? `Only ${room} Reach emails left for this job.` : `Uses ${count} of the ${room} Reach emails left for this job.`}</span>
      </span>
    </label>
  );
}

/** Withdrawing a live job: cancelled, not filled. The reason is for the history only. */
export function WithdrawDialog({ job, onClose }: { job: DemoJob; onClose: () => void }) {
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
              closeJob(job.id, 'withdrawn', tell, reason);
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
        <TellInvited job={job} checked={tell} onChange={setTell} what="that it has been withdrawn" />
      </div>
    </Dialog>
  );
}

function waitingFor(job: DemoJob): number {
  return [...(job.reach?.candidates ?? []), ...(job.reach?.team ?? [])].filter((r) => r.status === 'waiting').length;
}

const emails = (n: number) => `${n} Reach ${n === 1 ? 'email' : 'emails'}`;

function Footer({ onClose, label, disabled, run }: { onClose: () => void; label: string; disabled?: boolean; run: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" className="aj-pill" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="aj-ink-btn" disabled={disabled} onClick={run}>
        {label}
      </button>
    </div>
  );
}

/** Publishing a scheduled job today (plan section 17, phase 2), with what Reach sends now. */
export function PublishNowDialog({ job, onClose }: { job: DemoJob; onClose: () => void }) {
  const waiting = waitingFor(job);
  return (
    <Dialog title="Publish now?" subtitle={job.facts.title} onClose={onClose} half footer={<Footer onClose={onClose} label="Publish now" run={() => publishNow(job.id) && onClose()} />}>
      <div className="flex flex-col gap-2">
        <p style={{ margin: 0 }}>
          It goes live today instead of on {job.scheduledFor ? longDate(job.scheduledFor) : 'its date'}, listed {LISTED_DAYS[job.plan ?? 'free']} days from today.
        </p>
        {waiting > 0 && <span className="aj-muted">The {emails(waiting)} waiting for go-live are sent now (simulated).</span>}
      </div>
    </Dialog>
  );
}

/** Moving a scheduled job to another date: the same checks as scheduling; its waiting Reach emails move too. */
export function RescheduleDialog({ job, s, onClose }: { job: DemoJob; s: State; onClose: () => void }) {
  const [date, setDate] = useState(job.scheduledFor ?? addDays(s.today, 1));
  const block = rescheduleBlock(s, job, date);
  const waiting = waitingFor(job);
  const max = job.facts.deadline ? addDays(new Date(`${job.facts.deadline}T12:00:00`).getTime(), -1) : undefined;
  return (
    <Dialog title="Change the publishing date" subtitle={job.facts.title} onClose={onClose} half footer={<Footer onClose={onClose} label={block ?? `Move to ${longDate(date)}`} disabled={Boolean(block)} run={() => reschedule(job.id, date) && onClose()} />}>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span>Goes live on</span>
          <input type="date" style={inputStyle} value={date} min={addDays(s.today, 1)} max={max} onChange={(e) => setDate(e.target.value)} />
        </label>
        <span className="aj-muted">
          From tomorrow{job.facts.deadline ? `, and before it closes on ${longDate(job.facts.deadline)}` : ''}
          {job.plan === 'free' ? `; a free job goes live within ${monthName(currentMonth(s))}` : ''}. Today is {longDate(isoDay(s.today))}.
        </span>
        {waiting > 0 && <span className="aj-muted">The {emails(waiting)} waiting for go-live move to the new date.</span>}
      </div>
    </Dialog>
  );
}

/** A scheduled job back to a draft: nothing goes live, nothing is lost. */
export function BackToDraftDialog({ job, s, onClose }: { job: DemoJob; s: State; onClose: () => void }) {
  const waiting = waitingFor(job);
  const counted = s.freeUses.find((u) => u.jobId === job.id)?.month;
  return (
    <Dialog title="Back to a draft?" subtitle={job.facts.title} onClose={onClose} half footer={<Footer onClose={onClose} label="Back to a draft" run={() => backToDraft(job.id) && onClose()} />}>
      <div className="flex flex-col gap-2">
        <p style={{ margin: 0 }}>It will not go live on {job.scheduledFor ? longDate(job.scheduledFor) : 'its date'}. You can edit it and publish it again at any time.</p>
        {waiting > 0 && <span className="aj-muted">The {emails(waiting)} stay prepared, unsent.</span>}
        {job.payRequest && <span className="aj-muted">The request to {job.payRequest.name} to pay {job.payRequest.amount} is cancelled.</span>}
        <span className="aj-muted">{job.plan === 'amplify' ? 'It stays paid for: publishing it again costs nothing.' : `The free job it counted stays counted${counted ? ` for ${monthName(counted)}` : ''}.`}</span>
      </div>
    </Dialog>
  );
}

/** Telling the people Reach invited about an important change (decision 7): the email first, then send or not. */
export function TellDialog({ job, s, onClose }: { job: DemoJob; s: State; onClose: () => void }) {
  const offer = tellOffer(job);
  if (!offer) return null;
  const room = reachRoom(job);
  const short = offer.count > room;
  return (
    <Dialog
      title="Tell the people Reach invited?"
      subtitle={job.facts.title}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {short && <span className="aj-faint mr-auto">Only {room} Reach emails left for this job.</span>}
          <button
            type="button"
            className="aj-pill"
            onClick={() => {
              declineTell(job.id);
              onClose();
            }}
          >
            Not now
          </button>
          <button type="button" className="aj-ink-btn" disabled={short} onClick={() => tellInvited(job.id) && onClose()}>
            Send to {offer.count} people
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <span className="self-start">
          <DemoMark label="Simulated · nothing leaves this browser" />
        </span>
        <div className="ej-email" aria-label="The email">
          <div className="ej-email-head">
            <div>
              <strong>From:</strong> {s.org.name} via AidJobs &lt;jobs@aidjobs.example.org&gt;
            </div>
            <div>
              <strong>To:</strong> the {offer.count} people already invited, each their own email
            </div>
            <div>
              <strong>Subject:</strong> Update: {job.facts.title}
            </div>
          </div>
          <div className="ej-email-body">
            <p>Hello,</p>
            <p>{s.org.name} has updated the vacancy {job.facts.title}:</p>
            <ul style={{ paddingLeft: 18, listStyle: 'disc' }}>
              {offer.changes.map((c) => (
                <li key={c.key}>
                  {c.label}: {c.from} → <strong>{c.to}</strong>
                </li>
              ))}
            </ul>
            <p>
              <a className="ej-email-btn" href={jobUrl(job)} target="_blank" rel="noopener noreferrer">
                View Job &amp; Apply
              </a>
            </p>
            <p style={{ whiteSpace: 'pre-line' }}>{`Best regards,\n${s.org.name}`}</p>
          </div>
        </div>
        <span className="aj-muted">
          To the {offer.count} people already invited; it uses {offer.count} of the {room} Reach emails left for this job. Offered once for this change: {changeSummary(offer.changes)}.
        </span>
      </div>
    </Dialog>
  );
}
