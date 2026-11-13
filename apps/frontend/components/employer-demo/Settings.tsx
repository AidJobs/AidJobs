'use client';

import { BadgeCheck, Check, Globe, Lock, LockOpen, Mail, Plus, Sparkles, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import Tip from '@/components/site/Tip';
import { forgetBase, invite, removeMember, setKeptApply, setKeptFixed, setRole, stopKeeping } from './actions';
import { COMMITMENTS, FAMILIES_ORDER, SECTIONS } from './engine';
import { nextId, update, useDemo } from './store';
import { langOf } from './translate';
import type { ApplySettings, ApprovalSetting, Format, JobLang, Org, OrgType, Person, Tone } from './types';
import BasePrompt from './BasePrompt';
import CreateFormatDialog from './FormatBuilder';
import { DemoMark, Field, inputStyle, isEmail, Section } from './ui';

const SECTORS = ['Water, sanitation and hygiene', 'Health', 'Nutrition', 'Education', 'Child protection', 'Gender', 'Livelihoods and food security', 'Climate and environment', 'Shelter', 'Peacebuilding', 'Humanitarian response', 'ESG and environmental and social safeguards'];
const VOICES = ['Warm', 'Formal', 'Plain English', 'Speaks as "we"', 'Uses "you"', 'Rights-based', 'Short sentences', 'Inclusive'];
const ORG_TYPES: Array<{ key: OrgType; label: string }> = [
  { key: 'ingo', label: 'International NGO' },
  { key: 'ngo', label: 'National or local NGO' },
  { key: 'charity', label: 'Domestic charity or nonprofit' },
  { key: 'un', label: 'UN agency or multilateral' },
  { key: 'donor', label: 'Donor, fund, or foundation' },
  { key: 'contractor', label: 'Development contractor' },
];

function setOrg(patch: Partial<Org>) {
  update((s) => ({ ...s, org: { ...s.org, ...patch } }));
}

export function SignIn() {
  const [email, setEmail] = useState('sam@riverstone.example.org');
  const [sent, setSent] = useState(false);
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="aj-card flex w-full max-w-[420px] flex-col gap-4 p-6">
        <div className="flex items-center gap-2">
          <Star size={18} strokeWidth={2} style={{ color: 'var(--sage-7)' }} />
          <span style={{ fontSize: 16, fontWeight: 700 }}>aidjobs</span>
          <span className="aj-faint">for employers</span>
          <span className="ml-auto">
            <DemoMark label="Demo" />
          </span>
        </div>
        <div>
          <h1 className="aj-display" style={{ margin: 0, fontSize: 24 }}>
            Publish once. Reach further.
          </h1>
          <p className="aj-muted" style={{ margin: '6px 0 0' }}>
            Write a job description with AidJobs, publish it, and get it in front of the right people.
          </p>
        </div>
        {!sent ? (
          <>
            <Field label="Work email" hint="We send a sign-in link. No password.">
              <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Field>
            <button type="button" className="aj-ink-btn justify-center" disabled={!isEmail(email)} onClick={() => setSent(true)}>
              <Mail size={14} strokeWidth={2} /> Email me a sign-in link
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl p-3" style={{ background: 'var(--sage-1)' }}>
              A sign-in link would now go to <strong>{email}</strong>. In this demo nothing is sent and no account is created.
            </div>
            <button type="button" className="aj-ink-btn justify-center" onClick={() => update((s) => ({ ...s, signedIn: true }))}>
              Open the link (demo)
            </button>
            <button type="button" className="aj-text-btn" onClick={() => setSent(false)}>
              Use another email
            </button>
          </div>
        )}
        <p className="aj-faint" style={{ margin: 0, fontSize: 11 }}>
          The organisation, people, and jobs here are fictional sample data, kept only in this browser.
        </p>
      </div>
    </div>
  );
}

function BrandStyle({ org }: { org: Org }) {
  const [mode, setMode] = useState<'link' | 'paste'>('link');
  const [url, setUrl] = useState(org.careersUrl);
  const [sample, setSample] = useState('');
  const [reading, setReading] = useState(false);
  const read = () => {
    setReading(true);
    setTimeout(() => {
      let voice = ['Warm', 'Plain English', 'Speaks as "we"', 'Rights-based'];
      if (mode === 'paste' && sample.trim()) {
        const t = ` ${sample.toLowerCase()} `;
        const sentences = sample.split(/[.!?]+/).filter((x) => x.trim());
        const avg = sentences.length ? sample.split(/\s+/).length / sentences.length : 20;
        voice = [
          ...(/\bwe\b|\bour\b/.test(t) ? ['Speaks as "we"'] : []),
          ...(/\byou\b|\byour\b/.test(t) ? ['Uses "you"'] : []),
          ...(avg < 18 ? ['Short sentences', 'Plain English'] : ['Formal']),
          ...(/rights|dignity|inclusion|equit/.test(t) ? ['Rights-based'] : []),
        ];
      }
      setOrg({ voice: Array.from(new Set(voice)), careersUrl: mode === 'link' ? url : org.careersUrl });
      setReading(false);
    }, 900);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="aj-switch self-start" role="radiogroup" aria-label="How to learn your style">
        <button type="button" role="radio" aria-checked={mode === 'link'} data-active={mode === 'link'} onClick={() => setMode('link')}>
          Careers page link
        </button>
        <button type="button" role="radio" aria-checked={mode === 'paste'} data-active={mode === 'paste'} onClick={() => setMode('paste')}>
          Paste a sample
        </button>
      </div>
      {mode === 'link' ? (
        <Field label="Your careers page" hint="AidJobs reads this one page, once, and nothing else on your site (simulated here).">
          <input style={inputStyle} value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" />
        </Field>
      ) : (
        <Field label="A job description or page you like" hint="Paste a few paragraphs. They are used to learn your style and are not published.">
          <textarea style={{ ...inputStyle, minHeight: 110 }} value={sample} onChange={(e) => setSample(e.target.value)} />
        </Field>
      )}
      <button type="button" className="aj-pill self-start" onClick={read} disabled={reading}>
        <Sparkles size={13} strokeWidth={1.8} /> {reading ? 'Reading… (simulated)' : 'Learn my style'}
      </button>
      <Field label="Your style · tap to adjust">
        <div className="flex flex-wrap gap-1.5">
          {VOICES.map((v) => (
            <button key={v} type="button" className="ej-tag" data-on={org.voice.includes(v)} onClick={() => setOrg({ voice: org.voice.includes(v) ? org.voice.filter((x) => x !== v) : [...org.voice, v] })} aria-pressed={org.voice.includes(v)}>
              {v}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

function Sectors({ org }: { org: Org }) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Sectors">
        <div className="flex flex-wrap gap-1.5">
          {SECTORS.map((x) => (
            <button key={x} type="button" className="ej-tag" data-on={org.sectors.includes(x)} onClick={() => setOrg({ sectors: org.sectors.includes(x) ? org.sectors.filter((y) => y !== x) : [...org.sectors, x] })} aria-pressed={org.sectors.includes(x)}>
              {x}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Sustainable Development Goals">
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 17 }, (_, i) => i + 1).map((g) => (
            <button key={g} type="button" className="ej-tag" data-on={org.sdgs.includes(g)} onClick={() => setOrg({ sdgs: org.sdgs.includes(g) ? org.sdgs.filter((y) => y !== g) : [...org.sdgs, g].sort((a, b) => a - b) })} aria-pressed={org.sdgs.includes(g)}>
              SDG {g}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

function StandardTexts({ org }: { org: Org }) {
  return (
    <div className="flex flex-col gap-3">
      {org.standard.map((t) => (
        <div key={t.key} className="aj-card flex flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <span style={{ fontWeight: 650 }}>{t.label}</span>
            <Tip label={t.locked ? 'Locked: recruiters cannot change or remove it in a job' : 'Editable: recruiters can edit it in a job'} className="ml-auto">
              <button
                type="button"
                className="aj-pill"
                style={{ height: 28 }}
                onClick={() => setOrg({ standard: org.standard.map((x) => (x.key === t.key ? { ...x, locked: !x.locked } : x)) })}
                aria-pressed={t.locked}
              >
                {t.locked ? <Lock size={12} strokeWidth={2} /> : <LockOpen size={12} strokeWidth={2} />}
                {t.locked ? 'Locked' : 'Editable'}
              </button>
            </Tip>
          </div>
          <textarea style={{ ...inputStyle, minHeight: 64 }} value={t.text} onChange={(e) => setOrg({ standard: org.standard.map((x) => (x.key === t.key ? { ...x, text: e.target.value } : x)) })} aria-label={t.label} />
        </div>
      ))}
    </div>
  );
}

const METHOD_LABELS: Record<ApplySettings['method'], string> = { system: 'Through your careers site', email: 'By email', form: 'An online form', formOnly: 'An online form, without CVs' };

/**
 * Kept for every job (section 19, step 10): the fixed text and the way to apply the owner chose to keep from the chat. Each new job
 * starts with them; this is the only place they are changed afterwards. Jobs already published keep their own.
 */
function KeptForEveryJob({ org }: { org: Org }) {
  const s = useDemo();
  const owner = s.me.role === 'owner' && !s.reviewerAs;
  const kept = org.keptFixed;
  const apply = org.keptApply;
  if (!kept && !apply) return <p className="aj-muted m-0">Nothing yet. The first time you write a job, AidJobs offers to keep its fixed text and its way to apply for every job.</p>;
  return (
    <div className="flex flex-col gap-4">
      {kept && (
        <Field label="Fixed text on every new job">
          <div className="flex flex-col gap-1">
            {COMMITMENTS.filter((c) => c.key !== 'mds' || org.mdsMember).map((c) => (
              <label key={c.key} className="flex items-center gap-2">
                <input type="checkbox" checked={kept.includes(c.key)} disabled={!owner} onChange={() => setKeptFixed(kept.includes(c.key) ? kept.filter((k) => k !== c.key) : [...kept, c.key])} />
                {c.label}
              </label>
            ))}
            {owner && (
              <button type="button" className="aj-text-btn self-start" onClick={() => stopKeeping('fixed')}>
                Stop keeping it: each job starts from its template
              </button>
            )}
          </div>
        </Field>
      )}
      {apply && (
        <Field label="How people apply, on every new job">
          <div className="flex flex-col gap-1.5">
            <select style={{ ...inputStyle, width: 'auto' }} value={apply.method} disabled={!owner} onChange={(e) => setKeptApply({ method: e.target.value as ApplySettings['method'] })} aria-label="How people apply">
              {(Object.keys(METHOD_LABELS) as Array<ApplySettings['method']>).map((k) => (
                <option key={k} value={k}>
                  {METHOD_LABELS[k]}
                </option>
              ))}
            </select>
            {apply.method === 'email' && <input style={inputStyle} value={apply.address} disabled={!owner} onChange={(e) => setKeptApply({ address: e.target.value })} aria-label="Application email address" />}
            {owner && (
              <button type="button" className="aj-text-btn self-start" onClick={() => stopKeeping('apply')}>
                Stop keeping it
              </button>
            )}
          </div>
        </Field>
      )}
      {(org.fixedLangs ?? []).length > 0 && <span className="aj-faint">Fixed text confirmed in: {(org.fixedLangs ?? []).map((k) => langOf(k as JobLang).label).join(', ')}.</span>}
      <span className="aj-faint">Jobs already published keep their own text.</span>
    </div>
  );
}

function ApprovalSettingView({ org }: { org: Org }) {
  const opts: Array<{ key: ApprovalSetting; label: string; hint: string }> = [
    { key: 'off', label: 'Off', hint: 'Anyone who can publish publishes directly; review stays available' },
    { key: 'senior', label: 'Senior roles', hint: 'Required for P4 and above, and D grades' },
    { key: 'all', label: 'Every job', hint: 'Nothing is published without approval' },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Approval before publishing">
        {opts.map((o) => (
          <button key={o.key} type="button" className="aj-option" data-active={org.approval === o.key} onClick={() => setOrg({ approval: o.key })} role="radio" aria-checked={org.approval === o.key}>
            <span className="flex h-4 w-4 items-center justify-center">{org.approval === o.key && <Check size={14} strokeWidth={2.4} />}</span>
            <span className="flex flex-col">
              <span style={{ fontWeight: 650 }}>{o.label}</span>
              <span className="aj-faint">{o.hint}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="aj-muted">An approval needs</span>
        <button type="button" className="aj-pill" data-active={org.approvalRule === 'any'} onClick={() => setOrg({ approvalRule: 'any' })}>
          any one reviewer
        </button>
        <button type="button" className="aj-pill" data-active={org.approvalRule === 'all'} onClick={() => setOrg({ approvalRule: 'all' })}>
          every reviewer
        </button>
      </div>
      {org.approval !== 'off' && org.approvalRule === 'any' && (
        <label className="flex items-start gap-2" style={{ cursor: 'pointer' }}>
          <input type="checkbox" className="mt-0.5" checked={Boolean(org.changesPause)} onChange={(e) => setOrg({ changesPause: e.target.checked })} />
          <span className="flex flex-col">
            <span style={{ fontWeight: 650 }}>Any request for changes pauses publishing</span>
            <span className="aj-faint">
              {org.changesPause
                ? 'A request for changes withdraws the approval until it is dealt with, even if another reviewer approved.'
                : 'Without it, one approval is enough: a later request for changes is shown to whoever publishes, who decides; publishing anyway is recorded and the reviewer told.'}
            </span>
          </span>
        </label>
      )}
      {org.approval !== 'off' && org.approvalRule === 'any' && (
        <label className="flex items-start gap-2" style={{ cursor: 'pointer' }}>
          <input type="checkbox" className="mt-0.5" checked={Boolean(org.changesPause)} onChange={(e) => setOrg({ changesPause: e.target.checked })} />
          <span className="flex flex-col">
            <span style={{ fontWeight: 650 }}>Any request for changes pauses publishing</span>
            <span className="aj-faint">
              {org.changesPause
                ? 'A request for changes withdraws the approval until it is dealt with, even if another reviewer approved.'
                : 'Without it, one approval is enough: a later request for changes is shown to whoever publishes, who decides; publishing anyway is recorded and the reviewer told.'}
            </span>
          </span>
        </label>
      )}
      {org.approval !== 'off' && (
        <label className="flex items-start gap-2" style={{ cursor: 'pointer' }}>
          <input type="checkbox" className="mt-0.5" checked={org.noSkip} onChange={(e) => setOrg({ noSkip: e.target.checked })} />
          <span className="flex flex-col">
            <span style={{ fontWeight: 650 }}>Nobody can skip approval</span>
            <span className="aj-faint">
              {org.noSkip ? 'Jobs that need approval are published only once they are approved.' : 'Without it, the owner can publish without approval in an emergency; the reason is kept in the job’s history and the reviewers are told.'}
            </span>
          </span>
        </label>
      )}
    </div>
  );
}

function Verification({ org }: { org: Org }) {
  const [method, setMethod] = useState<'domain' | 'charity' | 'iati'>('domain');
  const [value, setValue] = useState('');
  return (
    <div className="flex flex-col gap-3">
      {org.verified ? (
        <div className="flex items-center gap-2 rounded-xl p-3" style={{ background: 'var(--sage-1)' }}>
          <BadgeCheck size={16} strokeWidth={2} style={{ color: 'var(--sage-7)' }} />
          Verified by email on @{org.domain}. Your jobs carry the verified badge.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['domain', 'Work email domain'],
                ['charity', 'Charity register number'],
                ['iati', 'IATI organisation ID'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" className="aj-pill" data-active={method === k} onClick={() => setMethod(k)}>
                {l}
              </button>
            ))}
          </div>
          <input style={inputStyle} value={value} onChange={(e) => setValue(e.target.value)} placeholder={method === 'domain' ? `you@${org.domain}` : method === 'charity' ? 'For example 1234567' : 'For example XM-DAC-00000'} />
          <button type="button" className="aj-ink-btn self-start" disabled={!value.trim()} onClick={() => setOrg({ verified: true })}>
            Verify (simulated)
          </button>
        </>
      )}
      <span className="aj-faint">Verification protects candidates: fake vacancies that ask for fees are a known problem in this sector. Amplified jobs and Reach emails need a verified organisation.</span>
      {org.verified && (
        <button type="button" className="aj-text-btn self-start" onClick={() => setOrg({ verified: false })}>
          Show the unverified state
        </button>
      )}
    </div>
  );
}

function Basics({ org }: { org: Org }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name">
        <input style={inputStyle} value={org.name} onChange={(e) => setOrg({ name: e.target.value })} />
      </Field>
      <Field label="Short name">
        <input style={inputStyle} value={org.short} onChange={(e) => setOrg({ short: e.target.value })} />
      </Field>
      <Field label="Type" hint="Sets the closest real format, the salary default, and how people apply">
        <select
          style={inputStyle}
          value={org.orgType}
          onChange={(e) => {
            const t = ORG_TYPES.find((x) => x.key === e.target.value);
            if (t) setOrg({ orgType: t.key, type: t.label });
          }}
        >
          {ORG_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Headquarters">
        <input style={inputStyle} value={org.hq} onChange={(e) => setOrg({ hq: e.target.value })} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Website (optional)" hint="One page of it, such as your About page, can be read to draft a job's About us; only when you ask, from a job's About us">
          <input style={inputStyle} value={org.website} onChange={(e) => setOrg({ website: e.target.value })} placeholder="https://your-organisation.org/about" inputMode="url" aria-label="Website" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="About" hint="Where each new job's About us starts; it can be changed on any job">
          <textarea style={{ ...inputStyle, minHeight: 80 }} value={org.about} onChange={(e) => setOrg({ about: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

const STEPS = [
  { key: 'basics', label: 'Basics', View: Basics },
  { key: 'brand', label: 'Brand style', View: BrandStyle },
  { key: 'sectors', label: 'Sectors and SDGs', View: Sectors },
  { key: 'standard', label: 'Standard text', View: StandardTexts },
  { key: 'kept', label: 'Kept for every job', View: KeptForEveryJob },
  { key: 'approval', label: 'Approval', View: ApprovalSettingView },
  { key: 'verify', label: 'Verification', View: Verification },
] as const;

export function Onboarding() {
  const s = useDemo();
  const [i, setI] = useState(0);
  const Step = STEPS[i].View;
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-6">
      <div className="flex items-center gap-2">
        <h1 className="aj-display aj-h1" style={{ margin: 0 }}>
          Set up your organisation
        </h1>
        <span className="aj-faint ml-auto">
          {i + 1} of {STEPS.length}
        </span>
      </div>
      <div className="aj-no-scrollbar flex gap-1.5 overflow-x-auto">
        {STEPS.map((st, k) => (
          <button key={st.key} type="button" className="aj-pill shrink-0" data-active={k === i} onClick={() => setI(k)}>
            {k < i ? <Check size={12} strokeWidth={2.4} /> : null} {st.label}
          </button>
        ))}
      </div>
      <div className="aj-card p-4">
        <Step org={s.org} />
      </div>
      <div className="flex justify-between gap-2">
        <button type="button" className="aj-text-btn" onClick={() => setOrg({ setupDone: true })}>
          Skip: use the sample organisation
        </button>
        <div className="flex gap-2">
          {i > 0 && (
            <button type="button" className="aj-pill" onClick={() => setI(i - 1)}>
              Back
            </button>
          )}
          <button type="button" className="aj-ink-btn" onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : setOrg({ setupDone: true }))}>
            {i < STEPS.length - 1 ? 'Next' : 'Finish'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrgSettings() {
  const s = useDemo();
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-5 lg:px-8 lg:py-8">
      <h1 className="aj-display aj-h1" style={{ margin: 0 }}>
        Organisation
      </h1>
      {STEPS.map((st) => (
        <Section key={st.key} title={st.label}>
          <div className="aj-card p-4">
            <st.View org={s.org} />
          </div>
        </Section>
      ))}
      <button type="button" className="aj-text-btn self-start" onClick={() => setOrg({ setupDone: false })}>
        <Globe size={13} strokeWidth={2} className="mr-1 inline" /> Run the set-up again
      </button>
    </div>
  );
}

const ROLE_HINT: Record<Person['role'], string> = {
  owner: 'Everything, including settings, payment, and overriding an approval',
  member: 'Creates, edits, and publishes jobs',
  reviewer: 'Comments, suggests, and approves',
};

export function Team() {
  const s = useDemo();
  const [email, setEmail] = useState('');
  const [role, setRoleState] = useState<Person['role']>('member');
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-5 lg:px-8 lg:py-8">
      <div>
        <h1 className="aj-display aj-h1" style={{ margin: 0 }}>
          Team
        </h1>
        <p className="aj-muted" style={{ margin: '4px 0 0' }}>
          Optional. On your own, you can do everything. Invite people when you want help or approval.
        </p>
      </div>
      <ul className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {s.team.map((p) => (
          <li key={p.id} className="aj-card flex flex-wrap items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <div style={{ fontWeight: 650 }}>
                {p.name}
                {p.id === s.me.id ? ' (you)' : ''}
              </div>
              <div className="aj-faint truncate">{p.email}</div>
            </div>
            <Tip label={ROLE_HINT[p.role]}>
            <select style={{ ...inputStyle, width: 130, minHeight: 34 }} value={p.role} disabled={p.id === s.me.id} onChange={(e) => setRole(p.id, e.target.value as Person['role'])} aria-label={`Role for ${p.name}`}>
              <option value="owner">Owner</option>
              <option value="member">Member</option>
              <option value="reviewer">Reviewer</option>
            </select>
            </Tip>
            {p.id !== s.me.id && (
              <Tip label={`Remove ${p.name}`}>
                <button type="button" className="aj-icon-btn" onClick={() => removeMember(p.id)} aria-label={`Remove ${p.name}`}>
                  <Trash2 size={14} strokeWidth={1.8} />
                </button>
              </Tip>
            )}
          </li>
        ))}
      </ul>
      <Section title="Invite">
        <div className="aj-card flex flex-col gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            <input style={{ ...inputStyle, flex: 1, minWidth: 200 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`name@${s.org.domain}`} type="email" aria-label="Email" />
            <select style={{ ...inputStyle, width: 130 }} value={role} onChange={(e) => setRoleState(e.target.value as Person['role'])} aria-label="Role">
              <option value="member">Member</option>
              <option value="reviewer">Reviewer</option>
              <option value="owner">Owner</option>
            </select>
            <button
              type="button"
              className="aj-ink-btn"
              disabled={!isEmail(email) || s.team.some((p) => p.email === email.toLowerCase())}
              onClick={() => {
                invite(email.trim().toLowerCase(), role);
                setEmail('');
              }}
            >
              <Plus size={14} strokeWidth={2} /> Invite
            </button>
          </div>
          <ul className="aj-faint flex flex-col gap-0.5" style={{ margin: 0, paddingLeft: 18 }}>
            {(Object.keys(ROLE_HINT) as Person['role'][]).map((r) => (
              <li key={r}>
                <strong style={{ textTransform: 'capitalize' }}>{r}</strong>: {ROLE_HINT[r]}
              </li>
            ))}
          </ul>
        </div>
      </Section>
      <Section title="Approval before publishing">
        <div className="aj-card p-4">
          <ApprovalSettingView org={s.org} />
        </div>
      </Section>
    </div>
  );
}

function FormatEditor({ format, onClose }: { format: Format; onClose: () => void }) {
  const editable = format.family === 'Your organisation';
  const save = (patch: Partial<Format>) => update((s) => ({ ...s, formats: s.formats.map((x) => (x.key === format.key ? { ...x, ...patch } : x)) }));
  const has = (k: string) => format.order.some((o) => o.key === k);
  return (
    <div className="aj-card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        {editable ? <input style={{ ...inputStyle, fontWeight: 650 }} value={format.label} onChange={(e) => save({ label: e.target.value })} aria-label="Format name" /> : <span style={{ fontWeight: 700 }}>{format.label}</span>}
        <button type="button" className="aj-pill ml-auto" onClick={onClose}>
          Done
        </button>
      </div>
      {!editable && <span className="aj-faint">Real formats are kept as their users write them. Duplicate one to make your own.</span>}
      <Field label="Headings, in order">
        <ol className="flex flex-col gap-1" style={{ margin: 0, paddingLeft: 20 }}>
          {format.order.map((o, i) => (
            <li key={o.key}>
              {editable ? (
                <input style={{ ...inputStyle, minHeight: 32 }} value={o.heading} onChange={(e) => save({ order: format.order.map((x, k) => (k === i ? { ...x, heading: e.target.value } : x)) })} aria-label={`Heading ${i + 1}`} />
              ) : (
                o.heading
              )}
            </li>
          ))}
        </ol>
      </Field>
      {editable && (
        <Field label="Add or remove sections">
          <div className="flex flex-wrap gap-1.5">
            {SECTIONS.map((d) => (
              <button key={d.key} type="button" className="ej-tag" data-on={has(d.key)} onClick={() => save({ order: has(d.key) ? format.order.filter((o) => o.key !== d.key) : [...format.order, { key: d.key, heading: d.label }] })} aria-pressed={has(d.key)}>
                {d.label}
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field label="Tone">
        <div className="flex gap-1.5">
          {(['formal', 'warm', 'plain'] as Tone[]).map((t) => (
            <button key={t} type="button" className="aj-pill" data-active={format.tone === t} disabled={!editable} onClick={() => save({ tone: t })}>
              {t}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

export function Styles() {
  const s = useDemo();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const duplicate = (f: Format) => {
    const key = nextId('format');
    update((x) => ({ ...x, formats: [...x.formats, { ...f, key, family: 'Your organisation', label: `${f.label} (${x.org.short})`, usedBy: `Based on ${f.label}` }] }));
    setEditing(key);
  };
  const shown = s.formats.filter((f) => !f.key.startsWith('pasted-'));
  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5 px-4 py-5 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="aj-display aj-h1" style={{ margin: 0 }}>
            JD formats
          </h1>
          <p className="aj-muted" style={{ margin: '4px 0 0' }}>
            Real job description formats, named by format, with the headings their users write. Yours come first. Any section can be added to any job.
          </p>
        </div>
        <button type="button" className="aj-ink-btn" onClick={() => setCreating(true)}>
          Create your own JD format
        </button>
      </div>
      {creating && <CreateFormatDialog onClose={() => setCreating(false)} />}
      <BasePrompt s={s} />
      {s.formats.some((f) => f.key === 'house') && (
        <p className="aj-faint m-0" style={{ fontSize: 12 }}>
          Your base JD format is where new jobs start.{' '}
          <button type="button" className="aj-text-btn" style={{ height: 24, padding: 0 }} onClick={forgetBase}>
            Forget our base JD format
          </button>
        </p>
      )}
      {FAMILIES_ORDER.map((fam) => {
        const list = shown.filter((f) => f.family === fam);
        if (!list.length) return null;
        return (
          <Section key={fam} title={fam}>
            <ul className="grid gap-3 md:grid-cols-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {list.map((f) =>
                editing === f.key ? (
                  <li key={f.key} className="md:col-span-2">
                    <FormatEditor format={f} onClose={() => setEditing(null)} />
                  </li>
                ) : (
                  <li key={f.key} className="aj-card flex flex-col gap-2 p-4">
                    <div className="flex items-center gap-2">
                      <span style={{ fontWeight: 700 }}>{f.label}</span>
                      <span className="aj-chip" data-tone={f.family === 'Your organisation' ? 'sage' : undefined}>
                        {f.family === 'Your organisation' ? 'Yours' : f.tone}
                      </span>
                    </div>
                    <span className="aj-faint" style={{ fontSize: 11.5 }}>
                      {f.usedBy}
                    </span>
                    <ol className="aj-muted" style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                      {f.order.map((o) => (
                        <li key={o.key}>{o.heading}</li>
                      ))}
                    </ol>
                    <div className="mt-1 flex gap-1.5">
                      <button type="button" className="aj-pill" onClick={() => setEditing(f.key)}>
                        {f.family === 'Your organisation' ? 'Edit' : 'View'}
                      </button>
                      <button type="button" className="aj-pill" onClick={() => duplicate(f)}>
                        Duplicate
                      </button>
                      {f.family === 'Your organisation' && f.key !== 'house' && (
                        <Tip label={`Delete ${f.label}`}>
                          <button type="button" className="aj-icon-btn" onClick={() => update((x) => ({ ...x, formats: x.formats.filter((y) => y.key !== f.key) }))} aria-label={`Delete ${f.label}`}>
                            <Trash2 size={14} strokeWidth={1.8} />
                          </button>
                        </Tip>
                      )}
                    </div>
                  </li>
                ),
              )}
            </ul>
          </Section>
        );
      })}
    </div>
  );
}