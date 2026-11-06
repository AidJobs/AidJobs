'use client';

import { AlertCircle, ArrowLeft, BadgeCheck, CalendarClock, Check, CheckCircle2, Clock, Copy, ExternalLink, Flag as FlagIcon, Linkedin, MapPin, MessageCircle, Share2, Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import Flag from '@/components/site/Flag';
import Tip from '@/components/site/Tip';
import {
  acceptFreeTerms,
  amplifyLive,
  approvalRequired,
  approvedFor,
  askToPay,
  buy,
  cancelPayRequest,
  canSkipApproval,
  changesAfterApproval,
  completePayRequest,
  overrideApproval,
  overruleChanges,
  pausedByChanges,
  publish,
  remindPayer,
  scheduleBlock,
  type Paid,
} from './actions';
import {
  BADGE,
  BADGE_TIP,
  canGoFree,
  currentMonth,
  FREE_PER_MONTH,
  firstOfNextMonth,
  freeLeft,
  hasFreeUse,
  LISTED_DAYS,
  listedUntil,
  monthFor,
  monthName,
  nextPaidJob,
  packageOf,
  PACKAGES,
  paidJobsLeft,
  priceLabel,
  singlePrice,
  usd,
  type PackageKey,
} from './plans';
import { addDays, arrangementLabel, article, commitmentText, COMMITMENTS, daysUntil, inOutlineOrder, isoDay, longDate, salaryText, slug } from './engine';
import BeforePublish from './Checks';
import { deliveryText, planCount } from './invites';
import { ReachRow } from './Reach';
import { AmplifyIncludes, Checkout, FreeTerms } from './Pricing';
import { getState, go, notify, useDemo } from './store';
import { commitmentLabel, countryName, LANGS, langOf, localDate, publicLangs, stale, term, ui } from './translate';
import type { DemoJob, Lang, Org, PayRequest, Plan, State } from './types';
import { DemoMark, Dialog, Field, inputStyle, isEmail, OrgMark, radioKeys } from './ui';

export function jobUrl(j: DemoJob): string {
  return `https://aidjobs.app/jobs/${slug(j.facts.title || 'job')}-${j.id.slice(-4)}`;
}

export const DEMO_PREFIX = '[Sample from the AidJobs demo, not a real vacancy]';

export function shareMessage(j: DemoJob, org: Org): string {
  return [
    DEMO_PREFIX,
    '',
    "We're hiring!",
    '',
    `${org.name} is looking for ${article(j.facts.title)} ${j.facts.title}${j.facts.location ? ` in ${j.facts.location}` : ''}.`,
    '',
    'If you or someone in your professional network has relevant experience, take a look at this opportunity.',
    '',
    ...(j.facts.deadline ? [`Application deadline: ${longDate(j.facts.deadline)}`, ''] : []),
    `View the vacancy: ${jobUrl(j)}`,
    '',
    'Please share with anyone who might be interested.',
  ].join('\n');
}

/** A section's lines; in a language version, `english` holds the English lines, and a line still word for word in English is marked as English. */
function Lines({ lines, english }: { lines: string[]; english?: string[] }) {
  const out: ReactNode[] = [];
  let list: Array<{ text: string; en: boolean }> = [];
  const lang = (en: boolean) => (en ? 'en' : undefined);
  const items = () => list.map((x, k) => (
    <li key={k} dir="auto" lang={lang(x.en)}>
      {x.text}
    </li>
  ));
  lines.forEach((l, i) => {
    const en = Boolean(english && english[i] === l && /[a-z]{3}/i.test(l));
    if (l.startsWith('- ')) list.push({ text: l.slice(2), en });
    else {
      if (list.length) {
        out.push(<ul key={`u${i}`}>{items()}</ul>);
        list = [];
      }
      out.push(
        <p key={i} dir="auto" lang={lang(en)}>
          {l}
        </p>,
      );
    }
  });
  if (list.length) out.push(<ul key="uend">{items()}</ul>);
  return <>{out}</>;
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify(`${what} copied`);
  } catch {
    notify('Copy failed: select the text and copy it yourself');
  }
}

/** The job page as visitors will see it on AidJobs, in English or one of its language versions; `share` adds the share buttons every visitor has. */
export function JobPage({ job, s, lang, share = false }: { job: DemoJob; s: State; lang?: Lang; share?: boolean }) {
  const left = job.facts.deadline ? daysUntil(s.today, job.facts.deadline) : null;
  const version = lang ? job.translations?.[lang] : undefined;
  const l = version ? lang : undefined;
  const say = (en: string, key: string, vars: Record<string, string | number> = {}) => (l ? ui(key, l, vars) : en);
  const sections = version ? version.sections : inOutlineOrder(job.sections, job.tags);
  const place = job.facts.location ? job.facts.location.replace(job.facts.country, countryName(job.facts.iso, job.facts.country, l)) : job.facts.arrangement === 'remote' ? term('Remote', l) : '';
  return (
    <article className="ej-doc flex flex-col gap-3" aria-label="Job page preview" lang={l ?? 'en'} dir={l ? langOf(l).dir : undefined}>
      <div className="flex items-center gap-2">
        <OrgMark name={s.org.name} />
        <span className="aj-muted min-w-0 flex-1 truncate">{s.org.name}</span>
        {s.org.verified && (
          <Tip label="Verified employer">
            <span className="aj-chip" data-tone="sage">
              <BadgeCheck size={11} strokeWidth={2} /> {say('Verified', 'verified')}
            </span>
          </Tip>
        )}
        {job.plan === 'amplify' && (
          <Tip label={BADGE_TIP}>
            <span className="aj-chip" data-tone="sage" tabIndex={0}>
              <Sparkles size={11} strokeWidth={2} /> {say(BADGE, 'badge')}
            </span>
          </Tip>
        )}
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{job.facts.title}</h2>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <MapPin size={14} strokeWidth={1.8} className="aj-faint" />
          <Flag iso={job.facts.iso || null} title={job.facts.country} />
          <span>{place}</span>
        </div>
        {job.facts.deadline && (
          <div className="flex items-center gap-2">
            <Clock size={14} strokeWidth={1.8} className="aj-faint" />
            <span>
              {say('Closes', 'closes')} {localDate(job.facts.deadline, l)}
            </span>
            {left !== null && left >= 0 && (
              <span className="aj-chip" data-tone={left <= 3 ? 'red' : left <= 7 ? 'amber' : undefined}>
                {left === 0 ? say('Today', 'today') : say(`${left} days left`, 'daysLeft', { n: left })}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[job.facts.contract, job.facts.duration, job.facts.grade, arrangementLabel(job.facts.arrangement), job.facts.recruitment === 'roster' ? 'Roster' : job.facts.recruitment === 'proposal' ? 'Proposal stage' : '', salaryText(job.facts)].filter(Boolean).map((x) => (
          <span key={x} className="aj-chip">
            {term(x, l)}
          </span>
        ))}
        {job.updatedAfterPublish && !l && (
          <span className="aj-chip" data-tone="sage">
            Updated
          </span>
        )}
      </div>
      <div>
        <a className="aj-ink-btn" href={`${s.org.careersUrl}/apply`} target="_blank" rel="noopener noreferrer">
          {say(`Apply on ${s.org.short}`, 'apply', { org: s.org.short })} <ExternalLink size={13} strokeWidth={2} />
        </a>
      </div>
      {sections.map((sec) => (
        <section key={sec.key}>
          <h3 lang={version && job.sections.find((x) => x.key === sec.key)?.title === sec.title ? 'en' : undefined}>{sec.title}</h3>
          <Lines lines={sec.lines} english={version ? job.sections.find((x) => x.key === sec.key)?.lines : undefined} />
        </section>
      ))}
      {job.commitments.length > 0 && (
        <section>
          <h3>{say('Our commitments', 'commitments')}</h3>
          {job.commitments.map((k) => (
            <p key={k} className="ej-commitment">
              <strong>{commitmentLabel(k, COMMITMENTS.find((c) => c.key === k)?.label ?? k, l)}.</strong> <span lang="en">{commitmentText(k, s.org, job.facts).text}</span>
            </p>
          ))}
        </section>
      )}
      <div className="aj-faint flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 aj-hair" style={{ fontSize: 11.5 }}>
        <span>{say(`Published by ${s.org.name}`, 'publishedBy', { org: s.org.name })}</span>
        <span>{job.publishedAt ? say(`Posted ${localDate(isoDay(job.publishedAt))}`, 'posted', { date: localDate(isoDay(job.publishedAt), l) }) : say('Not published yet', 'notPublished')}</span>
        <span className="inline-flex items-center gap-1">
          <FlagIcon size={11} strokeWidth={2} /> {say('Report this job', 'report')}
        </span>
      </div>
      {share && (
        <div className="flex flex-col gap-1.5" lang="en" dir="ltr">
          <span className="aj-faint">Share this job</span>
          <CommunityButtons msg={shareMessage(job, s.org)} url={jobUrl(job)} copy={copyText} />
        </div>
      )}
    </article>
  );
}

/** The job page with a switch between English and its language versions; `drafts` also shows versions not yet reviewed, labelled. */
export function JobPageLangs({ job, s, drafts = false, share = false }: { job: DemoJob; s: State; drafts?: boolean; share?: boolean }) {
  const [lang, setLang] = useState<Lang | null>(null);
  const shown = drafts ? LANGS.filter((x) => job.translations?.[x.key]).map((x) => x.key) : publicLangs(job);
  const current = lang && shown.includes(lang) ? lang : null;
  return (
    <div className="flex flex-col gap-3">
      {shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" onKeyDown={radioKeys} aria-label="Language of the job page">
          <button type="button" role="radio" aria-checked={!current} className="aj-pill" data-active={!current} style={{ height: 28 }} onClick={() => setLang(null)}>
            English
          </button>
          {shown.map((k) => {
            const t = job.translations?.[k];
            const draft = !t?.reviewed || (t && stale(job, t));
            return (
              <button key={k} type="button" role="radio" aria-checked={current === k} className="aj-pill" data-active={current === k} style={{ height: 28 }} onClick={() => setLang(k)} lang={k}>
                {langOf(k).native}
                {draft && <span className="aj-faint"> · draft</span>}
              </button>
            );
          })}
        </div>
      )}
      <JobPage job={job} s={s} lang={current ?? undefined} share={share} />
    </div>
  );
}

function GooglePreview({ job, s }: { job: DemoJob; s: State }) {
  return (
    <div className="aj-card flex flex-col gap-1 p-4" aria-label="Google result preview">
      <div className="aj-faint" style={{ fontSize: 11 }}>
        aidjobs.app › jobs › {slug(job.facts.title)}
      </div>
      <div style={{ color: '#1a0dab', fontSize: 16 }}>
        {job.facts.title} – {s.org.name}
        {job.facts.location ? ` – ${job.facts.location.split(',')[0]}` : ''} | AidJobs
      </div>
      <div className="aj-muted" style={{ fontSize: 12 }}>
        {job.facts.deadline ? `Closes ${longDate(job.facts.deadline)}. ` : ''}
        {(job.sections.find((x) => x.key === 'role') ?? job.sections[0])?.lines[0]?.slice(0, 150)}…
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="aj-chip">{job.facts.contract || 'Contract not stated'}</span>
        <span className="aj-chip">{salaryText(job.facts) || 'Salary not shown'}</span>
        <span className="aj-chip" data-tone="sage">
          Job listing data: title, place, dates, employer
        </span>
      </div>
    </div>
  );
}

function ShareCards({ job, s }: { job: DemoJob; s: State }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="aj-card flex flex-col gap-2 p-3" aria-label="WhatsApp preview">
        <span className="aj-faint" style={{ fontSize: 11 }}>
          WhatsApp
        </span>
        <div className="rounded-xl p-2.5" style={{ background: '#dcf8c6', color: '#111' }}>
          <div className="rounded-lg p-2" style={{ background: '#cfe9ba' }}>
            <div style={{ fontWeight: 700, fontSize: 12 }}>{job.facts.title} – {s.org.short}</div>
            <div style={{ fontSize: 11 }}>aidjobs.app</div>
          </div>
          <div style={{ fontSize: 12, marginTop: 6 }}>We&apos;re hiring! {s.org.name} is looking for a {job.facts.title}…</div>
        </div>
      </div>
      <div className="aj-card flex flex-col gap-2 p-3" aria-label="LinkedIn preview">
        <span className="aj-faint" style={{ fontSize: 11 }}>
          LinkedIn
        </span>
        <div className="overflow-hidden rounded-xl border aj-hair">
          <div className="flex h-16 items-center justify-center" style={{ background: 'var(--sage-2)', color: 'var(--sage-8)', fontWeight: 700 }}>
            {s.org.short} is hiring
          </div>
          <div className="p-2">
            <div style={{ fontWeight: 650, fontSize: 12 }}>{job.facts.title}</div>
            <div className="aj-faint" style={{ fontSize: 11 }}>
              aidjobs.app · {job.facts.location}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CommunityButtons({ msg, url, copy }: { msg: string; url: string; copy: (t: string, what: string) => void }) {
  const native = async () => {
    try {
      if (navigator.share) await navigator.share({ text: msg, url });
      else copy(msg, 'Message');
    } catch {
      /* share sheet dismissed */
    }
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className="aj-pill" onClick={() => copy(url, 'Link')}>
        <Copy size={13} strokeWidth={1.8} /> Copy job link
      </button>
      <button type="button" className="aj-pill" onClick={() => copy(msg, 'Message')}>
        <Copy size={13} strokeWidth={1.8} /> Copy message
      </button>
      <a className="aj-pill" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer">
        <MessageCircle size={13} strokeWidth={1.8} /> WhatsApp
      </a>
      <a className="aj-pill" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">
        <Linkedin size={13} strokeWidth={1.8} /> LinkedIn
      </a>
      <button type="button" className="aj-pill" onClick={native}>
        <Share2 size={13} strokeWidth={1.8} /> More
      </button>
    </div>
  );
}

function ApprovalBlock({ job, s, onSkip }: { job: DemoJob; s: State; onSkip: () => void }) {
  const waiting = job.review.reviewers.filter((r) => !r.decision).map((r) => r.name.split(' ')[0]);
  const why = s.org.approval === 'all' ? 'Your organisation asks for approval on every job.' : 'Your organisation asks for approval on senior roles (P4 and above, and D grades).';
  const askers = job.review.reviewers.filter((r) => r.decision === 'changes').map((r) => r.name.split(' ')[0]);
  const state = pausedByChanges(s, job)
    ? `${askers.join(' and ')} asked for changes, and your organisation pauses publishing until a request for changes is dealt with.`
    : job.review.state === 'none'
      ? 'Send it for review first.'
      : job.review.state === 'changes'
        ? 'Changes were requested.'
        : waiting.length
          ? `Waiting for ${waiting.join(' and ')}.`
          : 'Waiting for your reviewers.';
  return (
    <div className="aj-card flex flex-col gap-2 p-4" style={{ borderColor: 'var(--amber)' }} role="status">
      <div style={{ fontWeight: 650 }}>Approval is required for this job</div>
      <span className="aj-muted">
        {why} {state}
      </span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button type="button" className="aj-pill" onClick={() => go('create', job.id)}>
          {job.review.state === 'none' ? 'Back to the job to send it for review' : 'Back to the job'}
        </button>
        {canSkipApproval(s, job) && (
          <button type="button" className="aj-text-btn" onClick={onSkip}>
            Publish without approval
          </button>
        )}
      </div>
    </div>
  );
}

const first = (name: string) => name.split(' ')[0];

/** Under "any one reviewer": approved, and someone then asked for changes. The person publishing decides, with the situation in front of them. */
function ChangesNote({ job, onPublishAnyway }: { job: DemoJob; onPublishAnyway: () => void }) {
  const open = changesAfterApproval(job);
  if (!open) return null;
  const askers = open.askers.map((a) => first(a.name)).join(' and ');
  const notes = open.askers.filter((a) => a.note).map((a) => a.note as string);
  const stop = notes.length && /[.!?]$/.test(notes[notes.length - 1]) ? '' : '.';
  return (
    <div className="aj-card flex flex-col gap-2 p-4" style={{ borderColor: 'var(--amber)' }} role="status">
      <div style={{ fontWeight: 650 }}>Approved, with a request for changes</div>
      <span className="aj-muted">
        {open.approvers.map(first).join(' and ')} approved this version. {askers} then asked for changes
        {notes.length ? `: ${notes.map((n) => `“${n}”`).join(' ')}` : ''}
        {stop}
      </span>
      <span className="aj-muted">
        Your rule needs one approval, so it can be published. Look at the request first, or publish anyway: that is written in the job&apos;s history, and {askers} {open.askers.length === 1 ? 'is' : 'are'} told.
      </span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button
          type="button"
          className="aj-pill"
          onClick={() => {
            try {
              localStorage.setItem('aidjobs.employerDemo.panel', 'review');
            } catch {
              /* storage unavailable: the job opens with its usual panel */
            }
            go('create', job.id);
          }}
        >
          Look at the request
        </button>
        <button type="button" className="aj-text-btn" onClick={onPublishAnyway}>
          Publish anyway
        </button>
      </div>
    </div>
  );
}

function OverruleDialog({ job, onDone, onClose }: { job: DemoJob; onDone: () => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const askers = (changesAfterApproval(job)?.askers ?? []).map((a) => first(a.name)).join(' and ');
  return (
    <Dialog
      title="Publish anyway?"
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
              overruleChanges(job.id, reason);
              onDone();
            }}
          >
            Publish anyway
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <p style={{ margin: 0 }}>
          {askers} asked for changes after the approval. Publishing now is written in the job&apos;s history, which only your organisation sees, and {askers} {askers.includes(' and ') ? 'are' : 'is'} told.
        </p>
        <textarea style={{ ...inputStyle, minHeight: 64 }} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason (optional)" placeholder="Reason (optional), for example: the change is minor and we will fix it in the next round." />
      </div>
    </Dialog>
  );
}

function SkipDialog({ job, onDone, onClose }: { job: DemoJob; onDone: () => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const asked = job.review.reviewers.map((r) => r.name.split(' ')[0]);
  return (
    <Dialog
      title="Publish without approval"
      subtitle={job.facts.title}
      onClose={onClose}
      half
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="aj-pill" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="aj-ink-btn" disabled={reason.trim().length < 5} onClick={() => overrideApproval(job.id, reason) && onDone()}>
            Publish without approval
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <p style={{ margin: 0 }}>
          Why does it need to go out without approval? The reason is kept in the job&apos;s history, which only your organisation sees
          {asked.length ? `, and ${asked.join(' and ')} ${asked.length === 1 ? 'is' : 'are'} told` : ''}.
        </p>
        <textarea style={{ ...inputStyle, minHeight: 72 }} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for publishing without approval" placeholder="For example: the donor deadline is today and Daniel is travelling." />
      </div>
    </Dialog>
  );
}

function TermsDialog({ s, action, onAccept, onClose }: { s: State; action: string; onAccept: () => void; onClose: () => void }) {
  return (
    <Dialog
      title="Free jobs: the terms"
      onClose={onClose}
      half
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="aj-pill" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="aj-ink-btn" onClick={onAccept}>
            I understand · {action}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <FreeTerms s={s} />
        <span className="aj-faint">Shown once, the first time your organisation publishes a free job. The terms are also on the Billing page.</span>
      </div>
    </Dialog>
  );
}

/** One choice, Free or Amplify: the radio is the heading button; the terms under it are information. */
function Choice({ on, title, price, onSelect, children, amplified, disabled }: { on: boolean; title: string; price: string; onSelect: () => void; children: ReactNode; amplified?: boolean; disabled?: boolean }) {
  return (
    <div className={`${amplified ? 'ej-amplified ' : ''}aj-card flex flex-col gap-2 p-4`} style={{ borderColor: on ? 'var(--sage-5)' : undefined, boxShadow: on ? '0 0 0 1px var(--sage-5)' : undefined }}>
      <button type="button" role="radio" aria-checked={on} disabled={disabled} onClick={onSelect} className="flex w-full items-center gap-2 text-left" style={{ border: 'none', background: 'transparent', padding: 0, cursor: disabled ? 'default' : 'pointer', color: 'inherit', font: 'inherit' }}>
        <span className="ej-radio" data-on={on} aria-hidden />
        <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
        <span className="ml-auto" style={{ fontWeight: 700 }}>
          {price}
        </span>
      </button>
      {children}
    </div>
  );
}

function Success({ job, s, onAmplify }: { job: DemoJob; s: State; onAmplify: () => void }) {
  const url = jobUrl(job);
  const until = listedUntil(job, s.today);
  const scheduled = job.status === 'scheduled';
  const round = job.reach?.rounds[job.reach.rounds.length - 1];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      notify('Link copied');
    } catch {
      notify('Copy failed: select the link and copy it yourself');
    }
  };
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-6 lg:px-8 lg:py-10">
      <span className="ej-panel-label inline-flex items-center gap-1.5">
        <CheckCircle2 size={13} strokeWidth={2} style={{ color: 'var(--sage-7)' }} /> {scheduled ? `Scheduled for ${longDate(job.scheduledFor ?? '')}` : 'Live on AidJobs'}
      </span>
      <h1 className="aj-display aj-h1" style={{ margin: 0 }}>
        {job.facts.title}
      </h1>
      <p className="aj-muted" style={{ margin: 0 }}>
        {job.plan === 'amplify' ? `Amplified: featured, with the “${BADGE}” badge, listed until ${longDate(until)}.` : `Free: standard placement, listed until ${longDate(until)}.`}
        {publicLangs(job).length > 0 ? ` In English and ${publicLangs(job).map((k) => langOf(k).label).join(' and ')}.` : ''} In this demo it is published only in this browser.
      </p>
      <div className="aj-card flex items-center gap-2 py-2 pl-3 pr-2">
        <span className="aj-muted min-w-0 flex-1 truncate">{url}</span>
        <button type="button" className="aj-pill shrink-0" onClick={copy}>
          <Copy size={13} strokeWidth={1.8} /> Copy link
        </button>
      </div>
      {job.plan === 'amplify' && (
        <div className="aj-card flex flex-col gap-1 p-3" aria-live="polite">
          <span style={{ fontWeight: 650 }}>Reach</span>
          {round ? (
            <>
              <span className="aj-muted">Invitations: {deliveryText(job.reach?.candidates.filter((r) => r.round === round.n) ?? [])}</span>
              <span className="aj-muted">Team: {deliveryText(job.reach?.team.filter((r) => r.round === round.n) ?? [])}</span>
              <span className="aj-faint" style={{ fontSize: 11.5 }}>
                {round.sendsOn && job.status === 'scheduled' ? `Sends on ${longDate(round.sendsOn)}, when the job goes live.` : 'Simulated.'} The job is published either way: an email that fails never unpublishes it.
              </span>
            </>
          ) : (
            <span className="aj-muted">Nobody invited yet. You can invite people from the job&apos;s page while it is live, and AidJobs reminds you when it helps.</span>
          )}
        </div>
      )}
      {job.plan !== 'amplify' && (
        <span className="aj-faint">Visitors can share it to WhatsApp, LinkedIn, and more from the job page.</span>
      )}
      <div className="flex flex-wrap gap-1.5">
        {!scheduled && (
          <button type="button" className="aj-ink-btn" onClick={() => go('public', job.id)}>
            View the job page
          </button>
        )}
        <button type="button" className="aj-pill" onClick={() => go('jobs', job.id)}>
          Manage this job
        </button>
        <button type="button" className="aj-pill" onClick={() => go('create')}>
          Create another job
        </button>
      </div>
      {job.plan === 'free' && (
        <button type="button" className="aj-text-btn self-start" onClick={onAmplify}>
          Amplify to invite people directly
        </button>
      )}
    </div>
  );
}

function jobLabel(job: DemoJob): string {
  const city = job.facts.location.split(',')[0];
  return `${job.facts.title}${city ? ` – ${city}` : ''}`;
}

/** "Ask to pay": choose who holds the card, see what they receive, send. */
function AskToPayDialog({ job, s, request, onClose }: { job: DemoJob; s: State; request: Omit<PayRequest, 'at' | 'name' | 'email' | 'note'>; onClose: () => void }) {
  const people = s.team.filter((p) => p.id !== s.me.id && p.role !== 'reviewer');
  const [picked, setPicked] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const person = people.find((p) => p.id === picked);
  const to = person ? { name: person.name, email: person.email } : isEmail(email) ? { name: email.trim(), email: email.trim() } : null;
  return (
    <Dialog
      title="Ask someone else to pay"
      subtitle={`${request.amount} · simulated, nothing is sent`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="aj-pill" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="aj-ink-btn" disabled={!to} onClick={() => to && askToPay(job.id, { ...request, ...to, note: note.trim() }) && onClose()}>
            Send the request
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <span className="aj-muted">For when finance or your director holds the card. They get a link to pay; the job publishes once they have paid, and the receipt and invoice go to them.</span>
        {people.length > 0 && (
          <Field label="Someone in your team">
            <div className="flex flex-wrap gap-1.5">
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="aj-pill"
                  data-active={picked === p.id}
                  aria-pressed={picked === p.id}
                  onClick={() => {
                    setPicked(picked === p.id ? null : p.id);
                    setEmail('');
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </Field>
        )}
        <Field label="Or an email address" hint="For example your finance team, who may not use AidJobs">
          <input
            style={inputStyle}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setPicked(null);
            }}
            placeholder={`finance@${s.org.domain}`}
            inputMode="email"
          />
        </Field>
        <Field label="A note (optional)">
          <textarea style={{ ...inputStyle, minHeight: 56 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: from the WASH budget line, please." />
        </Field>
        <div className="flex flex-col gap-1 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
          <span className="aj-faint">What {to ? to.name.split(' ')[0] : 'they'} will receive</span>
          <strong>
            {s.me.name} asks you to pay {request.amount} to publish {jobLabel(job)}
          </strong>
          {note.trim() && <span className="aj-muted">&ldquo;{note.trim()}&rdquo;</span>}
          <span className="aj-muted">{request.item}</span>
        </div>
      </div>
    </Dialog>
  );
}

/** The payer's page, reached from the link in their email (simulated in the demo). */
function PayerDialog({ job, s, onPaid, onClose }: { job: DemoJob; s: State; onPaid: () => void; onClose: () => void }) {
  const [declined, setDeclined] = useState(false);
  const req = job.payRequest;
  if (!req) return null;
  return (
    <Dialog
      title="Payment request"
      subtitle={`Demo: what ${req.name.split(' ')[0]} sees from the link`}
      onClose={onClose}
      half
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="aj-text-btn mr-auto" onClick={() => setDeclined(true)}>
            Simulate a declined card
          </button>
          <button type="button" className="aj-pill" onClick={onClose}>
            Close
          </button>
          <button type="button" className="aj-ink-btn" onClick={() => (completePayRequest(job.id) ? onPaid() : notify('It could not be published, so nothing was charged. Check the job, then ask again.'))}>
            Pay {req.amount}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <OrgMark name={s.org.name} />
          <strong>{s.org.name}</strong>
        </div>
        <span style={{ fontSize: 15, fontWeight: 650 }}>
          {s.me.name} asks you to pay {req.amount} to publish {jobLabel(job)}
        </span>
        {req.note && <span className="aj-muted">&ldquo;{req.note}&rdquo;</span>}
        <div className="aj-card flex items-center justify-between gap-3 p-3">
          <span className="min-w-0">{req.item}</span>
          <strong className="shrink-0">{req.amount}</strong>
        </div>
        {declined && (
          <span role="alert" style={{ color: 'var(--red)' }}>
            The card was declined (simulated). Nothing was charged, and the request stays open.
          </span>
        )}
        <span className="aj-faint">Billed to {req.email}. Paddle is the merchant of record: it charges the card and sends the receipt and invoice to you. Prices are placeholders.</span>
      </div>
    </Dialog>
  );
}

type View = 'page' | 'google' | 'share';

/** The publish panel: the preview beside the choices, and one button that says what happens (employer-side plan, section 16). */
export default function Publish({ id }: { id?: string }) {
  const s = useDemo();
  const job = s.jobs.find((j) => j.id === id);
  const [plan, setPlan] = useState<Plan>(() => (job && canGoFree(s, job.id, null) ? 'free' : 'amplify'));
  const [pkg, setPkg] = useState<PackageKey>('one');
  const [plansOpen, setPlansOpen] = useState(false);
  const [schedule, setSchedule] = useState<string | null>(null);
  const [view, setView] = useState<View>('page');
  const [checkout, setCheckout] = useState<PackageKey | 'extra' | null>(null);
  const [failed, setFailed] = useState<null | 'declined' | 'closed'>(null);
  const [terms, setTerms] = useState<{ schedule: string | null } | null>(null);
  const [skip, setSkip] = useState(false);
  const [done, setDone] = useState(false);
  const [asking, setAsking] = useState(false);
  const [payerOpen, setPayerOpen] = useState(false);
  const [overrule, setOverrule] = useState(false);

  if (!job) {
    return (
      <div className="p-6">
        <button type="button" className="aj-ink-btn" onClick={() => go('create')}>
          Create a job
        </button>
      </div>
    );
  }
  if (job.status === 'closed') {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-start gap-3 p-6">
        <p className="aj-muted" style={{ margin: 0 }}>
          This job is closed. Hire again from Manage jobs to publish it anew.
        </p>
        <button type="button" className="aj-ink-btn" onClick={() => go('jobs', job.id)}>
          Open in Manage jobs
        </button>
      </div>
    );
  }
  const published = job.status === 'live' || job.status === 'scheduled';
  const upgrade = published && job.plan === 'free' && !done;
  if (done || (published && !upgrade)) return <Success job={job} s={s} onAmplify={() => setDone(false)} />;

  const chosen: Plan = upgrade ? 'amplify' : plan;
  const nowMonth = currentMonth(s);
  const month = monthFor(s, schedule);
  const nextFirst = firstOfNextMonth(nowMonth);
  const counted = hasFreeUse(s, job.id);
  const freeOk = canGoFree(s, job.id, schedule);
  const onHand = nextPaidJob(s);
  const onHandCount = paidJobsLeft(s);
  const single = singlePrice(s);
  const subscribed = Boolean(s.subscription && !s.subscription.cancelled);
  const payKey: PackageKey | 'extra' = pkg === 'one' ? single.key : pkg;
  const blocked = !upgrade && approvalRequired(s, job) && !approvedFor(s, job);
  const request = job.payRequest;
  const dateBlock = upgrade ? null : scheduleBlock(s, job, schedule);
  const reason = s.reviewerAs ? 'Reviewers cannot publish' : blocked ? 'Waiting for approval' : dateBlock ? dateBlock : chosen === 'free' && !freeOk ? `No free job left for ${monthName(month)}` : chosen === 'amplify' && !s.org.verified ? 'Verify your organisation to amplify' : null;
  /** The 1st of a month is offered for a free job only when the job is still open then. */
  const freeFrom = (first: string) => canGoFree(s, job.id, first) && !scheduleBlock(s, job, first);
  const when = schedule ? ` for ${longDate(schedule)}` : '';
  const invites = chosen === 'amplify' ? planCount(job, job.reachPlan) : 0;
  const inviting = invites ? ` · invite ${invites} ${invites === 1 ? 'person' : 'people'} ${upgrade && job.status === 'live' ? 'now' : 'when live'}` : '';
  const label =
    reason ??
    (upgrade
      ? `Amplify this job${inviting} · ${onHand ? 'uses 1 package job' : priceLabel(payKey)}`
      : chosen === 'free'
        ? schedule
          ? `Schedule free${when}`
          : 'Publish free'
        : `${schedule ? `Amplify and schedule${when}` : 'Amplify and publish'}${inviting} · ${onHand ? 'uses 1 package job' : priceLabel(payKey)}`);
  const shown: DemoJob = { ...job, plan: chosen, scheduledFor: schedule ?? job.scheduledFor };
  const freeUntil = listedUntil({ ...job, plan: 'free', publishedAt: undefined, scheduledFor: schedule ?? undefined }, s.today);
  const checkoutItem = payKey === 'one' ? `Amplify: ${job.facts.title}` : payKey === 'extra' ? `Extra job on “Always hiring”: ${job.facts.title}` : payKey === 'always' ? '“Always hiring” subscription, first month (3 jobs)' : `${packageOf(payKey).jobs} jobs, one used for ${job.facts.title}`;
  const checkoutAmount = payKey === 'extra' ? usd(single.amount) : usd(packageOf(payKey).price);

  const finish = (ok: boolean) => {
    if (ok) {
      setFailed(null);
      setDone(true);
    } else notify('It could not be published. Check the choices and try again.');
  };
  const publishFree = (date: string | null) => {
    if (!getState().org.freeTermsAccepted) setTerms({ schedule: date });
    else finish(publish(job.id, { plan: 'free', schedule: date }));
  };
  const proceed = () => {
    const now = getState().jobs.find((x) => x.id === job.id);
    if (!upgrade && now && changesAfterApproval(now) && now.review.overruled === undefined) return setOverrule(true);
    setFailed(null);
    if (chosen === 'free') publishFree(schedule);
    else if (onHand) finish(upgrade ? amplifyLive(job.id, 'onHand') : publish(job.id, { plan: 'amplify', schedule, paid: 'onHand' }));
    else setCheckout(payKey);
  };
  const paid = (key: PackageKey | 'extra') => {
    buy(key, job.facts.title);
    setCheckout(null);
    const how: Paid = key === 'one' || key === 'extra' ? 'direct' : 'onHand';
    finish(upgrade ? amplifyLive(job.id, how) : publish(job.id, { plan: 'amplify', schedule, paid: how }));
  };
  const failedPay = (why: 'declined' | 'closed') => {
    setCheckout(null);
    setFailed(why);
  };

  const views: Array<[View, string]> = [
    ['page', 'Job page'],
    ['google', 'In Google'],
    ['share', 'When shared'],
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 py-5 lg:px-8 lg:py-6">
      <div className="flex items-center gap-2">
        <Tip label={upgrade ? 'Back to the job' : 'Back to the job description'} side="bottom">
          <button type="button" className="aj-icon-btn" onClick={() => (upgrade ? go('jobs', job.id) : go('create', job.id))} aria-label="Back">
            <ArrowLeft size={15} strokeWidth={1.8} />
          </button>
        </Tip>
        <div className="min-w-0 flex-1">
          <span className="ej-panel-label">{upgrade ? 'Amplify a live free job' : 'Publish'}</span>
          <h1 className="aj-display aj-h1 truncate" style={{ margin: 0 }}>
            {job.facts.title || 'Untitled job'}
          </h1>
        </div>
        <span className="hidden sm:inline">
          <DemoMark label="Demo · simulated payment, placeholder prices" />
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <section className="order-2 flex min-w-0 flex-col gap-3 lg:order-1" aria-label="Preview">
          <BeforePublish job={job} s={s} amplify={chosen === 'amplify'} schedule={upgrade ? null : schedule} url={jobUrl(job)} onChooseAmplify={() => setPlan('amplify')} />
          <div className="aj-switch self-start" style={{ gridTemplateColumns: 'repeat(3, auto)' }} role="radiogroup" onKeyDown={radioKeys} aria-label="Preview">
            {views.map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={view === k} data-active={view === k} onClick={() => setView(k)}>
                {l}
              </button>
            ))}
          </div>
          {view === 'page' && (
            <div className="aj-card p-4 lg:p-6">
              <JobPageLangs job={shown} s={s} drafts={chosen === 'amplify'} />
            </div>
          )}
          {view === 'google' && <GooglePreview job={shown} s={s} />}
          {view === 'share' && <ShareCards job={shown} s={s} />}
        </section>

        <section className="order-1 flex flex-col gap-3 lg:sticky lg:top-4 lg:order-2" aria-label="How to publish">
          {blocked && <ApprovalBlock job={job} s={s} onSkip={() => setSkip(true)} />}
          {!blocked && !upgrade && <ChangesNote job={job} onPublishAnyway={() => setOverrule(true)} />}
          {request && (
            <div className="aj-card flex flex-col gap-2 p-4" style={{ borderColor: 'var(--sage-3)' }} role="status">
              <div style={{ fontWeight: 650 }}>
                Waiting for {request.name} to pay {request.amount}
              </div>
              <span className="aj-muted">
                Asked {new Date(request.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
                {request.reminded ? `, reminded ${new Date(request.reminded).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : ''}. The job {upgrade ? 'is amplified' : 'publishes'} as soon as they have paid
                {invites ? `, and the ${invites} invitations go out` : ''}. You can still pay yourself below.
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" className="aj-ink-btn" onClick={() => setPayerOpen(true)}>
                  See their payment page (demo)
                </button>
                <button type="button" className="aj-pill" onClick={() => remindPayer(job.id)}>
                  Remind
                </button>
                <button type="button" className="aj-text-btn" onClick={() => cancelPayRequest(job.id)}>
                  Cancel the request
                </button>
              </div>
            </div>
          )}
          {failed && (
            <div className="aj-card flex flex-col gap-2 p-4" style={{ borderColor: 'var(--red)' }} role="alert">
              <div className="flex items-center gap-2" style={{ fontWeight: 650 }}>
                <AlertCircle size={15} strokeWidth={2} style={{ color: 'var(--red)' }} /> {failed === 'declined' ? 'The card was declined' : 'The payment was not completed'}
              </div>
              <span className="aj-muted">{upgrade ? 'The job stays free and live. Nothing was charged.' : 'The job is still a draft. Nothing was published or charged.'} (Simulated.)</span>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="aj-ink-btn" onClick={() => setCheckout(payKey)}>
                  Try again
                </button>
                {!upgrade && canGoFree(s, job.id, null) && (
                  <button
                    type="button"
                    className="aj-pill"
                    onClick={() => {
                      setFailed(null);
                      setPlan('free');
                      setSchedule(null);
                      publishFree(null);
                    }}
                  >
                    Publish free instead
                  </button>
                )}
                {!upgrade && !canGoFree(s, job.id, null) && freeFrom(nextFirst) && (
                  <button
                    type="button"
                    className="aj-pill"
                    onClick={() => {
                      setFailed(null);
                      setPlan('free');
                      setSchedule(nextFirst);
                    }}
                  >
                    Schedule free for {longDate(nextFirst)} instead
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2" role="radiogroup" onKeyDown={radioKeys} aria-label="Free or Amplify">
            {!upgrade && (
              <Choice on={chosen === 'free'} title="Free" price="US$0" onSelect={() => setPlan('free')}>
                <span className="aj-muted" style={{ fontWeight: 600 }}>
                  {counted ? 'This job already counts as one of your free jobs: it was downloaded or sent for review.' : `${freeLeft(s, month)} of ${FREE_PER_MONTH} free jobs left in ${monthName(month)}`}
                </span>
                <FreeTerms s={s} />
                {!freeOk && (
                  <div className="flex flex-col items-start gap-1.5 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
                    <span>Both free jobs for {monthName(month)} are used.</span>
                    {freeFrom(firstOfNextMonth(month)) && (
                      <button
                        type="button"
                        className="aj-pill"
                        onClick={() => {
                          setPlan('free');
                          setSchedule(firstOfNextMonth(month));
                        }}
                      >
                        <CalendarClock size={13} strokeWidth={1.8} /> Schedule free for {longDate(firstOfNextMonth(month))}
                      </button>
                    )}
                  </div>
                )}
                {chosen === 'free' && job.facts.deadline && job.facts.deadline > freeUntil && (
                  <span style={{ color: 'var(--amber)' }}>
                    A free job is listed {LISTED_DAYS.free} days, so this one leaves AidJobs on {longDate(freeUntil)}, before its closing date. Amplify lists it {LISTED_DAYS.amplify} days.
                  </span>
                )}
              </Choice>
            )}
            <Choice on={chosen === 'amplify'} title="Amplify" price={onHand ? 'Package job' : `${usd(pkg === 'one' ? single.amount : packageOf(pkg).price)}${pkg === 'always' ? ' a month' : ''}`} onSelect={() => setPlan('amplify')} amplified disabled={upgrade}>
                {upgrade && (
                  <span className="aj-muted" style={{ fontWeight: 600 }}>
                    Now free, listed until {longDate(listedUntil(job, s.today))}.{' '}
                    {listedUntil(shown, s.today) !== listedUntil(job, s.today) ? `Amplified, it is listed until ${longDate(listedUntil(shown, s.today))}.` : 'Its closing date comes first, so the listing ends then either way.'}
                  </span>
                )}
                <AmplifyIncludes />
                {onHand ? (
                  <span className="aj-muted" style={{ fontWeight: 600 }}>
                    Uses 1 of your {onHandCount} package {onHandCount === 1 ? 'job' : 'jobs'}
                    {onHand.kind === 'pack' ? `, to use by ${longDate(onHand.pack.ends)}.` : ', for this month of “Always hiring”.'}
                  </span>
                ) : (
                  <>
                    <button type="button" className="aj-text-btn self-start" aria-expanded={plansOpen} onClick={() => setPlansOpen(!plansOpen)}>
                      Hiring more? Plan ahead and pay less per job
                    </button>
                    {plansOpen && (
                      <div className="flex flex-col gap-1.5" role="radiogroup" onKeyDown={radioKeys} aria-label="Packages">
                        {PACKAGES.filter((p) => !(p.key === 'always' && s.subscription)).map((p) => {
                          const extra = p.key === 'one' && single.key === 'extra';
                          return (
                            <button
                              key={p.key}
                              type="button"
                              role="radio"
                              aria-checked={pkg === p.key}
                              className="aj-option"
                              data-active={pkg === p.key}
                              onClick={() => {
                                setPkg(p.key);
                                setPlan('amplify');
                              }}
                            >
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center">{pkg === p.key && <Check size={14} strokeWidth={2.4} />}</span>
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span style={{ fontWeight: 650 }}>{extra ? 'One extra job' : p.label}</span>
                                <span className="aj-faint">{extra ? 'On your “Always hiring” subscription' : p.rule}</span>
                              </span>
                              <span className="flex shrink-0 flex-col items-end">
                                <strong>
                                  {usd(extra ? single.amount : p.price)}
                                  {p.key === 'always' ? ' a month' : ''}
                                </strong>
                                {p.key !== 'one' && <span className="aj-faint">{usd(p.perJob)} a job</span>}
                              </span>
                            </button>
                          );
                        })}
                        <span className="aj-faint" style={{ fontSize: 11.5 }}>
                          The same prices for every type of organisation; placeholders for now. Unused package jobs lapse, with reminders 2 weeks and 3 days before. A package job can also amplify a live free job; a free job once used stays used.
                        </span>
                      </div>
                    )}
                  </>
                )}
                {!s.org.verified && (
                  <span style={{ color: 'var(--amber)' }}>
                    Amplified jobs come from verified organisations.{' '}
                    <button type="button" className="aj-text-btn" style={{ height: 'auto', padding: 0 }} onClick={() => go('org')}>
                      Verify yours
                    </button>
                  </span>
                )}
            </Choice>
          </div>

          {chosen === 'amplify' && <ReachRow job={job} s={s} sendsOn={upgrade ? (job.status === 'scheduled' ? (job.scheduledFor ?? null) : null) : schedule} live={upgrade && job.status === 'live'} />}

          {!upgrade && (
            <div className="flex flex-wrap items-center gap-2">
              <CalendarClock size={15} strokeWidth={1.8} className="aj-faint" />
              <span className="aj-muted">Publish</span>
              <button type="button" className="aj-pill" data-active={!schedule} onClick={() => setSchedule(null)}>
                Now
              </button>
              <button type="button" className="aj-pill" data-active={Boolean(schedule)} onClick={() => setSchedule(schedule ?? addDays(s.today, 1))}>
                Schedule
              </button>
              {schedule && <input type="date" style={{ ...inputStyle, width: 170, minHeight: 34 }} value={schedule} min={addDays(s.today, 1)} onChange={(e) => setSchedule(e.target.value || null)} aria-label="Publish on" />}
            </div>
          )}

          <button type="button" className="aj-ink-btn w-full justify-center" style={{ minHeight: 44 }} disabled={Boolean(reason)} onClick={proceed}>
            {label}
          </button>
          <span className="aj-faint text-center" style={{ fontSize: 11.5 }}>
            {chosen === 'free' ? 'Nothing to pay.' : onHand ? 'Nothing to pay now: it uses a job you have already paid for.' : 'Simulated checkout: no card is charged. Receipts are on the Billing page.'}
          </span>
          {chosen === 'amplify' && !onHand && !reason && !request && (
            <div className="flex justify-center">
              <Tip label="For when someone else holds the card, such as finance or your director. They get a link to pay; the job publishes once they have paid, and the receipt goes to them.">
                <button type="button" className="aj-text-btn" onClick={() => setAsking(true)}>
                  Ask someone else to pay
                </button>
              </Tip>
            </div>
          )}
        </section>
      </div>

      {checkout && <Checkout item={checkoutItem} amount={checkoutAmount} onPaid={() => paid(checkout)} onDeclined={() => failedPay('declined')} onClose={() => failedPay('closed')} />}
      {asking && <AskToPayDialog job={job} s={s} request={{ key: payKey, amount: checkoutAmount, item: checkoutItem, schedule: upgrade ? null : schedule }} onClose={() => setAsking(false)} />}
      {payerOpen && (
        <PayerDialog
          job={job}
          s={s}
          onClose={() => setPayerOpen(false)}
          onPaid={() => {
            setPayerOpen(false);
            setFailed(null);
            setDone(true);
          }}
        />
      )}
      {overrule && (
        <OverruleDialog
          job={job}
          onClose={() => setOverrule(false)}
          onDone={() => {
            setOverrule(false);
            proceed();
          }}
        />
      )}
      {skip && (
        <SkipDialog
          job={job}
          onClose={() => setSkip(false)}
          onDone={() => {
            setSkip(false);
            proceed();
          }}
        />
      )}
      {terms && (
        <TermsDialog
          s={s}
          action={terms.schedule ? `Schedule free for ${longDate(terms.schedule)}` : 'Publish free'}
          onClose={() => setTerms(null)}
          onAccept={() => {
            setTerms(null);
            acceptFreeTerms();
            finish(publish(job.id, { plan: 'free', schedule: terms.schedule }));
          }}
        />
      )}
    </div>
  );
}

