'use client';

import { BellOff, BellRing, Send, Users } from 'lucide-react';
import { useState } from 'react';
import { dismissMoment, sendReach, setReachPlan, setReachReminders } from './actions';
import { longDate } from './engine';
import { deliveryText, planCount, planFor, REACH_EMAILS, reachMoment, reachUsed, recipientsOf, SUPPRESSED } from './invites';
import { notify } from './store';
import type { DemoJob, Message, ReachPlan, State } from './types';
import { Dialog, RecipientInput } from './ui';

function rows(text: string): number {
  return Math.max(2, text.split('\n').length + 1);
}

/** One email as the recipient sees it; the subject, the text, and the closing are edited in place. */
function EmailEditor({ kind, msg, onChange, job, s, to }: { kind: 'candidate' | 'team'; msg: Message; onChange: (m: Message) => void; job: DemoJob; s: State; to: string[] }) {
  return (
    <div className="ej-email">
      <div className="ej-email-head">
        <div>
          <strong>From:</strong> {s.org.name} via AidJobs &lt;jobs@aidjobs.example.org&gt;
        </div>
        <div>
          <strong>Reply-to:</strong> {s.me.email}
        </div>
        <div>
          <strong>To:</strong> {to[0] ?? (kind === 'candidate' ? 'candidate@example.org' : `colleague@${s.org.domain}`)}
          {to.length > 1 ? ` and ${to.length - 1} more, each their own email; nobody sees the others` : ''}
        </div>
        <label className="flex items-center gap-1">
          <strong>Subject:</strong>
          <input className="ej-email-edit min-w-0 flex-1" value={msg.subject} onChange={(e) => onChange({ ...msg, subject: e.target.value })} aria-label={`Subject of the ${kind === 'candidate' ? 'invitation' : 'team email'}`} />
        </label>
      </div>
      <div className="ej-email-body">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: '#e1eedc', color: '#3a6e31', fontWeight: 800, fontSize: 12 }}>
            {s.org.short.slice(0, 2).toUpperCase()}
          </span>
          <strong>{s.org.name}</strong>
        </div>
        <textarea className="ej-email-edit w-full" rows={rows(msg.body)} value={msg.body} onChange={(e) => onChange({ ...msg, body: e.target.value })} aria-label={`Text of the ${kind === 'candidate' ? 'invitation' : 'team email'}`} />
        <p>
          <span className="ej-email-btn">{kind === 'candidate' ? 'View Job & Apply' : 'View Vacancy'}</span>
        </p>
        <p style={{ fontSize: 12, color: '#5b6259' }}>
          {job.facts.title} · {job.facts.location}
          {job.facts.deadline ? ` · closes ${longDate(job.facts.deadline)}` : ''}
        </p>
        <textarea className="ej-email-edit w-full" rows={rows(msg.closing)} value={msg.closing} onChange={(e) => onChange({ ...msg, closing: e.target.value })} aria-label={`Closing of the ${kind === 'candidate' ? 'invitation' : 'team email'}`} />
        <hr style={{ border: 'none', borderTop: '1px solid #e4e9e1', margin: '14px 0' }} />
        <p style={{ fontSize: 11, color: '#6f766d' }}>
          {kind === 'candidate'
            ? `You received this because ${s.org.name} thought this role might interest you. AidJobs has not added you to any list. Don't want invitations through AidJobs? Unsubscribe in one click.`
            : `You received this because you work with ${s.org.name}. Unsubscribe from vacancy notifications.`}{' '}
          AidJobs, on behalf of {s.org.name}.
        </p>
      </div>
    </div>
  );
}

/**
 * The people to invite and the two emails, edited in their preview. Before publishing it is saved and sent when the job goes live;
 * on a live job ("Invite more") it is sent now.
 */
export function ReachDialog({ job, s, mode, why = 'Invited more', momentKey, sendsOn, live = false, onClose }: { job: DemoJob; s: State; mode: 'plan' | 'send'; why?: string; momentKey?: string; sendsOn?: string | null; live?: boolean; onClose: () => void }) {
  const [plan, setPlan] = useState<ReachPlan>(() => planFor(job, s.org));
  const [tab, setTab] = useState<'candidate' | 'team'>('candidate');
  const used = reachUsed(job);
  const room = Math.max(0, REACH_EMAILS - used);
  const { candidates, team, skipped } = recipientsOf(job, plan);
  const count = candidates.length + team.length;
  const colleagues = s.team.filter((p) => p.id !== s.me.id && p.email.endsWith(`@${s.org.domain}`)).map((p) => p.email);
  const missing = colleagues.filter((e) => !plan.team.includes(e));
  const goesLive = live ? 'as soon as it is amplified' : sendsOn ? `on ${longDate(sendsOn)}, when it goes live` : 'when it goes live';
  return (
    <Dialog
      title={mode === 'send' ? 'Invite more people' : `Reach: invite people ${live ? 'as you amplify' : 'when it goes live'}`}
      subtitle="Simulated · nothing is sent"
      onClose={onClose}
      wide
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="aj-faint mr-auto">
            {used + count} of {REACH_EMAILS} Reach emails for this job
          </span>
          <button type="button" className="aj-pill" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="aj-ink-btn"
            disabled={mode === 'send' && !count}
            onClick={() => {
              setReachPlan(job.id, plan);
              if (mode === 'send') {
                const sent = sendReach(job.id, why);
                if (sent && momentKey) dismissMoment(job.id, momentKey);
                notify(`${sent} ${sent === 1 ? 'email' : 'emails'} queued (simulated)`);
              }
              onClose();
            }}
          >
            {mode === 'send' ? `Send now to ${count} ${count === 1 ? 'person' : 'people'}` : count ? `Save · ${count} ${count === 1 ? 'person' : 'people'} ${goesLive}` : 'Save'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="aj-switch self-start" role="radiogroup" aria-label="Which email">
          <button type="button" role="radio" aria-checked={tab === 'candidate'} data-active={tab === 'candidate'} onClick={() => setTab('candidate')}>
            Invite people to apply · {candidates.length}
          </button>
          <button type="button" role="radio" aria-checked={tab === 'team'} data-active={tab === 'team'} onClick={() => setTab('team')}>
            Your team · {team.length}
          </button>
        </div>
        {tab === 'candidate' ? (
          <RecipientInput label="People who could apply" value={plan.candidates} onChange={(v) => setPlan({ ...plan, candidates: v })} max={Math.max(0, room - plan.team.length)} placeholder="name@example.org, another@example.org" />
        ) : (
          <div className="flex flex-col gap-1.5">
            <RecipientInput label="Colleagues who could pass it on" value={plan.team} onChange={(v) => setPlan({ ...plan, team: v })} max={Math.max(0, room - plan.candidates.length)} domain={s.org.domain} placeholder={`colleague@${s.org.domain}`} />
            {missing.length > 0 && (
              <button type="button" className="aj-text-btn inline-flex items-center gap-1 self-start" onClick={() => setPlan({ ...plan, team: [...plan.team, ...missing] })}>
                <Users size={13} strokeWidth={1.8} /> Add your team ({missing.length})
              </button>
            )}
          </div>
        )}
        {skipped.length > 0 && (
          <span className="aj-faint">
            Not sent to:{' '}
            {skipped.map((e) => `${e} (${SUPPRESSED.includes(e) ? 'unsubscribed from AidJobs invitations' : 'already invited for this job'})`).join(', ')}.
          </span>
        )}
        <EmailEditor kind={tab} msg={tab === 'candidate' ? plan.candidateMsg : plan.teamMsg} onChange={(m) => setPlan(tab === 'candidate' ? { ...plan, candidateMsg: m } : { ...plan, teamMsg: m })} job={job} s={s} to={tab === 'candidate' ? candidates : team} />
        <span className="aj-faint">
          {mode === 'send' ? 'Sent now; the job is live, so the link works.' : `Sent ${goesLive}, so the link works.`} Recipients are never added to an AidJobs list, never see each other, and can unsubscribe in one click. Team emails go only to @{s.org.domain} addresses. AidJobs wrote the first draft; the words are yours to change.
        </span>
      </div>
    </Dialog>
  );
}

/** The optional row on the publish page, for a paid job. */
export function ReachRow({ job, s, sendsOn, live }: { job: DemoJob; s: State; sendsOn: string | null; live: boolean }) {
  const [open, setOpen] = useState(false);
  const n = planCount(job, job.reachPlan);
  return (
    <>
      <button type="button" className="aj-card flex w-full items-center gap-3 p-3 text-left" style={{ cursor: 'pointer', color: 'inherit', font: 'inherit' }} onClick={() => setOpen(true)} disabled={Boolean(s.reviewerAs)}>
        <Send size={16} strokeWidth={1.8} style={{ color: 'var(--sage-7)' }} className="shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span style={{ fontWeight: 650 }}>Reach: invite people {live ? 'as you amplify' : 'when it goes live'}</span>
          <span className="aj-faint">{n ? `${n} ${n === 1 ? 'person' : 'people'}, with the emails you checked` : 'Optional · candidates and your team, by email'}</span>
        </span>
        <span className="aj-chip shrink-0">
          {n} {n === 1 ? 'person' : 'people'}
        </span>
      </button>
      {open && <ReachDialog job={job} s={s} mode="plan" sendsOn={sendsOn} live={live} onClose={() => setOpen(false)} />}
    </>
  );
}

/** On the job's page: what Reach sent, round by round; the reminder to invite more; and its off switch. */
export function ReachLog({ job, s, onAmplify }: { job: DemoJob; s: State; onAmplify: () => void }) {
  const [open, setOpen] = useState<null | { why: string; key?: string }>(null);
  const reach = job.reach;
  const moment = reachMoment(job, s.today);
  const owner = !s.reviewerAs;
  if (job.plan !== 'amplify') {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <span className="aj-muted">Reach invites people by email when the job goes live, and reminds you to invite more. It comes with Amplify.</span>
        {job.status !== 'closed' && owner && (
          <button type="button" className="aj-text-btn" style={{ height: 'auto', padding: 0 }} onClick={onAmplify}>
            Amplify to invite people directly
          </button>
        )}
      </div>
    );
  }
  const reminders = job.reachReminders !== false;
  return (
    <div className="flex flex-col gap-2">
      {moment && owner && (
        <div className="flex flex-col gap-1.5 rounded-xl p-3" style={{ background: 'var(--sage-1)' }} role="status">
          <span style={{ fontWeight: 650 }}>{moment.title}</span>
          <span className="aj-muted">{moment.body}</span>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="aj-ink-btn" onClick={() => setOpen({ why: moment.why, key: moment.key })}>
              Invite more
            </button>
            <button type="button" className="aj-pill" onClick={() => dismissMoment(job.id, moment.key)}>
              Not now
            </button>
          </div>
        </div>
      )}
      {reach?.rounds.length ? (
        <ul className="ej-divide flex flex-col" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="What Reach sent">
          {reach.rounds.map((r) => {
            const c = reach.candidates.filter((x) => x.round === r.n);
            const t = reach.team.filter((x) => x.round === r.n);
            return (
              <li key={r.n} className="flex flex-col py-1.5">
                <span style={{ fontWeight: 600 }}>
                  {r.why} · {new Date(r.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
                <span className="aj-muted">Invitations: {deliveryText(c)}</span>
                <span className="aj-muted">Team: {deliveryText(t)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <span className="aj-muted">Nothing sent yet.</span>
      )}
      <span className="aj-faint" style={{ fontSize: 11 }}>
        {reachUsed(job)} of {REACH_EMAILS} Reach emails used. Simulated: &ldquo;sent&rdquo; means handed to the email service, not proof of delivery. A failed email never unpublishes the job.
      </span>
      {owner && job.status === 'live' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {!moment && (
            <button type="button" className="aj-pill" onClick={() => setOpen({ why: 'Invited more' })}>
              <Send size={13} strokeWidth={1.8} /> Invite more
            </button>
          )}
          <button type="button" className="aj-text-btn inline-flex items-center gap-1 text-left" style={{ height: 'auto', minHeight: 30 }} onClick={() => setReachReminders(job.id, !reminders)} aria-pressed={reminders}>
            {reminders ? <BellRing size={13} strokeWidth={1.8} /> : <BellOff size={13} strokeWidth={1.8} />} Reminders to invite more: {reminders ? 'on' : 'off'}
          </button>
        </div>
      )}
      {open && <ReachDialog job={job} s={s} mode="send" why={open.why} momentKey={open.key} onClose={() => setOpen(null)} />}
    </div>
  );
}
