'use client';

import { ArrowLeft, CalendarPlus, CheckCheck, Copy, Download, History, MapPin, Pencil, Repeat2, Share2, Sparkles, Trash2, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import Flag from '@/components/site/Flag';
import { closeJob, deleteDraft, downloadCopy, extend, hireAgain } from './actions';
import { addDays, daysUntil, holiday, longDate, PLACES, weekend } from './engine';
import { needsYou, openJob, statusLine } from './Home';
import { BADGE, listedUntil } from './plans';
import { CommunityButtons, JobPageLangs, jobUrl, shareMessage } from './Publish';
import { go, notify, useDemo } from './store';
import type { DemoJob, State } from './types';
import { Dialog, inputStyle, Lifeline, PlanBadge, stageOf } from './ui';

const DAY = 86_400_000;

function ExtendDialog({ job, s, onClose }: { job: DemoJob; s: State; onClose: () => void }) {
  const base = job.facts.deadline && daysUntil(s.today, job.facts.deadline) >= 0 ? job.facts.deadline : addDays(s.today, 0);
  const [date, setDate] = useState(addDays(new Date(`${base}T12:00:00`).getTime(), 7));
  const warn: string[] = [];
  if (date && weekend(date)) warn.push(`${longDate(date)} is a weekend`);
  if (date && holiday(date, job.facts.iso)) warn.push(`${longDate(date)} is a public holiday${job.facts.country ? ` in ${job.facts.country}` : ''}`);
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

function ReshareDialog({ job, s, onClose }: { job: DemoJob; s: State; onClose: () => void }) {
  const copy = async (t: string, what: string) => {
    try {
      await navigator.clipboard.writeText(t);
      notify(`${what} copied`);
    } catch {
      notify('Copy failed');
    }
  };
  return (
    <Dialog title="Share again" subtitle={job.facts.title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <pre className="rounded-xl p-3" style={{ background: 'var(--surface-2)', whiteSpace: 'pre-wrap', font: 'inherit', margin: 0 }}>
          {shareMessage(job, s.org)}
        </pre>
        <CommunityButtons msg={shareMessage(job, s.org)} url={jobUrl(job)} copy={copy} />
      </div>
    </Dialog>
  );
}

function Actions({ job, s, onDialog }: { job: DemoJob; s: State; onDialog: (d: 'extend' | 'filled' | 'variant' | 'reshare') => void }) {
  if (job.status === 'live' || job.status === 'scheduled')
    return (
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="aj-ink-btn" onClick={() => onDialog('extend')}>
          <CalendarPlus size={14} strokeWidth={1.8} /> Extend
        </button>
        <button type="button" className="aj-pill" onClick={() => closeJob(job.id, 'early')}>
          <XCircle size={14} strokeWidth={1.8} /> Close now
        </button>
        <button type="button" className="aj-pill" onClick={() => go('create', job.id)}>
          <Pencil size={14} strokeWidth={1.8} /> Edit
        </button>
        <button type="button" className="aj-pill" onClick={() => onDialog('reshare')}>
          <Share2 size={14} strokeWidth={1.8} /> Re-share
        </button>
        <button type="button" className="aj-pill" onClick={() => onDialog('filled')}>
          <CheckCheck size={14} strokeWidth={1.8} /> Position filled
        </button>
        <button type="button" className="aj-pill" onClick={() => onDialog('variant')}>
          <Copy size={14} strokeWidth={1.8} /> Same role, another place
        </button>
        {job.plan === 'free' && (
          <button type="button" className="aj-pill" onClick={() => go('publish', job.id)}>
            <Sparkles size={14} strokeWidth={1.8} /> Amplify
          </button>
        )}
      </div>
    );
  if (job.status === 'closed')
    return (
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="aj-ink-btn"
          onClick={() => {
            const id = hireAgain(job.id);
            if (id) go('create', id);
          }}
        >
          <Repeat2 size={14} strokeWidth={1.8} /> Hire again
        </button>
        <button type="button" className="aj-pill" onClick={() => downloadCopy(job, s.org.name)}>
          <Download size={14} strokeWidth={1.8} /> Download a copy
        </button>
        <button type="button" className="aj-pill" onClick={() => onDialog('variant')}>
          <Copy size={14} strokeWidth={1.8} /> Same role, another place
        </button>
      </div>
    );
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className="aj-ink-btn" onClick={() => go('create', job.id)}>
        Continue
      </button>
      {job.status === 'draft' && (
        <button type="button" className="aj-pill" onClick={() => deleteDraft(job.id)}>
          <Trash2 size={14} strokeWidth={1.8} /> Delete draft
        </button>
      )}
    </div>
  );
}

/** A row that can be swiped on touch screens: right to extend by a week, left to close. The same actions are buttons too. */
function Row({ job, s }: { job: DemoJob; s: State }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swipeable = job.status === 'live';
  const left = job.facts.deadline ? daysUntil(s.today, job.facts.deadline) : null;
  const attention = needsYou(s, job);
  return (
    <li className="relative overflow-hidden rounded-[20px]">
      {swipeable && dx !== 0 && (
        <div className="absolute inset-0 flex items-center justify-between px-5" style={{ background: dx > 0 ? 'var(--sage-2)' : 'var(--red-bg)', color: dx > 0 ? 'var(--sage-8)' : 'var(--red)', fontWeight: 700 }} aria-hidden>
          <span>{dx > 0 ? '+1 week' : ''}</span>
          <span>{dx < 0 ? 'Close now' : ''}</span>
        </div>
      )}
      <div
        className="ej-swipe aj-card relative flex flex-col gap-2 p-3"
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
        <button type="button" className="flex w-full flex-col gap-2 text-left" style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }} onClick={() => openJob(job)}>
          <div className="flex w-full items-center gap-2">
            <span className="min-w-0 flex-1 truncate" style={{ fontWeight: 650 }}>
              {job.facts.title || 'Untitled draft'}
            </span>
            <PlanBadge plan={job.plan} />
            {attention && (
              <span className="aj-chip" data-tone="amber">
                Needs you
              </span>
            )}
          </div>
          <div className="aj-muted flex w-full items-center gap-2">
            {job.facts.iso && <Flag iso={job.facts.iso} title={job.facts.country} />}
            <span className="min-w-0 flex-1 truncate">{job.facts.location}</span>
            <span className="shrink-0">{statusLine(s, job)}</span>
          </div>
          <Lifeline stage={stageOf(job, left)} attention={attention} />
        </button>
        {swipeable && (
          <div className="flex gap-1.5">
            <button type="button" className="aj-pill" style={{ height: 30 }} onClick={() => extend(job.id, 7)}>
              +1 week
            </button>
            <button type="button" className="aj-pill" style={{ height: 30 }} onClick={() => closeJob(job.id, 'early')}>
              Close now
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'needs', label: 'Needs you' },
  { key: 'live', label: 'Live' },
  { key: 'drafts', label: 'Drafts and review' },
  { key: 'closed', label: 'History' },
] as const;

function JobDetail({ job, s }: { job: DemoJob; s: State }) {
  const [dialog, setDialog] = useState<null | 'extend' | 'filled' | 'variant' | 'reshare'>(null);
  const removal = job.closedAt ? Math.round((job.closedAt + 30 * DAY - s.today) / DAY) : null;
  const dropped = job.closedAt ? Math.round((job.closedAt + 90 * DAY - s.today) / DAY) : null;
  const reach = job.reach;
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 py-5 lg:px-8 lg:py-8">
      <div className="flex items-center gap-2">
        <button type="button" className="aj-icon-btn" onClick={() => go('jobs')} aria-label="Back to jobs">
          <ArrowLeft size={15} strokeWidth={1.8} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate" style={{ fontWeight: 700, fontSize: 15 }}>
            {job.facts.title}
          </div>
          <div className="aj-faint">{statusLine(s, job)}</div>
        </div>
        <PlanBadge plan={job.plan} />
      </div>
      <Lifeline stage={stageOf(job, job.facts.deadline ? daysUntil(s.today, job.facts.deadline) : null)} attention={needsYou(s, job)} />
      <Actions job={job} s={s} onDialog={setDialog} />
      {job.status === 'closed' && removal !== null && (
        <div className="aj-card flex flex-col gap-1 p-3" role="status">
          <span style={{ fontWeight: 650 }}>{removal > 0 ? `The public page is removed in ${removal} days` : 'The public page has been removed'}</span>
          <span className="aj-muted">
            It shows &ldquo;closed&rdquo; until then. The description is dropped {dropped !== null && dropped > 0 ? `in ${dropped} days` : 'now'} (90 days after closing); the job&apos;s basic record stays in your history. Download a copy if you need one.
          </span>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="aj-card p-4 lg:p-6">
          <JobPageLangs job={job} s={s} />
        </div>
        <div className="flex flex-col gap-4">
          {job.plan && job.status !== 'closed' && (
            <section className="aj-card flex flex-col gap-1 p-3">
              <span className="aj-section-label" style={{ padding: 0 }}>
                Plan
              </span>
              <span className="aj-muted">
                {job.plan === 'amplify' ? `Amplified: featured, “${BADGE}”` : 'Free: standard placement'} · listed until {longDate(listedUntil(job, s.today))}
              </span>
              {job.plan === 'free' && (
                <button type="button" className="aj-text-btn self-start" onClick={() => go('publish', job.id)}>
                  Amplify this job
                </button>
              )}
            </section>
          )}
          <section className="aj-card flex flex-col gap-2 p-3">
            <span className="aj-section-label" style={{ padding: 0 }}>
              Reach
            </span>
            {reach ? (
              <ul className="aj-muted flex flex-col gap-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                <li>Candidate invitations: {reach.candidates.length ? `${reach.candidates.filter((r) => r.status === 'sent').length} of ${reach.candidates.length} sent` : 'not used'}</li>
                <li>Team notifications: {reach.team.length ? `${reach.team.filter((r) => r.status === 'sent').length} of ${reach.team.length} sent` : 'not used'}</li>
                <li>Community sharing: {reach.community ? 'ready' : 'not used'}</li>
                <li className="aj-faint" style={{ fontSize: 11 }}>
                  Simulated. &ldquo;Sent&rdquo; means handed to the email service, not proof of delivery.
                </li>
              </ul>
            ) : (
              <span className="aj-muted">Not used for this job.</span>
            )}
          </section>
          <section className="aj-card flex flex-col gap-2 p-3">
            <span className="aj-section-label inline-flex items-center gap-1" style={{ padding: 0 }}>
              <History size={12} strokeWidth={2} /> History
            </span>
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
          </section>
          <section className="aj-card flex flex-col gap-1 p-3">
            <span className="aj-section-label inline-flex items-center gap-1" style={{ padding: 0 }}>
              <MapPin size={12} strokeWidth={2} /> Public address
            </span>
            <span className="aj-muted" style={{ wordBreak: 'break-all' }}>
              {jobUrl(job)}
            </span>
            <span className="aj-faint" style={{ fontSize: 11 }}>
              The address never changes when you edit the text.
            </span>
          </section>
        </div>
      </div>
      {dialog === 'extend' && <ExtendDialog job={job} s={s} onClose={() => setDialog(null)} />}
      {dialog === 'filled' && <FilledDialog job={job} onClose={() => setDialog(null)} />}
      {dialog === 'variant' && <VariantDialog job={job} s={s} onClose={() => setDialog(null)} />}
      {dialog === 'reshare' && <ReshareDialog job={job} s={s} onClose={() => setDialog(null)} />}
    </div>
  );
}

export default function Jobs({ id }: { id?: string }) {
  const s = useDemo();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const job = id ? s.jobs.find((j) => j.id === id) : undefined;
  if (job) return <JobDetail job={job} s={s} />;
  const list = s.jobs.filter((j) => {
    if (filter === 'needs') return needsYou(s, j);
    if (filter === 'live') return j.status === 'live' || j.status === 'scheduled';
    if (filter === 'drafts') return j.status === 'draft' || j.status === 'review' || j.status === 'approved';
    if (filter === 'closed') return j.status === 'closed';
    return true;
  });
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-4 py-5 lg:px-8 lg:py-8">
      <div className="flex items-end gap-2">
        <h1 className="aj-display aj-h1" style={{ margin: 0 }}>
          Jobs
        </h1>
        <span className="aj-faint ml-auto hidden sm:inline">On a phone, swipe a live job right to extend it a week, left to close it.</span>
      </div>
      <div className="aj-no-scrollbar flex gap-1.5 overflow-x-auto" role="radiogroup" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className="aj-pill shrink-0" data-active={filter === f.key} onClick={() => setFilter(f.key)} role="radio" aria-checked={filter === f.key}>
            {f.label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="aj-card p-6 aj-muted">Nothing here.</div>
      ) : (
        <ul className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {list.map((j) => (
            <Row key={j.id} job={j} s={s} />
          ))}
        </ul>
      )}
    </div>
  );
}
