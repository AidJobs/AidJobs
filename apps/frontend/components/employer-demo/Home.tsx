'use client';

import { Bell, CheckCircle2, Clock, Download, FileText, Inbox, MessageSquareWarning, Receipt, RotateCcw, Send, Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import DayStrip, { type DayGroup } from '@/components/site/DayStrip';
import Flag from '@/components/site/Flag';
import {
  approvalRequired,
  dismissMoment,
  downloadCopy,
  extend,
  hireAgain,
  isApproved,
  letClose,
  markInbox,
  readIntent,
  remindPayer,
  runIntent,
  startJob,
  type Intent,
} from './actions';
import Composer from './Composer';
import { addDays, daysUntil, longDate, shortDate } from './engine';
import { currentMonth, FREE_PER_MONTH, freeLeft, monthName } from './plans';
import { reachMoment } from './invites';
import { go, useDemo } from './store';
import type { DemoJob, InboxItem, State } from './types';
import { Lifeline, PlanBadge, Section, stageOf } from './ui';

const DAY = 86_400_000;

type Brief = { id: string; icon: ReactNode; title: string; body: string; actions: Array<{ label: string; run: () => void; primary?: boolean }> };

export function statusLine(s: State, j: DemoJob): string {
  const left = j.facts.deadline ? daysUntil(s.today, j.facts.deadline) : null;
  if (j.payRequest && j.status !== 'live' && j.status !== 'scheduled') return `Waiting for ${j.payRequest.name.split(' ')[0]} to pay ${j.payRequest.amount}`;
  switch (j.status) {
    case 'draft':
      return j.sections.length ? 'Draft' : 'Draft · not written yet';
    case 'review': {
      const yes = j.review.reviewers.filter((r) => r.decision === 'approved').length;
      if (j.review.state === 'changes') return 'Changes requested';
      return `In review · ${yes} of ${j.review.reviewers.length} approved${j.review.due ? ` · due ${shortDate(j.review.due)}` : ''}`;
    }
    case 'approved':
      return 'Approved · ready to publish';
    case 'scheduled':
      return `Scheduled for ${j.scheduledFor ? longDate(j.scheduledFor) : 'later'}`;
    case 'live':
      return left === null ? 'Live' : left === 0 ? 'Live · closes today' : left === 1 ? 'Live · closes tomorrow' : `Live · closes in ${left} days`;
    default: {
      const removal = j.closedAt ? Math.round((j.closedAt + 30 * DAY - s.today) / DAY) : null;
      const why = j.closeReason === 'filled' ? 'Position filled' : j.closeReason === 'withdrawn' ? 'Withdrawn' : j.closeReason === 'early' ? 'Closed early' : 'Closed';
      return removal !== null && removal > 0 ? `${why} · page removed in ${removal} days` : `${why} · in your history`;
    }
  }
}

export function needsYou(s: State, j: DemoJob): boolean {
  const left = j.facts.deadline ? daysUntil(s.today, j.facts.deadline) : null;
  if (j.status === 'approved' || j.review.state === 'changes') return true;
  if (j.status === 'review' && isApproved(j)) return true;
  if (j.status === 'live' && left !== null && left <= 3 && !s.inbox.some((i) => i.jobId === j.id && i.kind === 'deadline' && i.done)) return true;
  return false;
}

export function openJob(j: DemoJob) {
  if (j.status === 'live' || j.status === 'closed' || j.status === 'scheduled') go('jobs', j.id);
  else go('create', j.id);
}

function briefing(s: State): Brief[] {
  const out: Brief[] = [];
  for (const j of s.jobs) {
    const left = j.facts.deadline ? daysUntil(s.today, j.facts.deadline) : null;
    if ((j.status === 'approved' || (j.status === 'review' && isApproved(j))) && j.review.state !== 'changes') {
      const by = j.review.reviewers.filter((r) => r.decision === 'approved').map((r) => r.name.split(' ')[0]);
      out.push({
        id: `pub-${j.id}`,
        icon: <CheckCircle2 size={16} strokeWidth={1.8} style={{ color: 'var(--sage-7)' }} />,
        title: `${by.join(' and ') || 'Your reviewers'} approved ${j.facts.title}`,
        body: approvalRequired(s, j) ? 'Approval was required, and it is in. Publish now?' : 'Publish now?',
        actions: [
          { label: 'Publish', run: () => go('publish', j.id), primary: true },
          { label: 'Open', run: () => go('create', j.id) },
        ],
      });
    } else if (j.review.state === 'changes') {
      out.push({ id: `chg-${j.id}`, icon: <MessageSquareWarning size={16} strokeWidth={1.8} style={{ color: 'var(--amber)' }} />, title: `Changes requested on ${j.facts.title}`, body: 'See the comments on the sections.', actions: [{ label: 'Open', run: () => go('create', j.id), primary: true }] });
    }
    if (j.status === 'live' && left !== null && left <= 3 && !s.inbox.some((i) => i.jobId === j.id && i.kind === 'deadline' && i.done)) {
      out.push({
        id: `dl-${j.id}`,
        icon: <Clock size={16} strokeWidth={1.8} style={{ color: 'var(--amber)' }} />,
        title: `${j.facts.title} closes ${left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`}`,
        body: 'Extend it, or let it close on the date?',
        actions: [
          { label: '+1 week', run: () => extend(j.id, 7), primary: true },
          { label: '+2 weeks', run: () => extend(j.id, 14) },
          { label: 'Let it close', run: () => letClose(j.id) },
        ],
      });
    }
    if (j.status === 'closed' && j.closedAt) {
      const removal = Math.round((j.closedAt + 30 * DAY - s.today) / DAY);
      if (removal > 0 && removal <= 7) {
        out.push({
          id: `rm-${j.id}`,
          icon: <Download size={16} strokeWidth={1.8} style={{ color: 'var(--text-2)' }} />,
          title: `${j.facts.title}: page removed in ${removal} days`,
          body: 'The record stays in your history. Keep a copy, or hire for it again.',
          actions: [
            { label: 'Download a copy', run: () => downloadCopy(j, s.org.name), primary: true },
            {
              label: 'Hire again',
              run: () => {
                const id = hireAgain(j.id);
                if (id) go('create', id);
              },
            },
          ],
        });
      }
    }
  }
  for (const j of s.jobs) {
    if (j.payRequest) {
      const req = j.payRequest;
      out.push({
        id: `pay-${j.id}`,
        icon: <Receipt size={16} strokeWidth={1.8} style={{ color: 'var(--text-2)' }} />,
        title: `Waiting for ${req.name.split(' ')[0]} to pay ${req.amount} for ${j.facts.title}`,
        body: `Asked ${new Date(req.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. The job ${j.status === 'live' ? 'is amplified' : 'publishes'} once they have paid.`,
        actions: [
          { label: 'Remind', run: () => remindPayer(j.id), primary: true },
          { label: 'Open', run: () => go('publish', j.id) },
        ],
      });
    }
    const m = reachMoment(j, s.today);
    if (m) {
      out.push({
        id: `reach-${j.id}`,
        icon: <Send size={16} strokeWidth={1.8} style={{ color: 'var(--sage-7)' }} />,
        title: m.title,
        body: m.body,
        actions: [
          { label: 'Invite more', run: () => go('jobs', j.id), primary: true },
          { label: 'Not now', run: () => dismissMoment(j.id, m.key) },
        ],
      });
    }
  }
  for (const p of s.packs) {
    const d = daysUntil(s.today, p.ends);
    if (p.left > 0 && d <= 14) {
      out.push({
        id: `pk-${p.id}`,
        icon: <Receipt size={16} strokeWidth={1.8} style={{ color: 'var(--amber)' }} />,
        title: `${p.left} paid ${p.left === 1 ? 'job' : 'jobs'} left, ${d <= 0 ? 'ending today' : `ending in ${d} ${d === 1 ? 'day' : 'days'}`}`,
        body: `Unused jobs from your ${p.jobs}-job package lapse on ${longDate(p.ends)}.`,
        actions: [
          { label: 'Create a job', run: () => go('create'), primary: true },
          { label: 'Billing', run: () => go('billing') },
        ],
      });
    }
  }
  const unwritten = s.jobs.find((j) => j.status === 'draft');
  if (unwritten) out.push({ id: `dr-${unwritten.id}`, icon: <FileText size={16} strokeWidth={1.8} style={{ color: 'var(--text-2)' }} />, title: `${unwritten.facts.title || 'A draft'} is waiting`, body: unwritten.sections.length ? 'Pick up where you left off.' : 'Not written yet.', actions: [{ label: 'Continue', run: () => go('create', unwritten.id), primary: true }] });
  return out;
}

const INBOX_ICON: Record<InboxItem['kind'], ReactNode> = {
  approved: <CheckCircle2 size={15} strokeWidth={1.8} style={{ color: 'var(--sage-7)' }} />,
  changes: <MessageSquareWarning size={15} strokeWidth={1.8} style={{ color: 'var(--amber)' }} />,
  comment: <MessageSquareWarning size={15} strokeWidth={1.8} />,
  deadline: <Clock size={15} strokeWidth={1.8} style={{ color: 'var(--amber)' }} />,
  removal: <Download size={15} strokeWidth={1.8} />,
  receipt: <Receipt size={15} strokeWidth={1.8} />,
  reach: <Send size={15} strokeWidth={1.8} />,
  review: <Bell size={15} strokeWidth={1.8} />,
};

export function DecisionInbox() {
  const s = useDemo();
  const open = s.inbox.filter((i) => !i.done);
  return (
    <Section title={`Decision inbox${open.length ? ` · ${open.length}` : ''}`}>
      {open.length === 0 ? (
        <div className="aj-card flex items-center gap-2 p-4 aj-muted">
          <Inbox size={16} strokeWidth={1.8} /> Nothing waiting for you.
        </div>
      ) : (
        <ul className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {open.map((i) => {
            const j = s.jobs.find((x) => x.id === i.jobId);
            return (
              <li key={i.id} className="aj-card flex gap-3 p-3">
                <span className="mt-0.5 shrink-0">{INBOX_ICON[i.kind]}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span style={{ fontWeight: 650 }}>{i.title}</span>
                  <span className="aj-muted">{i.body}</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {j && (
                      <button type="button" className="aj-pill" onClick={() => openJob(j)}>
                        Open
                      </button>
                    )}
                    <button type="button" className="aj-pill" onClick={() => markInbox(i.id)}>
                      Done
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

export default function Home() {
  const s = useDemo();
  const [text, setText] = useState('');
  const [intent, setIntent] = useState<Intent>(null);
  const [noMatch, setNoMatch] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const items = briefing(s);
  const left = freeLeft(s);
  const month = monthName(currentMonth(s));

  const active = s.jobs.filter((j) => j.status !== 'closed' || (j.closedAt && s.today - j.closedAt < 31 * DAY));
  const shown = day ? active.filter((j) => j.facts.deadline === day && (j.status === 'live' || j.status === 'scheduled')) : active;
  const groups: DayGroup[] = [];
  for (let d = 0; d < 10; d++) {
    const date = addDays(s.today, d);
    const count = s.jobs.filter((j) => (j.status === 'live' || j.status === 'scheduled') && j.facts.deadline === date).length;
    if (count) groups.push({ date, count, daysLeft: d });
  }

  const send = (v: string) => {
    setNoMatch(false);
    const looksLikeAction = /^(extend|close|end|reopen|re-open|hire again|repost|push back)\b/i.test(v);
    if (looksLikeAction) {
      const it = readIntent(v);
      if (it) setIntent(it);
      else setNoMatch(true);
      return;
    }
    const id = startJob(v);
    setText('');
    go('create', id);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 py-5 lg:flex-row lg:px-8 lg:py-8">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div>
          <span className="ej-panel-label">Overview</span>
          <h1 className="aj-display aj-h1" style={{ margin: '2px 0 0' }}>
            Hello, {s.me.name.split(' ')[0]}
          </h1>
          <p className="aj-muted" style={{ margin: '4px 0 0' }}>
            {items.length ? `${items.length} ${items.length === 1 ? 'thing needs' : 'things need'} you today.` : 'Nothing needs you today.'}
          </p>
        </div>

        {items.length > 0 && (
          <ul className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Briefing">
            {items.slice(0, 4).map((b) => (
              <li key={b.id} className="aj-card flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 gap-3">
                  <span className="mt-0.5 shrink-0">{b.icon}</span>
                  <div className="min-w-0">
                    <div style={{ fontWeight: 650 }}>{b.title}</div>
                    <div className="aj-muted">{b.body}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:justify-end">
                  {b.actions.map((a) =>
                    a.primary ? (
                      <button key={a.label} type="button" className="aj-ink-btn" onClick={a.run}>
                        {a.label}
                      </button>
                    ) : (
                      <button key={a.label} type="button" className="aj-pill" onClick={a.run}>
                        {a.label}
                      </button>
                    ),
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <Section title="Ask AidJobs" action={<span className="aj-faint">{left} of {FREE_PER_MONTH} free jobs left in {month}</span>}>
          <Composer
            value={text}
            onChange={setText}
            onSend={send}
            suggestion=""
            placeholder='For example: "extend all Nairobi jobs by a week", or describe a new role'
            label="Ask AidJobs to do something, or describe a role"
            compact
          />
          <p className="aj-faint" style={{ margin: 0, fontSize: 11.5 }}>
            Every change is confirmed first and can be undone. {left === 0 ? `Both free jobs for ${month} are used; an amplified job does not use one.` : 'An amplified job does not use a free job.'}
          </p>
          {noMatch && (
            <div className="aj-card p-3 aj-muted" role="status">
              I couldn&apos;t match that to a job. Try naming the job, the city, or the country.
            </div>
          )}
          {intent && (
            <div className="aj-card flex flex-col gap-2 p-4" role="alertdialog" aria-label="Confirm">
              <div className="flex items-center gap-2" style={{ fontWeight: 650 }}>
                <Sparkles size={15} strokeWidth={1.8} style={{ color: 'var(--sage-7)' }} /> {intent.summary}?
              </div>
              <ul className="aj-muted" style={{ margin: 0, paddingLeft: 18 }}>
                {intent.jobIds.map((id) => {
                  const j = s.jobs.find((x) => x.id === id);
                  return j ? <li key={id}>{`${j.facts.title} · ${j.facts.location}${j.facts.deadline ? ` · now closes ${longDate(j.facts.deadline)}` : ''}`}</li> : null;
                })}
              </ul>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="aj-ink-btn"
                  onClick={() => {
                    const id = runIntent(intent);
                    setIntent(null);
                    setText('');
                    if (id) go('create', id);
                  }}
                >
                  Confirm
                </button>
                <button type="button" className="aj-pill" onClick={() => setIntent(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Section>

        {groups.length > 0 && (
          <Section title="Closing in the next 10 days">
            <DayStrip groups={groups} value={day} onChange={setDay} />
          </Section>
        )}

        <Section title={day ? `Closing ${longDate(day)}` : 'Your jobs'} action={<button type="button" className="aj-text-btn" onClick={() => go('jobs')}>All jobs</button>}>
          <ul className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {shown.map((j) => {
              const leftDays = j.facts.deadline ? daysUntil(s.today, j.facts.deadline) : null;
              const attention = needsYou(s, j);
              return (
                <li key={j.id}>
                  <button type="button" className="aj-card flex w-full flex-col gap-2 p-3 text-left" style={{ cursor: 'pointer' }} onClick={() => openJob(j)}>
                    <div className="flex w-full items-center gap-2">
                      <span className="min-w-0 flex-1 truncate" style={{ fontWeight: 650 }}>
                        {j.facts.title || 'Untitled draft'}
                      </span>
                      <PlanBadge plan={j.plan} />
                      {attention && (
                        <span className="aj-chip" data-tone="amber">
                          Needs you
                        </span>
                      )}
                    </div>
                    <div className="aj-muted flex w-full items-center gap-2">
                      {j.facts.iso && <Flag iso={j.facts.iso} title={j.facts.country} />}
                      <span className="min-w-0 flex-1 truncate">{j.facts.location || (j.facts.arrangement === 'remote' ? 'Remote' : 'No place yet')}</span>
                      <span className="shrink-0">{statusLine(s, j)}</span>
                    </div>
                    <Lifeline stage={stageOf(j, leftDays)} attention={attention} />
                  </button>
                </li>
              );
            })}
          </ul>
          {s.jobs.some((j) => j.status === 'closed' && j.closedAt && s.today - j.closedAt >= 31 * DAY) && (
            <button type="button" className="aj-text-btn inline-flex items-center gap-1 self-start" onClick={() => go('jobs')}>
              <RotateCcw size={13} strokeWidth={2} /> Older jobs are in your history
            </button>
          )}
        </Section>
      </div>
      <aside className="flex w-full flex-col gap-6 lg:w-[340px] lg:shrink-0">
        <DecisionInbox />
      </aside>
    </div>
  );
}
