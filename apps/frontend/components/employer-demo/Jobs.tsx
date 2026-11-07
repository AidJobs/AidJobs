'use client';

import { ArrowLeft, ChevronDown, Copy, History, MapPin, Search, Sparkles, Trash2, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useIsPhone } from '@/components/site/BottomSheet';
import Flag from '@/components/site/Flag';
import { approvedFor, canDelete, closeAtListingEnd, closeJob, downloadCopy, extend, hireAgain, isReviewable, letLeaveList, remindPayer, remindReviewers, reopen, reopenBlock, restoreDeleted } from './actions';
import { changesSince, changeSummary, tellOffer } from './changes';
import BeforePublish from './Checks';
import { addDays, daysUntil, holiday, isoDay, longDate, parseIso, PLACES, shortDate, weekend } from './engine';
import { needsYou, openJob, statusLine } from './Home';
import { BackToDraftDialog, DeleteDialog, JobMenu, PublishNowDialog, RescheduleDialog, TellDialog, WithdrawDialog } from './JobActions';
import { canReopen, erasedOn, graceEnds, inGrace, isPublished, KEEP_DELETED_DAYS, PAGE_REMOVED_DAYS, pageRemoved, TEXT_DROPPED_DAYS, textDropped } from './lifecycle';
import type { MenuAction } from './MenuButton';
import { BADGE, delisted, listedUntil, listingEnd, listingEndsIn, nextPaidJob, singlePrice, usd } from './plans';
import { JobPageLangs, jobUrl } from './Publish';
import { ReachLog } from './Reach';
import { go, notify, useDemo } from './store';
import type { DemoJob, State } from './types';
import { Dialog, HeaderSlot, inputStyle, Lifeline, PlanBadge, stageOf } from './ui';

const DAY = 86_400_000;

/** A closing date on a weekend or a public holiday at the duty station: candidates may expect the working day before. */
function dateWarnings(job: DemoJob, date: string): string[] {
  const warn: string[] = [];
  if (date && weekend(date)) warn.push(`${longDate(date)} is a weekend`);
  if (date && holiday(date, job.facts.iso)) warn.push(`${longDate(date)} is a public holiday${job.facts.country ? ` in ${job.facts.country}` : ''}`);
  return warn;
}

/** Reopen within the 14 days (decision 5): a new closing date, with Extend's checks; a free job keeps its listing period. */
function ReopenDialog({ job, s, onClose }: { job: DemoJob; s: State; onClose: () => void }) {
  const [date, setDate] = useState(addDays(s.today, 14));
  const ended = job.plan === 'free' && listingEnd(job, s.today) < isoDay(s.today);
  const block = reopenBlock(s, job, date, ended);
  const end = listingEnd(job, s.today);
  return (
    <Dialog
      title="Reopen this job?"
      subtitle={job.facts.title}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="aj-pill" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="aj-ink-btn" disabled={Boolean(block)} onClick={() => reopen(job.id, date, ended) && onClose()}>
            {block ?? (ended ? `Reopen with Amplify · ${nextPaidJob(s) ? 'uses 1 package job' : usd(singlePrice(s).amount)}` : `Reopen until ${longDate(date)}`)}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p style={{ margin: 0 }}>
          {job.facts.title} opens again at the same address, with a new closing date. Its history notes &ldquo;Reopened&rdquo;. The people Reach invited are not emailed again.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[7, 14, 21].map((n) => {
            const d = addDays(s.today, n);
            return (
              <button key={n} type="button" className="aj-pill" data-active={date === d} onClick={() => setDate(d)}>
                {n / 7} {n === 7 ? 'week' : 'weeks'} from today
              </button>
            );
          })}
        </div>
        <input type="date" style={inputStyle} value={date} min={addDays(s.today, 1)} onChange={(e) => setDate(e.target.value)} aria-label="New closing date" />
        {dateWarnings(job, date).map((w) => (
          <span key={w} style={{ color: 'var(--amber)' }}>
            {w}: candidates may expect it to close the working day before.
          </span>
        ))}
        {job.plan === 'free' &&
          (ended ? (
            <span style={{ color: 'var(--amber)' }}>Its free listing period ended on {longDate(end)}. Amplify reopens it, listed until its new closing date. Simulated checkout: no card is charged.</span>
          ) : (
            <span className="aj-muted">A free job keeps its listing period: listed on AidJobs until {longDate(end)}{date > end ? '; after that its page still opens from links' : ''}.</span>
          ))}
        <span className="aj-faint">A proposal in the demo: reopening is a new step in a job&apos;s life, which needs a contract decision before production.</span>
      </div>
    </Dialog>
  );
}

function ExtendDialog({ job, s, onClose }: { job: DemoJob; s: State; onClose: () => void }) {
  const base = job.facts.deadline && daysUntil(s.today, job.facts.deadline) >= 0 ? job.facts.deadline : addDays(s.today, 0);
  const [date, setDate] = useState(addDays(new Date(`${base}T12:00:00`).getTime(), 7));
  const warn = dateWarnings(job, date);
  const days = date ? daysUntil(s.today, date) : 0;
  return (
    <Dialog
      title="Extend the closing date"
      subtitle={job.facts.title}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="aj-pill" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="aj-ink-btn"
            disabled={!date || days < 1}
            onClick={() => {
              extend(job.id, Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${base}T12:00:00`).getTime()) / DAY));
              onClose();
            }}
          >
            Extend to {date ? longDate(date) : '…'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[7, 14, 21].map((n) => {
            const d = addDays(new Date(`${base}T12:00:00`).getTime(), n);
            return (
              <button key={n} type="button" className="aj-pill" data-active={date === d} onClick={() => setDate(d)}>
                +{n / 7} {n === 7 ? 'week' : 'weeks'}
              </button>
            );
          })}
        </div>
        <input type="date" style={inputStyle} value={date} min={addDays(s.today, 1)} onChange={(e) => setDate(e.target.value)} aria-label="New closing date" />
        {warn.map((w) => (
          <span key={w} style={{ color: 'var(--amber)' }}>
            {w}: candidates may expect it to close the working day before.
          </span>
        ))}
        <span className="aj-faint">The people you shared it with are not emailed again. The job page shows the new date at once.</span>
      </div>
    </Dialog>
  );
}

function FilledDialog({ job, onClose }: { job: DemoJob; onClose: () => void }) {
  const reached = (job.reach?.candidates.length ?? 0) + (job.reach?.team.length ?? 0);
  const [tell, setTell] = useState(reached > 0);
  return (
    <Dialog
      title="Position filled"
      subtitle={job.facts.title}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="aj-pill" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="aj-ink-btn"
            onClick={() => {
              closeJob(job.id, 'filled', tell && reached > 0);
              onClose();
            }}
          >
            Close the job
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p style={{ margin: 0 }}>The job closes now. Its page says the position is filled, and it leaves search and Google&apos;s job listings.</p>
        {reached > 0 && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} /> Tell the {reached} people it was shared with that the role is filled (simulated)
          </label>
        )}
      </div>
    </Dialog>
  );
}

function VariantDialog({ job, s, onClose }: { job: DemoJob; s: State; onClose: () => void }) {
  const [place, setPlace] = useState('');
  const options = PLACES.filter((p) => s.org.countries.includes(p.country) && !job.facts.location.startsWith(p.city)).map((p) => p.city);
  return (
    <Dialog
      title="Same role, another place"
      subtitle={job.facts.title}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="aj-pill" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="aj-ink-btn"
            disabled={!place.trim()}
            onClick={() => {
              const id = hireAgain(job.id, place.trim());
              onClose();
              if (id) go('create', id);
            }}
          >
            Create the copy
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button key={o} type="button" className="aj-pill" data-active={place === o} onClick={() => setPlace(o)}>
              {o}
            </button>
          ))}
        </div>
        <input style={inputStyle} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Or type a duty station" aria-label="Duty station" />
        <span className="aj-faint">A new draft with the same text and a new closing date. Duty-station details (security, salary) are refreshed for the new place.</span>
      </div>
    </Dialog>
  );
}

/** The job's link; sharing to WhatsApp, LinkedIn, and the rest is on the public job page, for everyone (plan section 16, decision 8). */
function ShareDialog({ job, onClose }: { job: DemoJob; onClose: () => void }) {
  const url = jobUrl(job);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      notify('Link copied');
    } catch {
      notify('Copy failed: select the link and copy it yourself');
    }
  };
  return (
    <Dialog title="Share" subtitle={job.facts.title} onClose={onClose} half>
      <div className="flex flex-col gap-3">
        <div className="aj-card flex items-center gap-2 py-2 pl-3 pr-2">
          <span className="aj-muted min-w-0 flex-1 truncate">{url}</span>
          <button type="button" className="aj-pill shrink-0" onClick={copy}>
            <Copy size={13} strokeWidth={1.8} /> Copy link
          </button>
        </div>
        <span className="aj-muted">WhatsApp, LinkedIn, and the phone&apos;s share menu are on the job page, for you and every visitor.</span>
        {job.status === 'live' && (
          <button type="button" className="aj-text-btn self-start" onClick={() => go('public', job.id)}>
            Open the job page
          </button>
        )}
      </div>
    </Dialog>
  );
}

type Kind = 'extend' | 'filled' | 'variant' | 'share' | 'withdraw' | 'delete' | 'publishNow' | 'reschedule' | 'backToDraft' | 'tell' | 'reopen';
type Open = (job: DemoJob, kind: Kind) => void;

function openReview(job: DemoJob) {
  try {
    localStorage.setItem('aidjobs.employerDemo.panel', 'review');
  } catch {
    /* storage unavailable: the job opens with its usual panel */
  }
  go('create', job.id);
}

function hire(job: DemoJob) {
  const id = hireAgain(job.id);
  if (id) go('create', id);
}

/** The one next step on a card (plan section 17): what needs the user first, then what fits the job's state. */
export function nextStep(s: State, job: DemoJob, open: Open): { label: string; run: () => void } {
  const left = job.facts.deadline ? daysUntil(s.today, job.facts.deadline) : null;
  if (job.payRequest && job.status !== 'closed') return { label: 'Remind payer', run: () => remindPayer(job.id) };
  if (job.review.state === 'changes' && isReviewable(job)) return { label: 'See request', run: () => openReview(job) };
  if (job.status === 'approved' || (job.status === 'review' && approvedFor(s, job))) return { label: 'Publish', run: () => go('publish', job.id) };
  if (job.status === 'review' && job.review.reviewers.some((r) => !r.decision)) return { label: 'Remind', run: () => remindReviewers(job.id) };
  if (job.status === 'draft' || job.status === 'review') return { label: 'Continue', run: () => go('create', job.id) };
  if (job.status === 'scheduled') return { label: 'Publish now', run: () => open(job, 'publishNow') };
  if (job.status === 'live' && tellOffer(job)) return { label: 'Tell invitees', run: () => open(job, 'tell') };
  if (listingEndsIn(job, s.today) !== null) return { label: 'Choose', run: () => go('jobs', job.id) };
  if (delisted(job, s.today)) return { label: 'Amplify', run: () => go('publish', job.id) };
  if (job.status === 'live') return left !== null && left <= 7 ? { label: 'Extend', run: () => open(job, 'extend') } : { label: 'Share', run: () => open(job, 'share') };
  if (canReopen(job, s.today)) return { label: 'Reopen', run: () => open(job, 'reopen') };
  return { label: 'Hire again', run: () => hire(job) };
}

/** The "⋯" menu, by state (plan section 17, "The menu, by state"); reviewers get none. */
export function menuActions(s: State, job: DemoJob, open: Open): MenuAction[] {
  if (s.reviewerAs) return [];
  const del: MenuAction = { label: 'Delete', danger: true, run: () => open(job, 'delete') };
  const copy: MenuAction = { label: 'Download a copy', run: () => downloadCopy(job, s.org.name) };
  const variant: MenuAction = { label: 'Same role, another place', run: () => open(job, 'variant') };
  if (job.status === 'draft' || job.status === 'review' || job.status === 'approved') {
    return [{ label: 'Continue', run: () => go('create', job.id) }, ...(job.sections.length ? [{ label: 'Send for review', run: () => openReview(job) }, copy] : []), del];
  }
  if (job.status === 'scheduled') {
    return [
      { label: 'Publish now', run: () => open(job, 'publishNow') },
      { label: 'Change the date', run: () => open(job, 'reschedule') },
      { label: 'Back to draft', run: () => open(job, 'backToDraft') },
      { label: 'Edit', run: () => go('create', job.id) },
      del,
    ];
  }
  if (job.status === 'live') {
    return [
      { label: 'Extend', run: () => open(job, 'extend') },
      { label: 'Edit', run: () => go('create', job.id) },
      { label: 'Share', run: () => open(job, 'share') },
      ...(job.plan === 'free' ? [{ label: 'Amplify', run: () => go('publish', job.id) }] : []),
      { label: 'Position filled', run: () => open(job, 'filled') },
      { label: 'Close now', run: () => closeJob(job.id, 'early') },
      { label: 'Withdraw', run: () => open(job, 'withdraw') },
      variant,
      del,
    ];
  }
  return [...(canReopen(job, s.today) ? [{ label: 'Reopen', run: () => open(job, 'reopen') }] : []), { label: 'Hire again', run: () => hire(job) }, copy, variant, del];
}

function JobDialog({ job, s, kind, onClose, onDeleted }: { job: DemoJob; s: State; kind: Kind; onClose: () => void; onDeleted?: () => void }) {
  if (kind === 'extend') return <ExtendDialog job={job} s={s} onClose={onClose} />;
  if (kind === 'filled') return <FilledDialog job={job} onClose={onClose} />;
  if (kind === 'variant') return <VariantDialog job={job} s={s} onClose={onClose} />;
  if (kind === 'share') return <ShareDialog job={job} onClose={onClose} />;
  if (kind === 'withdraw') return <WithdrawDialog job={job} onClose={onClose} />;
  if (kind === 'publishNow') return <PublishNowDialog job={job} onClose={onClose} />;
  if (kind === 'reschedule') return <RescheduleDialog job={job} s={s} onClose={onClose} />;
  if (kind === 'backToDraft') return <BackToDraftDialog job={job} s={s} onClose={onClose} />;
  if (kind === 'tell') return <TellDialog job={job} s={s} onClose={onClose} />;
  if (kind === 'reopen') return <ReopenDialog job={job} s={s} onClose={onClose} />;
  return <DeleteDialog job={job} s={s} onClose={onClose} onDeleted={onDeleted} />;
}

/** One job, two lines tall: title, then place and status; its next step and "⋯" menu. On touch screens a live job swipes: right to extend by a week, left to close. */
function Row({ job, s, open }: { job: DemoJob; s: State; open: Open }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swipeable = job.status === 'live' && !s.reviewerAs;
  const attention = needsYou(s, job);
  const next = nextStep(s, job, open);
  const city = job.facts.location.split(',')[0];
  return (
    <li className="ej-jobitem" style={{ overflow: dx ? 'hidden' : undefined }}>
      {swipeable && dx !== 0 && (
        <div className="absolute inset-0 flex items-center justify-between rounded-[14px] px-5" style={{ background: dx > 0 ? 'var(--sage-2)' : 'var(--red-bg)', color: dx > 0 ? 'var(--sage-8)' : 'var(--red)', fontWeight: 700 }} aria-hidden>
          <span>{dx > 0 ? '+1 week' : ''}</span>
          <span>{dx < 0 ? 'Close now' : ''}</span>
        </div>
      )}
      <div
        className="ej-jobrow ej-swipe"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onTouchStart={(e) => {
          if (!swipeable) return;
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchMove={(e) => {
          if (!start.current) return;
          const mx = e.touches[0].clientX - start.current.x;
          const my = e.touches[0].clientY - start.current.y;
          if (Math.abs(mx) > Math.abs(my)) setDx(Math.max(-120, Math.min(120, mx)));
        }}
        onTouchEnd={() => {
          if (dx > 90) extend(job.id, 7);
          else if (dx < -90) closeJob(job.id, 'early');
          setDx(0);
          start.current = null;
        }}
      >
        <button type="button" className="ej-jobrow-main" onClick={() => openJob(job)}>
          <span className="ej-jobrow-dot" data-on={attention || undefined} aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate" style={{ fontWeight: 650 }}>
                {job.facts.title || 'Untitled draft'}
              </span>
              {job.plan === 'amplify' && <Sparkles size={12} strokeWidth={2} className="shrink-0" style={{ color: 'var(--sage-7)' }} aria-label="Amplified" />}
            </span>
            <span className="aj-faint flex min-w-0 items-center gap-1.5" style={{ fontSize: 12.5 }}>
              {job.facts.iso && <Flag iso={job.facts.iso} title={job.facts.country} />}
              <span className="truncate">
                {city ? `${city} · ` : ''}
                <span style={{ color: attention ? 'var(--amber)' : undefined }}>{statusLine(s, job).replace(/^Live · /, '')}</span>
              </span>
            </span>
            {attention && <span className="sr-only">Needs you</span>}
          </span>
        </button>
        {!s.reviewerAs && (
          <span className="flex shrink-0 items-center gap-1">
            <button type="button" className="aj-pill ej-next" onClick={next.run}>
              {next.label}
            </button>
            <JobMenu job={job} actions={menuActions(s, job, open)} />
          </span>
        )}
      </div>
    </li>
  );
}

const GROUPS = [
  { key: 'needs', label: 'Needs you' },
  { key: 'live', label: 'Live' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'drafts', label: 'Drafts and review' },
  { key: 'closed', label: 'Closed' },
  { key: 'history', label: 'History' },
] as const;

type GroupKey = (typeof GROUPS)[number]['key'];

/** Each job in one group, by what it needs: anything waiting for the user first. */
function groupOf(s: State, j: DemoJob): GroupKey {
  if (needsYou(s, j) || (j.payRequest && j.status !== 'closed')) return 'needs';
  if (j.status === 'live') return 'live';
  if (j.status === 'scheduled') return 'scheduled';
  if (j.status === 'closed') return inGrace(j, s.today) ? 'closed' : 'history';
  return 'drafts';
}

function sortKey(j: DemoJob): number {
  if (j.status === 'live' && j.facts.deadline) return parseIso(j.facts.deadline);
  return -(j.closedAt ?? j.publishedAt ?? j.createdAt);
}

/** One part of a job's page; on phones the parts fold, and "Now" stays open. */
function Part({ title, icon, open = false, className = '', children }: { title: string; icon?: ReactNode; open?: boolean; className?: string; children: ReactNode }) {
  const phone = useIsPhone();
  const [shown, setShown] = useState(open);
  return (
    <section className={`aj-card flex flex-col gap-2 p-3 ${className}`} aria-label={title}>
      {phone ? (
        <button type="button" className="flex w-full items-center gap-1.5 text-left" style={{ border: 'none', background: 'transparent', padding: 0, color: 'inherit', font: 'inherit' }} aria-expanded={shown} onClick={() => setShown(!shown)}>
          <span className="aj-section-label inline-flex flex-1 items-center gap-1" style={{ padding: 0 }}>
            {icon} {title}
          </span>
          <ChevronDown size={15} strokeWidth={1.8} className="aj-faint" style={{ transform: shown ? 'rotate(180deg)' : undefined }} />
        </button>
      ) : (
        <span className="aj-section-label inline-flex items-center gap-1" style={{ padding: 0 }}>
          {icon} {title}
        </span>
      )}
      {(!phone || shown) && children}
    </section>
  );
}

const day = (ms: number) => longDate(isoDay(ms));

/** "Now": what happens next to the job, and when. */
function NowPart({ job, s, open }: { job: DemoJob; s: State; open: Open }) {
  const left = job.facts.deadline ? daysUntil(s.today, job.facts.deadline) : null;
  const changes = job.status === 'live' ? changesSince(job) : [];
  const offer = job.status === 'live' ? tellOffer(job) : null;
  const ends = listingEndsIn(job, s.today);
  const end = listingEnd(job, s.today);
  const owner = !s.reviewerAs;
  const waiting = [...(job.reach?.candidates ?? []), ...(job.reach?.team ?? [])].filter((r) => r.status === 'waiting').length;
  const lines: string[] = [];
  if (job.status === 'live') {
    if (job.facts.deadline) lines.push(`Closes ${longDate(job.facts.deadline)}${left !== null && left >= 0 ? ` · ${left === 0 ? 'today' : `${left} ${left === 1 ? 'day' : 'days'} left`}` : ''}`);
    lines.push(
      delisted(job, s.today)
        ? `Free: no longer listed on AidJobs since ${longDate(end)}; its page still opens from links, with the apply button`
        : `${job.plan === 'amplify' ? `Amplified: featured, “${BADGE}”` : 'Free: standard placement'} · listed until ${longDate(listedUntil(job, s.today))}`,
    );
  } else if (job.status === 'scheduled') {
    lines.push(`Goes live ${job.scheduledFor ? longDate(job.scheduledFor) : 'on its date'}${job.plan === 'amplify' ? ', amplified' : ', free'}`);
    if (waiting) lines.push(`${waiting} Reach ${waiting === 1 ? 'email goes' : 'emails go'} out when it goes live`);
  } else if (job.status === 'closed' && job.closedAt !== undefined) {
    const why = job.closeReason === 'filled' ? 'position filled' : job.closeReason === 'withdrawn' ? 'withdrawn' : job.closeReason === 'early' ? 'closed early' : 'reached its closing date';
    lines.push(`Closed ${day(job.closedAt)}: ${why}`);
    const grace = graceEnds(job);
    lines.push(inGrace(job, s.today) && grace ? `In “Closed” until ${day(grace)}, then it moves to History` : 'In your history');
    const removed = job.closedAt + PAGE_REMOVED_DAYS * DAY;
    const dropped = job.closedAt + TEXT_DROPPED_DAYS * DAY;
    lines.push(s.today < removed ? `Its public page shows “closed” until ${day(removed)}, then it is removed` : 'Its public page has been removed');
    lines.push(s.today < dropped ? `The job description is dropped on ${day(dropped)}; the basic record stays` : 'The job description has been dropped; the basic record stays');
  } else {
    lines.push(`Not published yet · ${statusLine(s, job)}`);
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="aj-muted flex flex-col gap-1" style={{ margin: 0, paddingLeft: 18 }}>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {ends !== null && (
        <div className="flex flex-col gap-1.5 rounded-xl p-3" style={{ background: 'var(--amber-bg)' }} role="status">
          <span style={{ fontWeight: 650 }}>Its free listing ends {ends === 0 ? 'today' : ends === 1 ? 'tomorrow' : `in ${ends} days`}, on {longDate(end)}</span>
          <span className="aj-muted">It closes on {longDate(job.facts.deadline)}. After {longDate(end)} it leaves AidJobs&apos; lists and search; its page still opens from links, with the apply button.</span>
          {owner && (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="aj-ink-btn" onClick={() => go('publish', job.id)}>
                Amplify: listed until it closes
              </button>
              <button type="button" className="aj-pill" onClick={() => closeAtListingEnd(job.id)}>
                Close on {shortDate(end)}
              </button>
              <button type="button" className="aj-pill" onClick={() => letLeaveList(job.id)}>
                Let it leave the list
              </button>
            </div>
          )}
        </div>
      )}
      {changes.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl p-3" style={{ background: 'var(--surface-2)' }} aria-label="Changed since publishing">
          <span style={{ fontWeight: 650 }}>Changed since publishing</span>
          <span className="aj-muted">{changeSummary(changes)}</span>
          {job.editedAt && <span className="aj-faint">The public page says &ldquo;Updated on {new Date(job.editedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}&rdquo;.</span>}
          {offer && owner && (
            <button type="button" className="aj-ink-btn mt-1 self-start" onClick={() => open(job, 'tell')}>
              Tell the {offer.count} people Reach invited
            </button>
          )}
        </div>
      )}
      {job.status === 'live' && job.plan === 'free' && ends === null && owner && (
        <button type="button" className="aj-text-btn self-start" onClick={() => go('publish', job.id)}>
          {delisted(job, s.today) ? 'Amplify to list it again until it closes' : 'Amplify this job'}
        </button>
      )}
      {isPublished(job) && (
        <span className="aj-faint inline-flex items-start gap-1" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>
          <MapPin size={12} strokeWidth={2} className="mt-0.5 shrink-0" /> {jobUrl(job)}
          <span className="sr-only"> (the address never changes when you edit the text)</span>
        </span>
      )}
    </div>
  );
}

/** The main action on a job's page, by state (plan section 17). */
function mainAction(s: State, job: DemoJob, open: Open): { label: string; run: () => void } {
  if (job.status === 'live') return { label: 'Extend', run: () => open(job, 'extend') };
  if (job.status === 'scheduled') return { label: 'Publish now', run: () => open(job, 'publishNow') };
  if (job.status === 'closed') return canReopen(job, s.today) ? { label: 'Reopen', run: () => open(job, 'reopen') } : { label: 'Hire again', run: () => hire(job) };
  return { label: 'Continue', run: () => go('create', job.id) };
}

function JobDetail({ job, s }: { job: DemoJob; s: State }) {
  const [dialog, setDialog] = useState<Kind | null>(null);
  const open: Open = (_j, kind) => setDialog(kind);
  const main = mainAction(s, job, open);
  const improve = job.status === 'live' && job.plan === 'amplify';
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 py-5 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="aj-icon-btn" onClick={() => go('jobs')} aria-label="Back to jobs">
          <ArrowLeft size={15} strokeWidth={1.8} />
        </button>
        <div className="min-w-0 flex-1 basis-[220px]">
          <div className="truncate" style={{ fontWeight: 700, fontSize: 15 }}>
            {job.facts.title}
          </div>
          <div className="aj-faint">
            {job.facts.location ? `${job.facts.location} · ` : ''}
            {statusLine(s, job)}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <PlanBadge plan={job.plan} />
          {!s.reviewerAs && (
            <>
              <button type="button" className="aj-ink-btn" onClick={main.run}>
                {main.label}
              </button>
              <JobMenu job={job} actions={menuActions(s, job, open)} />
            </>
          )}
        </div>
      </div>
      <Lifeline stage={stageOf(job, job.facts.deadline ? daysUntil(s.today, job.facts.deadline) : null)} attention={needsYou(s, job)} />
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]" style={{ gridTemplateRows: improve ? 'auto auto auto 1fr' : 'auto auto 1fr' }}>
        <Part title="Now" open className="lg:col-start-2 lg:row-start-1">
          <NowPart job={job} s={s} open={open} />
        </Part>
        <Part title={job.status === 'closed' ? 'What candidates see' : 'Job page'} className={`lg:col-start-1 lg:row-start-1 lg:p-5 ${improve ? 'lg:row-span-4' : 'lg:row-span-3'}`}>
          {job.status === 'closed' && pageRemoved(job, s.today) && (
            <span className="aj-muted">
              The page has been removed: its link now says &ldquo;This vacancy is no longer available&rdquo;.
              {textDropped(job, s.today) ? ` Its description was dropped ${TEXT_DROPPED_DAYS} days after closing; the basic record stays.` : ' Below is the page as it was.'}
            </span>
          )}
          {textDropped(job, s.today) ? (
            <ul className="aj-muted flex flex-col gap-1" style={{ margin: 0, paddingLeft: 18 }} aria-label="Basic record">
              <li>
                {job.facts.title}, {job.facts.location}
              </li>
              {job.publishedAt && <li>Published {day(job.publishedAt)}</li>}
              {job.closedAt && <li>Closed {day(job.closedAt)}{job.closeReason === 'filled' ? ': position filled' : ''}</li>}
              <li>{job.plan === 'amplify' ? 'Amplified' : 'Free'}</li>
            </ul>
          ) : (
            <JobPageLangs job={job} s={s} />
          )}
        </Part>
        <Part title="Reach" className="lg:col-start-2 lg:row-start-2">
          <ReachLog job={job} s={s} onAmplify={() => go('publish', job.id)} />
        </Part>
        {improve && (
          <Part title="Improve" className="lg:col-start-2 lg:row-start-3">
            <BeforePublish job={job} s={s} amplify schedule={null} url={jobUrl(job)} onChooseAmplify={() => go('publish', job.id)} label={null} />
          </Part>
        )}
        <Part title="History" icon={<History size={12} strokeWidth={2} />} className={`lg:col-start-2 ${improve ? 'lg:row-start-4' : 'lg:row-start-3'}`}>
          <ol className="flex flex-col gap-1.5" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {[...job.audit].reverse().map((a, i) => (
              <li key={i} className="flex flex-col">
                <span>{a.what}</span>
                <span className="aj-faint" style={{ fontSize: 11 }}>
                  {a.who} · {new Date(a.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ol>
        </Part>
      </div>
      {dialog && <JobDialog job={job} s={s} kind={dialog} onClose={() => setDialog(null)} onDeleted={() => go('jobs')} />}
    </div>
  );
}

/** Recently deleted: restorable for 14 days, then erased; with the organisation's activity log. */
function RecentlyDeleted({ s }: { s: State }) {
  const deleted = s.deleted ?? [];
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-4 py-5 lg:px-8 lg:py-8">
      <div className="flex items-center gap-2">
        <button type="button" className="aj-icon-btn" onClick={() => go('jobs')} aria-label="Back to jobs">
          <ArrowLeft size={15} strokeWidth={1.8} />
        </button>
        <h1 className="aj-display aj-h1" style={{ margin: 0 }}>
          Recently deleted
        </h1>
      </div>
      <span className="aj-muted">Deleted jobs can be restored, at the same address, for {KEEP_DELETED_DAYS} days. Then they are erased; receipts and a line in the activity log below stay.</span>
      {deleted.length === 0 ? (
        <div className="aj-card aj-muted p-6">Nothing deleted.</div>
      ) : (
        <ul className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {deleted.map((d) => {
            const block = canDelete(s, d.job);
            return (
              <li key={d.job.id} className="aj-card flex flex-wrap items-center gap-2 p-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span style={{ fontWeight: 650 }}>{d.job.facts.title || 'Untitled job'}</span>
                  <span className="aj-faint">
                    Deleted {day(d.at)} by {d.by}
                    {d.told.length ? `; told ${d.told.join(', ')}` : ''} · erased on {day(erasedOn(d.at))}
                  </span>
                </span>
                <button type="button" className="aj-pill" disabled={Boolean(block)} title={block ?? undefined} onClick={() => restoreDeleted(d.job.id)}>
                  Restore
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <span className="aj-section-label" style={{ padding: 0 }}>
        Activity log
      </span>
      {(s.activity ?? []).length === 0 ? (
        <span className="aj-faint">Nothing yet.</span>
      ) : (
        <ol className="flex flex-col gap-1.5" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {(s.activity ?? []).map((a, i) => (
            <li key={i} className="flex flex-col">
              <span>{a.what}</span>
              <span className="aj-faint" style={{ fontSize: 11 }}>
                {a.who} · {new Date(a.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

type Group = (typeof GROUPS)[number] & { jobs: DemoJob[] };

/** Search: an icon that opens into a field shaped like the chat box; Esc or the cross closes it and clears the search. */
function SearchToggle({ query, setQuery, openField, setOpenField }: { query: string; setQuery: (q: string) => void; openField: boolean; setOpenField: (o: boolean) => void }) {
  const close = () => {
    setQuery('');
    setOpenField(false);
  };
  if (!openField)
    return (
      <button type="button" className="aj-icon-btn shrink-0" onClick={() => setOpenField(true)} aria-label="Search jobs">
        <Search size={15} strokeWidth={1.8} />
      </button>
    );
  return (
    <label className="ej-search">
      <Search size={14} strokeWidth={1.8} className="aj-faint shrink-0" />
      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && close()} placeholder="Title, duty station, or grade" aria-label="Search jobs" />
      <button type="button" className="ej-search-close" onClick={close} aria-label="Close the search">
        <X size={13} strokeWidth={2} />
      </button>
    </label>
  );
}

/** The groups as shortcuts: one tap scrolls to a group; the one in view is marked. */
function Jumps({ groups, active }: { groups: Group[]; active: string | null }) {
  if (groups.length < 2) return null;
  return (
    <nav className="aj-no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto" aria-label="Jump to">
      {groups.map((g) => (
        <button key={g.key} type="button" className="ej-jump" data-active={active === g.key || undefined} onClick={() => document.getElementById(`ej-group-${g.key}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}>
          {g.label} <span className="ej-jump-count">{g.jobs.length}</span>
        </button>
      ))}
    </nav>
  );
}

function JobList({ s }: { s: State }) {
  const phone = useIsPhone();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [dialog, setDialog] = useState<{ job: DemoJob; kind: Kind } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const open: Open = (j, kind) => setDialog({ job: j, kind });
  const q = query.trim().toLowerCase();
  const found = s.jobs.filter((j) => !q || [j.facts.title, j.facts.location, j.facts.grade].some((x) => x.toLowerCase().includes(q)));
  const groups: Group[] = GROUPS.map((g) => ({ ...g, jobs: found.filter((j) => groupOf(s, j) === g.key).sort((a, b) => sortKey(a) - sortKey(b)) })).filter((g) => g.jobs.length);
  const keys = groups.map((g) => g.key).join();
  const deleted = (s.deleted ?? []).length;

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id.replace('ej-group-', ''), e.isIntersecting);
        setActive(keys.split(',').find((k) => seen.get(k)) ?? null);
      },
      { root: document.querySelector('main'), rootMargin: '0px 0px -55% 0px' },
    );
    for (const k of keys.split(',')) {
      const el = document.getElementById(`ej-group-${k}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [keys]);

  const search = <SearchToggle query={query} setQuery={setQuery} openField={searching} setOpenField={setSearching} />;
  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-4 pb-10 pt-4 lg:px-8 lg:pt-6">
      <h1 className="sr-only">Jobs</h1>
      <HeaderSlot>
        {!phone && <Jumps groups={groups} active={active} />}
        {phone ? !searching && search : search}
      </HeaderSlot>
      {phone && (searching || groups.length > 1) && (
        <div className="-mb-2 flex flex-col gap-2">
          {searching && search}
          <Jumps groups={groups} active={active} />
        </div>
      )}
      {groups.length === 0 ? (
        <div className="aj-muted py-10 text-center">{q ? `No job matches “${query.trim()}”.` : 'Nothing here yet.'}</div>
      ) : (
        groups.map((g) => (
          <section key={g.key} id={`ej-group-${g.key}`} className="flex flex-col gap-2" aria-label={g.label} style={{ scrollMarginTop: 16 }}>
            <h2 className="aj-section-label" style={{ padding: '0 6px', margin: 0 }}>
              {g.label} · {g.jobs.length}
            </h2>
            <ul className="ej-joblist">
              {g.jobs.map((j) => (
                <Row key={j.id} job={j} s={s} open={open} />
              ))}
            </ul>
          </section>
        ))
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1.5">
        <button type="button" className="aj-text-btn inline-flex items-center gap-1" onClick={() => go('jobs', 'deleted')}>
          <Trash2 size={13} strokeWidth={1.8} /> Recently deleted{deleted ? ` · ${deleted}` : ''}
        </button>
        {phone && <span className="aj-faint">Swipe a live job right to extend it a week, left to close it.</span>}
      </div>
      {dialog && <JobDialog job={dialog.job} s={s} kind={dialog.kind} onClose={() => setDialog(null)} />}
    </div>
  );
}

export default function Jobs({ id }: { id?: string }) {
  const s = useDemo();
  if (id === 'deleted') return <RecentlyDeleted s={s} />;
  const job = id ? s.jobs.find((j) => j.id === id) : undefined;
  if (job) return <JobDetail job={job} s={s} />;
  return <JobList s={s} />;
}
