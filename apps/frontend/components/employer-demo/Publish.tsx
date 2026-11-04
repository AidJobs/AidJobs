'use client';

import { ArrowLeft, BadgeCheck, CalendarClock, Check, Clock, Copy, ExternalLink, Flag as FlagIcon, Linkedin, Mail, MapPin, Megaphone, MessageCircle, Share2, ShieldCheck, Sparkles, UserPlus, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import Flag from '@/components/site/Flag';
import { useSiteSettings } from '@/components/site/SiteRoot';
import Tip from '@/components/site/Tip';
import {
  approvalRequired,
  buyCredits,
  FREE_LIVE,
  isApproved,
  liveStandard,
  overrideApproval,
  payPremium,
  PREMIUM_EMAILS,
  PRICE_LABEL,
  publish,
} from './actions';
import { addDays, arrangementLabel, commitmentText, COMMITMENTS, daysUntil, inOutlineOrder, longDate, salaryText, slug } from './engine';
import { openSandboxCheckout, paddleConfigured, PRICE_PACK, PRICE_PREMIUM } from './paddle';
import { go, notify, updateJob, useDemo } from './store';
import type { DemoJob, Org, ReachRecord, State } from './types';
import { Dialog, Field, inputStyle, OrgMark, RecipientInput } from './ui';

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
    `${org.name} is looking for a ${j.facts.title}${j.facts.location ? ` in ${j.facts.location}` : ''}.`,
    '',
    'If you or someone in your professional network has relevant experience, take a look at this opportunity.',
    '',
    ...(j.facts.deadline ? [`Application deadline: ${longDate(j.facts.deadline)}`, ''] : []),
    `View the vacancy: ${jobUrl(j)}`,
    '',
    'Please share with anyone who might be interested.',
  ].join('\n');
}

function Lines({ lines }: { lines: string[] }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  lines.forEach((l, i) => {
    if (l.startsWith('- ')) list.push(l.slice(2));
    else {
      if (list.length) {
        out.push(<ul key={`u${i}`}>{list.map((x, k) => <li key={k}>{x}</li>)}</ul>);
        list = [];
      }
      out.push(<p key={i}>{l}</p>);
    }
  });
  if (list.length) out.push(<ul key="uend">{list.map((x, k) => <li key={k}>{x}</li>)}</ul>);
  return <>{out}</>;
}

/** The job page as visitors will see it on AidJobs. */
export function JobPage({ job, s }: { job: DemoJob; s: State }) {
  const left = job.facts.deadline ? daysUntil(s.today, job.facts.deadline) : null;
  return (
    <article className="ej-doc flex flex-col gap-3" aria-label="Job page preview">
      <div className="flex items-center gap-2">
        <OrgMark name={s.org.name} />
        <span className="aj-muted min-w-0 flex-1 truncate">{s.org.name}</span>
        {s.org.verified && (
          <Tip label="Verified employer">
            <span className="aj-chip" data-tone="sage">
              <BadgeCheck size={11} strokeWidth={2} /> Verified
            </span>
          </Tip>
        )}
        {job.plan === 'premium' && (
          <Tip label="A sponsored listing, paid for by the employer">
            <span className="aj-chip" style={{ background: 'var(--ink)', color: 'var(--on-ink)' }}>
              Premium · Sponsored
            </span>
          </Tip>
        )}
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{job.facts.title}</h2>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <MapPin size={14} strokeWidth={1.8} className="aj-faint" />
          <Flag iso={job.facts.iso || null} title={job.facts.country} />
          <span>{job.facts.location || (job.facts.arrangement === 'remote' ? 'Remote' : '')}</span>
        </div>
        {job.facts.deadline && (
          <div className="flex items-center gap-2">
            <Clock size={14} strokeWidth={1.8} className="aj-faint" />
            <span>Closes {longDate(job.facts.deadline)}</span>
            {left !== null && left >= 0 && (
              <span className="aj-chip" data-tone={left <= 3 ? 'red' : left <= 7 ? 'amber' : undefined}>
                {left === 0 ? 'Today' : `${left} days left`}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[job.facts.contract, job.facts.duration, job.facts.grade, arrangementLabel(job.facts.arrangement), job.facts.recruitment === 'roster' ? 'Roster' : job.facts.recruitment === 'proposal' ? 'Proposal stage' : '', salaryText(job.facts)].filter(Boolean).map((x) => (
          <span key={x} className="aj-chip">
            {x}
          </span>
        ))}
        {job.updatedAfterPublish && (
          <span className="aj-chip" data-tone="sage">
            Updated
          </span>
        )}
      </div>
      <div>
        <a className="aj-ink-btn" href={`${s.org.careersUrl}/apply`} target="_blank" rel="noopener noreferrer">
          Apply on {s.org.short} <ExternalLink size={13} strokeWidth={2} />
        </a>
      </div>
      {inOutlineOrder(job.sections, job.tags).map((sec) => (
        <section key={sec.key}>
          <h3>{sec.title}</h3>
          <Lines lines={sec.lines} />
        </section>
      ))}
      {job.commitments.length > 0 && (
        <section>
          <h3>Our commitments</h3>
          {job.commitments.map((k) => (
            <p key={k} className="ej-commitment">
              <strong>{COMMITMENTS.find((c) => c.key === k)?.label}.</strong> {commitmentText(k, s.org, job.facts).text}
            </p>
          ))}
        </section>
      )}
      <div className="aj-faint flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 aj-hair" style={{ fontSize: 11.5 }}>
        <span>Published by {s.org.name}</span>
        <span>{job.publishedAt ? `Posted ${new Date(job.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Not published yet'}</span>
        <span className="inline-flex items-center gap-1">
          <FlagIcon size={11} strokeWidth={2} /> Report this job
        </span>
      </div>
    </article>
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

function emailFor(kind: 'candidate' | 'team', j: DemoJob, org: Org, intro: string) {
  if (kind === 'candidate') {
    return {
      subject: `An opportunity you might be interested in – ${j.facts.title}`,
      body: [
        'Hello,',
        ...(intro ? [intro] : []),
        'We thought this opportunity might be of interest to you.',
        `${org.name} is currently recruiting for the position of **${j.facts.title}**.`,
        `The role is based in ${j.facts.location || 'the duty station'}${j.facts.deadline ? ` and applications are open until ${longDate(j.facts.deadline)}` : ''}.`,
        'You can explore the complete job description and application details here:',
      ],
      button: 'View Job & Apply',
      after: ["If this opportunity isn't right for you, please feel free to share it with someone who might be interested.", 'Best regards,', org.name],
    };
  }
  return {
    subject: `Help us spread the word – ${j.facts.title}`,
    body: [
      'Hello,',
      ...(intro ? [intro] : []),
      `We've just published a vacancy for **${j.facts.title}** at ${org.name}.`,
      'Do you know someone with relevant experience who might be interested?',
      'Please consider sharing this opportunity with suitable people in your professional network.',
      'The vacancy details are available here:',
    ],
    button: 'View Vacancy',
    after: ['A good candidate might be just one connection away.', 'Thank you for helping us reach the right people.', 'Best regards,', org.name],
  };
}

function bold(t: string) {
  const parts = t.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
}

export function EmailPreview({ job, s, intro, initial, to, onClose }: { job: DemoJob; s: State; intro: { candidate: string; team: string }; initial: 'candidate' | 'team'; to: { candidate: string[]; team: string[] }; onClose: () => void }) {
  const [kind, setKind] = useState(initial);
  const e = emailFor(kind, job, s.org, kind === 'candidate' ? intro.candidate : intro.team);
  const recipient = (kind === 'candidate' ? to.candidate[0] : to.team[0]) ?? (kind === 'candidate' ? 'candidate@example.org' : `colleague@${s.org.domain}`);
  return (
    <Dialog title="Email preview" subtitle="Exactly what a recipient receives · simulated, nothing is sent" onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <div className="aj-switch" role="radiogroup" aria-label="Which email">
          <button type="button" role="radio" aria-checked={kind === 'candidate'} data-active={kind === 'candidate'} onClick={() => setKind('candidate')}>
            Candidate invitation
          </button>
          <button type="button" role="radio" aria-checked={kind === 'team'} data-active={kind === 'team'} onClick={() => setKind('team')}>
            Team notification
          </button>
        </div>
        <div className="ej-email">
          <div className="ej-email-head">
            <div>
              <strong>From:</strong> {s.org.name} via AidJobs &lt;jobs@aidjobs.example.org&gt;
            </div>
            <div>
              <strong>Reply-to:</strong> {s.me.email}
            </div>
            <div>
              <strong>To:</strong> {recipient}
              {(kind === 'candidate' ? to.candidate.length : to.team.length) > 1 ? ` (each recipient gets their own email; nobody sees the others)` : ''}
            </div>
            <div>
              <strong>Subject:</strong> {e.subject}
            </div>
          </div>
          <div className="ej-email-body">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: '#e1eedc', color: '#3a6e31', fontWeight: 800, fontSize: 12 }}>
                {s.org.short.slice(0, 2).toUpperCase()}
              </span>
              <strong>{s.org.name}</strong>
            </div>
            {e.body.map((p, i) => (
              <p key={i}>{bold(p)}</p>
            ))}
            <p>
              <span className="ej-email-btn">{e.button}</span>
            </p>
            <p style={{ fontSize: 12, color: '#5b6259' }}>
              {job.facts.title} · {job.facts.location}
              {job.facts.deadline ? ` · closes ${longDate(job.facts.deadline)}` : ''}
            </p>
            {e.after.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <p style={{ fontStyle: 'italic', color: '#5b6259' }}>Shared through AidJobs.</p>
            <hr style={{ border: 'none', borderTop: '1px solid #e4e9e1', margin: '14px 0' }} />
            <p style={{ fontSize: 11, color: '#6f766d' }}>
              {kind === 'candidate'
                ? `You received this because ${s.org.name} thought this role might interest you. AidJobs has not added you to any list. Don't want invitations through AidJobs? Unsubscribe in one click.`
                : `You received this because you work with ${s.org.name}. Unsubscribe from vacancy notifications.`}{' '}
              AidJobs, on behalf of {s.org.name}.
            </p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export function ReachPanel({ job, s, value, onChange }: { job: DemoJob; s: State; value: ReachRecord & { on: { candidates: boolean; team: boolean } }; onChange: (v: ReachRecord & { on: { candidates: boolean; team: boolean } }) => void }) {
  const premium = job.plan === 'premium';
  const [preview, setPreview] = useState<'candidate' | 'team' | null>(null);
  const [intro, setIntro] = useState({ candidate: '', team: '' });
  const [msgOpen, setMsgOpen] = useState(false);
  const msg = shareMessage(job, s.org);
  const url = jobUrl(job);
  const used = value.candidates.length + value.team.length;
  const allowance = premium ? PREMIUM_EMAILS : 0;
  const teamOnDomain = s.team.filter((p) => p.id !== s.me.id && p.email.endsWith(`@${s.org.domain}`)).map((p) => p.email);
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${what} copied`);
    } catch {
      notify('Copy failed: select the text and copy it yourself');
    }
  };
  const mailto = `mailto:?bcc=${encodeURIComponent(value.candidates.join(','))}&subject=${encodeURIComponent(emailFor('candidate', job, s.org, '').subject)}&body=${encodeURIComponent(`${DEMO_PREFIX}\n\n${emailFor('candidate', job, s.org, intro.candidate).body.join('\n\n').replace(/\*\*/g, '')}\n\n${url}`)}`;

  const card = (n: string, icon: ReactNode, title: string, body: string, on: boolean, toggle: (() => void) | null, children: ReactNode) => (
    <section className="aj-card flex flex-col gap-3 p-4" data-on={on} style={{ borderColor: on ? 'var(--sage-3)' : undefined }} aria-label={title}>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: on ? 'var(--sage-2)' : 'var(--surface-2)', color: on ? 'var(--sage-8)' : 'var(--text-2)' }}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="aj-faint" style={{ fontSize: 11, fontWeight: 700 }}>
            {n}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
          <div className="aj-muted">{body}</div>
        </div>
        {toggle && (
          <label className="flex shrink-0 items-center gap-1.5" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={on} onChange={toggle} aria-label={`Use: ${title}`} />
            <span className="aj-faint">{on ? 'On' : 'Off'}</span>
          </label>
        )}
      </div>
      {on && children}
    </section>
  );

  return (
    <div className="flex flex-col gap-3">
      {card(
        '01',
        <UserPlus size={17} strokeWidth={1.8} />,
        'Invite people to apply',
        'Know someone who could be a good fit? Send them a direct invitation to explore this opportunity.',
        value.on.candidates,
        () => onChange({ ...value, on: { ...value.on, candidates: !value.on.candidates } }),
        <div className="flex flex-col gap-2">
          {premium ? (
            <RecipientInput label="Enter email addresses" value={value.candidates.map((r) => r.email)} onChange={(v) => onChange({ ...value, candidates: v.map((email) => ({ email, status: 'queued' })) })} max={Math.max(0, allowance - value.team.length)} placeholder="name@example.org, another@example.org" />
          ) : (
            <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
              <div style={{ fontWeight: 650 }}>Emails through AidJobs come with Premium</div>
              <div className="aj-muted">Premium includes {PREMIUM_EMAILS} Reach emails. With Standard, send the invitation from your own email instead.</div>
            </div>
          )}
          <Field label="Your introduction (optional)">
            <textarea style={{ ...inputStyle, minHeight: 56 }} value={intro.candidate} onChange={(e) => setIntro({ ...intro, candidate: e.target.value })} placeholder="For example: we met at the WASH cluster meeting in Juba." />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="aj-pill" onClick={() => setPreview('candidate')}>
              <Mail size={13} strokeWidth={1.8} /> Preview email
            </button>
            <a className="aj-pill" href={mailto}>
              <Send2 /> Send from my own email
            </a>
          </div>
          <span className="aj-faint" style={{ fontSize: 11 }}>
            Recipients are never added to an AidJobs list, never see each other, and can unsubscribe in one click.
          </span>
        </div>,
      )}
      {card(
        '02',
        <Users size={17} strokeWidth={1.8} />,
        'Activate your team',
        'Your colleagues might know someone who would be perfect for this opportunity. Ask them to share it with their professional networks.',
        value.on.team,
        () => onChange({ ...value, on: { ...value.on, team: !value.on.team } }),
        <div className="flex flex-col gap-2">
          {premium ? (
            <>
              <RecipientInput label="Enter colleagues' email addresses" value={value.team.map((r) => r.email)} onChange={(v) => onChange({ ...value, team: v.map((email) => ({ email, status: 'queued' })) })} max={Math.max(0, allowance - value.candidates.length)} domain={s.org.domain} placeholder={`colleague@${s.org.domain}`} />
              {teamOnDomain.some((e) => !value.team.some((r) => r.email === e)) && (
                <button type="button" className="aj-text-btn self-start" onClick={() => onChange({ ...value, team: Array.from(new Set([...value.team.map((r) => r.email), ...teamOnDomain])).map((email) => ({ email, status: 'queued' })) })}>
                  + Add your team ({teamOnDomain.length})
                </button>
              )}
            </>
          ) : (
            <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
              <div style={{ fontWeight: 650 }}>Team emails come with Premium</div>
              <div className="aj-muted">With Standard, copy the message below into your team&apos;s chat or mailing list.</div>
            </div>
          )}
          <Field label="Your introduction (optional)">
            <textarea style={{ ...inputStyle, minHeight: 56 }} value={intro.team} onChange={(e) => setIntro({ ...intro, team: e.target.value })} placeholder="For example: please share with your WASH contacts in the region." />
          </Field>
          <button type="button" className="aj-pill self-start" onClick={() => setPreview('team')}>
            <Mail size={13} strokeWidth={1.8} /> Preview email
          </button>
          <span className="aj-faint" style={{ fontSize: 11 }}>
            Team emails go only to addresses on your organisation&apos;s verified domain, @{s.org.domain}. Nobody has to take part.
          </span>
        </div>,
      )}
      {card(
        '03',
        <Megaphone size={17} strokeWidth={1.8} />,
        'Share with your community',
        'WhatsApp groups, LinkedIn, alumni networks, professional associations: AidJobs prepares a ready-to-share message.',
        value.community,
        () => onChange({ ...value, community: !value.community }),
        <div className="flex flex-col gap-2">
          <button type="button" className="aj-text-btn self-start" onClick={() => setMsgOpen(!msgOpen)} aria-expanded={msgOpen}>
            {msgOpen ? 'Hide' : 'Preview'} sharing message
          </button>
          {msgOpen && <pre className="rounded-xl p-3" style={{ background: 'var(--surface-2)', whiteSpace: 'pre-wrap', font: 'inherit', margin: 0 }}>{msg}</pre>}
          <CommunityButtons msg={msg} url={url} copy={copy} />
        </div>,
      )}
      {premium && (
        <span className="aj-faint">
          Reach emails: {used} of {PREMIUM_EMAILS} used for this job.
        </span>
      )}
      {preview && <EmailPreview job={job} s={s} intro={intro} initial={preview} to={{ candidate: value.candidates.map((r) => r.email), team: value.team.map((r) => r.email) }} onClose={() => setPreview(null)} />}
    </div>
  );
}

function Send2() {
  return <Mail size={13} strokeWidth={1.8} />;
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

function SimulatedCheckout({ item, amount, onPaid, onClose }: { item: string; amount: string; onPaid: () => void; onClose: () => void }) {
  return (
    <Dialog
      title="Checkout"
      subtitle="Simulated · Paddle sandbox not configured"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="aj-pill" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="aj-ink-btn" onClick={onPaid}>
            Pay {amount} (simulated)
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="aj-card flex items-center justify-between p-3">
          <span>{item}</span>
          <strong>{amount}</strong>
        </div>
        <p className="aj-muted" style={{ margin: 0 }}>
          In the real product, Paddle&apos;s checkout opens here. Paddle is the merchant of record: it charges the card, adds sales tax or VAT where it applies, and emails the receipt and invoice. Prices are placeholders.
        </p>
        <p className="aj-faint" style={{ margin: 0 }}>
          With the sandbox configured for this preview, Paddle&apos;s real test checkout opens instead, with test cards and a test receipt.
        </p>
      </div>
    </Dialog>
  );
}

type Draft = ReachRecord & { on: { candidates: boolean; team: boolean } };

export default function Publish({ id }: { id?: string }) {
  const s = useDemo();
  const { theme } = useSiteSettings();
  const job = s.jobs.find((j) => j.id === id);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [plan, setPlan] = useState<'standard' | 'premium'>(job?.plan === 'premium' ? 'premium' : 'standard');
  const [useCredit, setUseCredit] = useState(false);
  const [checkout, setCheckout] = useState<null | 'premium' | 'pack'>(null);
  const [paying, setPaying] = useState(false);
  const [schedule, setSchedule] = useState<string | null>(null);
  const [override, setOverride] = useState('');
  const [reach, setReach] = useState<Draft>({ candidates: [], team: [], community: true, intro: '', on: { candidates: false, team: false } });

  if (!job) {
    return (
      <div className="p-6">
        <button type="button" className="aj-ink-btn" onClick={() => go('home')}>
          Back to home
        </button>
      </div>
    );
  }

  const paid = job.plan === 'premium';
  const standardFull = liveStandard(s) >= FREE_LIVE;
  const required = approvalRequired(s, job);
  const blocked = required && !(isApproved(job) || job.status === 'approved');
  const stepNames = ['Preview', 'Visibility', 'Reach', 'Live'];
  const shownJob = { ...job, plan: plan === 'premium' && (paid || useCredit) ? ('premium' as const) : job.plan === 'premium' ? job.plan : plan === 'standard' ? ('standard' as const) : job.plan };

  const startPayment = async (kind: 'premium' | 'pack') => {
    const price = kind === 'premium' ? PRICE_PREMIUM : PRICE_PACK;
    if (!paddleConfigured(price)) {
      setCheckout(kind);
      return;
    }
    setPaying(true);
    try {
      const tx = await openSandboxCheckout(price, 1, theme);
      if (tx) paidFor(kind, 'paddle-sandbox');
    } catch {
      notify('Paddle sandbox could not open; showing the simulated checkout');
      setCheckout(kind);
    } finally {
      setPaying(false);
    }
  };
  const paidFor = (kind: 'premium' | 'pack', mode: 'paddle-sandbox' | 'simulated') => {
    if (kind === 'pack') {
      buyCredits(5, mode);
      setUseCredit(true);
      setPlan('premium');
    } else {
      payPremium(mode, job.facts.title);
      updateJob(job.id, (j) => ({ ...j, plan: 'premium' }));
      setPlan('premium');
    }
    setCheckout(null);
    notify(kind === 'pack' ? '5 Premium credits added; one will be used for this job' : 'Paid: this job is Premium');
  };

  const doPublish = (withReach: boolean) => {
    const r: ReachRecord | null = withReach ? { candidates: reach.on.candidates ? reach.candidates : [], team: reach.on.team ? reach.team : [], community: reach.community, intro: '' } : null;
    publish(job.id, { plan: plan === 'premium' && (paid || useCredit) ? 'premium' : 'standard', useCredit: plan === 'premium' && !paid && useCredit, schedule, reach: r });
    setStep(3);
  };

  const premiumReady = plan === 'premium' ? paid || (useCredit && s.credits > 0) : !standardFull;

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5 px-4 py-5 lg:px-8 lg:py-8">
      <div className="flex items-center gap-2">
        {step < 3 && (
          <button type="button" className="aj-icon-btn" onClick={() => (step === 0 ? go('create', job.id) : setStep((step - 1) as 0 | 1 | 2))} aria-label="Back">
            <ArrowLeft size={15} strokeWidth={1.8} />
          </button>
        )}
        <ol className="flex flex-1 items-center gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Steps">
          {stepNames.map((n, i) => (
            <li key={n} className="flex items-center gap-2" aria-current={i === step ? 'step' : undefined}>
              <span className="aj-chip" data-tone={i === step ? 'sage' : undefined} style={i < step ? { color: 'var(--sage-8)' } : undefined}>
                {i < step ? <Check size={11} strokeWidth={2.4} /> : i + 1} {n}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <>
          <h1 className="aj-display aj-h1" style={{ margin: 0 }}>
            How it will look
          </h1>
          {blocked && (
            <div className="aj-card flex flex-col gap-2 p-4" style={{ borderColor: 'var(--amber)' }} role="status">
              <div style={{ fontWeight: 650 }}>Approval is required for this job</div>
              <span className="aj-muted">Your organisation asks for approval on senior roles (P4 and above). {job.review.state === 'none' ? 'Send it for review first.' : 'Waiting for your reviewers.'}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" className="aj-pill" onClick={() => go('create', job.id)}>
                  Back to the job
                </button>
                {s.me.role === 'owner' && (
                  <>
                    <input style={{ ...inputStyle, width: 260, minHeight: 34 }} placeholder="Reason, to publish without approval" value={override} onChange={(e) => setOverride(e.target.value)} aria-label="Reason for publishing without approval" />
                    <button type="button" className="aj-pill" disabled={override.trim().length < 5} onClick={() => overrideApproval(job.id, override.trim())}>
                      Publish without approval (logged)
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="aj-card p-4 lg:p-6">
              <JobPage job={shownJob} s={s} />
            </div>
            <div className="flex flex-col gap-3">
              <span className="aj-section-label" style={{ padding: 0 }}>
                In Google
              </span>
              <GooglePreview job={job} s={s} />
              <span className="aj-section-label" style={{ padding: 0 }}>
                When shared
              </span>
              <ShareCards job={job} s={s} />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" className="aj-ink-btn" disabled={blocked} onClick={() => setStep(1)}>
              Continue
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h1 className="aj-display aj-h1" style={{ margin: 0 }}>
            Choose visibility
          </h1>
          <div className="grid gap-3 md:grid-cols-2">
            <button type="button" className="aj-card flex flex-col gap-2 p-4 text-left" style={{ cursor: standardFull && !paid ? 'not-allowed' : 'pointer', borderColor: plan === 'standard' ? 'var(--ink)' : undefined, opacity: standardFull ? 0.65 : 1 }} onClick={() => !standardFull && setPlan('standard')} aria-pressed={plan === 'standard'} disabled={standardFull}>
              <div className="flex items-center gap-2">
                <span style={{ fontWeight: 700, fontSize: 15 }}>Standard</span>
                <span className="ml-auto" style={{ fontWeight: 700 }}>
                  Free
                </span>
              </div>
              <ul className="aj-muted" style={{ margin: 0, paddingLeft: 18 }}>
                <li>Listed on AidJobs for 30 days</li>
                <li>Job page, Google job listings</li>
                <li>Community sharing</li>
              </ul>
              <span className="aj-faint">
                {liveStandard(s)} of {FREE_LIVE} free jobs live{standardFull ? ': close one, or choose Premium' : ''}
              </span>
            </button>
            <button type="button" className="ej-premium aj-card flex flex-col gap-2 p-4 text-left" style={{ cursor: 'pointer', borderColor: plan === 'premium' ? 'var(--ink)' : undefined }} onClick={() => setPlan('premium')} aria-pressed={plan === 'premium'}>
              <div className="flex items-center gap-2">
                <Sparkles size={15} strokeWidth={1.8} style={{ color: 'var(--sage-7)' }} />
                <span style={{ fontWeight: 700, fontSize: 15 }}>Premium</span>
                <span className="ml-auto" style={{ fontWeight: 700 }}>
                  {paid ? 'Paid' : `${PRICE_LABEL.premium}`}
                </span>
              </div>
              <ul className="aj-muted" style={{ margin: 0, paddingLeft: 18 }}>
                <li>Featured section, highlighted card</li>
                <li>On organisation, country, and hub pages</li>
                <li>{PREMIUM_EMAILS} Reach emails to candidates and your team</li>
                <li>Listed for 60 days</li>
                <li>Unlimited edits; does not use a free job description</li>
              </ul>
              <span className="aj-faint">Labelled &ldquo;Premium · Sponsored&rdquo; for job seekers. Price is a placeholder.</span>
            </button>
          </div>
          {plan === 'premium' && !paid && (
            <div className="aj-card flex flex-col gap-3 p-4">
              {s.credits > 0 ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} /> Use a Premium credit ({s.credits} left)
                </label>
              ) : null}
              {!useCredit && (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="aj-ink-btn" onClick={() => startPayment('premium')} disabled={paying}>
                    {paying ? 'Opening Paddle…' : `Pay ${PRICE_LABEL.premium}`}
                  </button>
                  <button type="button" className="aj-pill" onClick={() => startPayment('pack')} disabled={paying}>
                    Or 5 credits for {PRICE_LABEL.pack}
                  </button>
                  <span className="aj-faint inline-flex items-center gap-1">
                    <ShieldCheck size={12} strokeWidth={2} /> Paddle {paddleConfigured(PRICE_PREMIUM) ? 'sandbox: test cards only, no real money' : 'checkout simulated'} · invoice by email
                  </span>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end">
            <button type="button" className="aj-ink-btn" disabled={!premiumReady} onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div>
            <div className="aj-faint" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>
              YOUR VACANCY IS READY
            </div>
            <h1 className="aj-display aj-h1" style={{ margin: '2px 0 0' }}>
              Let&apos;s get it seen.
            </h1>
            <p className="aj-muted" style={{ margin: '4px 0 0' }}>
              Publishing your vacancy is just the beginning. Choose one, several, or none of these; you can also skip and publish normally.
            </p>
          </div>
          <ReachPanel job={shownJob} s={s} value={reach} onChange={setReach} />
          <div className="aj-card flex flex-wrap items-center gap-2 p-3">
            <CalendarClock size={15} strokeWidth={1.8} />
            <span>Publish</span>
            <button type="button" className="aj-pill" data-active={!schedule} onClick={() => setSchedule(null)}>
              Now
            </button>
            <button type="button" className="aj-pill" data-active={Boolean(schedule)} onClick={() => setSchedule(addDays(s.today, 1))}>
              Schedule
            </button>
            {schedule && <input type="date" style={{ ...inputStyle, width: 170, minHeight: 34 }} value={schedule} min={addDays(s.today, 1)} onChange={(e) => setSchedule(e.target.value)} aria-label="Publish on" />}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="aj-pill" onClick={() => setStep(0)}>
              Back to preview
            </button>
            <button type="button" className="aj-pill" onClick={() => doPublish(false)}>
              Skip &amp; publish
            </button>
            <button type="button" className="aj-ink-btn" onClick={() => doPublish(true)} disabled={(reach.on.candidates && !reach.candidates.length) || (reach.on.team && !reach.team.length)}>
              Publish &amp; start reaching people
            </button>
          </div>
        </>
      )}

      {step === 3 && <Success job={s.jobs.find((j) => j.id === job.id) ?? job} s={s} />}

      {checkout && (
        <SimulatedCheckout
          item={checkout === 'premium' ? `Premium job: ${job.facts.title}` : '5 Premium credits, valid 12 months'}
          amount={checkout === 'premium' ? PRICE_LABEL.premium : PRICE_LABEL.pack}
          onPaid={() => paidFor(checkout, 'simulated')}
          onClose={() => setCheckout(null)}
        />
      )}
    </div>
  );
}

function deliveryText(list: Array<{ status: string }>): string {
  if (!list.length) return 'Not used';
  const by = (st: string) => list.filter((r) => r.status === st).length;
  if (by('sent') + by('failed') === list.length) return `${by('sent')} sent${by('failed') ? `, ${by('failed')} failed` : ''} (simulated)`;
  if (by('sending')) return `${by('sending')} sending (simulated)`;
  return `${list.length} queued (simulated)`;
}

function Success({ job, s }: { job: DemoJob; s: State }) {
  const url = jobUrl(job);
  const msg = shareMessage(job, s.org);
  const copy = async (t: string, what: string) => {
    try {
      await navigator.clipboard.writeText(t);
      notify(`${what} copied`);
    } catch {
      notify('Copy failed');
    }
  };
  const scheduled = job.status === 'scheduled';
  const rows: Array<[string, string]> = [
    ['Vacancy publication', scheduled ? `Scheduled for ${job.scheduledFor ? longDate(job.scheduledFor) : ''}` : 'Published'],
    ['Candidate invitations', deliveryText(job.reach?.candidates ?? [])],
    ['Team notifications', deliveryText(job.reach?.team ?? [])],
    ['Community sharing', job.reach?.community || !job.reach ? 'Ready' : 'Not used'],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="aj-display aj-h1" style={{ margin: 0 }}>
          {scheduled ? 'Your vacancy is scheduled.' : 'Your vacancy is live!'}
        </h1>
        <p className="aj-muted" style={{ margin: '4px 0 0' }}>
          {scheduled ? 'It goes live on the date you chose.' : 'It is published on AidJobs (in this demo, only here). Now let’s help it reach the right people.'}
        </p>
      </div>
      <table className="aj-card w-full overflow-hidden" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr>
            <th className="aj-faint p-3 text-left" style={{ fontWeight: 600 }}>
              Activity
            </th>
            <th className="aj-faint p-3 text-left" style={{ fontWeight: 600 }}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a}>
              <td className="border-t p-3 aj-hair">{a}</td>
              <td className="border-t p-3 aj-hair" style={{ fontWeight: 600 }}>
                {b}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="aj-faint" style={{ margin: 0 }}>
        Publishing does not depend on the emails: a failed email never unpublishes the job. &ldquo;Sent&rdquo; means handed to the email service; it is not proof of delivery.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="aj-ink-btn" onClick={() => go('public', job.id)}>
          View published vacancy
        </button>
        <CommunityButtons msg={msg} url={url} copy={copy} />
        <button type="button" className="aj-pill" onClick={() => go('home')}>
          Return to dashboard
        </button>
      </div>
    </div>
  );
}
