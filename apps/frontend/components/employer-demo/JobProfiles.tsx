'use client';

import { ArrowLeft, MoreHorizontal, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useIsPhone } from '@/components/site/BottomSheet';
import Tip from '@/components/site/Tip';
import { deleteProfile, formatOf, renameProfile, startJobFromProfile, updateProfile } from './actions';
import { COMMITMENTS, CONTRACTS, emptyFacts, headingFor, salaryText } from './engine';
import { isLocked } from './fixed';
import { openJob } from './Home';
import MenuButton, { type MenuAction } from './MenuButton';
import { profileName, profileSavedWhen, profileTags } from './profiles';
import { go, goBack, useDemo, useRoute } from './store';
import { langOf } from './translate';
import type { ApplySettings, Facts, JobLang, JobProfile, State } from './types';
import { Field, HeaderSlot, inputStyle, Section } from './ui';

/** Phase 7: Job profiles list and open-profile panel. */
export default function JobProfiles() {
  const s = useDemo();
  const route = useRoute();
  if (s.reviewerAs) {
    return (
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-3 px-4 pb-10 pt-6 lg:px-8">
        <h1 className="aj-display" style={{ margin: 0, fontSize: 22 }}>
          Job profiles
        </h1>
        <p className="aj-muted" style={{ margin: 0 }}>
          Only your organisation can manage job profiles. Switch back from viewing as a reviewer.
        </p>
      </div>
    );
  }
  const openId = route.id;
  const open = openId ? (s.profiles ?? []).find((p) => p.id === openId) : undefined;
  if (openId && !open) {
    return (
      <List s={s} gone={openId}>
        <p className="aj-muted" role="status" style={{ margin: 0 }}>
          That job profile is gone.
        </p>
      </List>
    );
  }
  if (open) return <Detail s={s} profile={open} />;
  return <List s={s} />;
}

function List({ s, gone, children }: { s: State; gone?: string; children?: ReactNode }) {
  const phone = useIsPhone();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const refocusRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const q = query.trim().toLowerCase();
  const profiles = s.profiles ?? [];
  const shown = q
    ? profiles.filter((p) => {
        const format = formatOf(s, p.format).label.toLowerCase();
        return [profileName(p), p.title, p.location, format].some((x) => x.toLowerCase().includes(q));
      })
    : profiles;

  useEffect(() => {
    if (gone) headingRef.current?.focus();
  }, [gone]);

  const search = <SearchToggle query={query} setQuery={setQuery} openField={searching} setOpenField={setSearching} refocusRef={refocusRef} />;
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4 px-4 pb-10 pt-4 lg:px-8 lg:pt-6">
      <h1 ref={headingRef} tabIndex={-1} className="aj-display" style={{ margin: 0, fontSize: 22, outline: 'none' }}>
        Job profiles
      </h1>
      <HeaderSlot>{(!phone || !searching) && search}</HeaderSlot>
      {children}
      {!profiles.length && (
        <p className="aj-muted" style={{ margin: 0 }}>
          Profiles appear when you publish a job. Hire again is for copying the written text of a past job.
        </p>
      )}
      {Boolean(profiles.length) && q && !shown.length && (
        <p className="aj-muted" style={{ margin: 0 }}>
          No profile matches “{query.trim()}”.
        </p>
      )}
      {shown.length > 0 && (
        <ul className="ej-divide flex flex-col" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {shown.map((p) => (
            <Row key={p.id} s={s} profile={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ s, profile: p }: { s: State; profile: JobProfile }) {
  const formatGone = !s.formats.some((f) => f.key === p.format);
  const format = formatOf(s, p.format);
  const tags = profileTags(p);
  const rowRef = useRef<HTMLButtonElement>(null);
  const actions: MenuAction[] = [
    {
      label: 'Rename',
      run: () => {
        const next = window.prompt('Name for this profile', p.name ?? profileName(p));
        if (next === null) return;
        renameProfile(p.id, next);
      },
    },
    {
      label: 'Delete',
      danger: true,
      run: () => {
        deleteProfile(p.id);
        rowRef.current?.blur();
      },
    },
  ];
  return (
    <li className="flex flex-wrap items-center gap-2 py-3">
      <button
        ref={rowRef}
        type="button"
        className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
        style={{ border: 'none', background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}
        onClick={() => go('profiles', p.id)}
        aria-label={profileName(p)}
      >
        <span style={{ fontWeight: 650 }}>{profileName(p)}</span>
        <span className="aj-faint">
          {formatGone ? 'Format no longer available' : format.label} · {tags.length} {tags.length === 1 ? 'section' : 'sections'} · {profileSavedWhen(p.at, s.today)}
        </span>
      </button>
      <button type="button" className="aj-pill shrink-0" disabled={formatGone} onClick={() => startJobFromProfile(p.id)} title={formatGone ? 'This profile’s JD format is gone' : undefined}>
        Use for a new job
      </button>
      <MenuButton label={`Actions for ${profileName(p)}`} tip="More" trigger={<MoreHorizontal size={15} strokeWidth={1.8} />} actions={actions} />
    </li>
  );
}

function Detail({ s, profile: p }: { s: State; profile: JobProfile }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const formatGone = !s.formats.some((f) => f.key === p.format);
  const format = formatOf(s, p.format);
  const tags = profileTags(p);
  const source = s.jobs.find((j) => j.id === p.from);
  const [nameDraft, setNameDraft] = useState(p.name ?? '');

  useEffect(() => {
    setNameDraft(p.name ?? '');
  }, [p.id, p.name]);

  useEffect(() => {
    panelRef.current?.focus();
  }, [p.id]);

  const saveName = () => {
    if ((p.name ?? '') === nameDraft.trim() || (!p.name && !nameDraft.trim())) return;
    renameProfile(p.id, nameDraft);
  };

  const back = () => {
    goBack('profiles');
    // Focus return to the row is handled after navigation when the list remounts; list heading is the fallback.
  };

  return (
    <div ref={panelRef} tabIndex={-1} className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-4 pb-10 pt-4 outline-none lg:px-8 lg:pt-6">
      <div className="flex flex-wrap items-center gap-2">
        <Tip label="Back" side="bottom">
          <button type="button" className="aj-icon-btn" onClick={back} aria-label="Back">
            <ArrowLeft size={16} strokeWidth={1.8} />
          </button>
        </Tip>
        <h1 className="aj-display min-w-0 flex-1" style={{ margin: 0, fontSize: 22 }}>
          {profileName(p)}
        </h1>
        <button type="button" className="aj-ink-btn shrink-0" disabled={formatGone} onClick={() => startJobFromProfile(p.id)}>
          Use for a new job
        </button>
        <MenuButton
          label={`Actions for ${profileName(p)}`}
          tip="More"
          trigger={<MoreHorizontal size={15} strokeWidth={1.8} />}
          actions={[
            {
              label: 'Delete',
              danger: true,
              run: () => {
                if (deleteProfile(p.id)) go('profiles');
              },
            },
          ]}
        />
      </div>

      {formatGone && (
        <p className="aj-muted" role="status" style={{ margin: 0 }}>
          This profile’s JD format is no longer available. You can rename or delete it, but not start a new job from it.
        </p>
      )}

      <Section title="Name">
        <Field label="Display name" hint="What the chat says next time. Leave blank for city and title.">
          <input
            style={inputStyle}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === 'Escape') {
                setNameDraft(p.name ?? '');
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label="Display name"
          />
        </Field>
      </Section>

      <Section title="Role">
        <dl className="ej-divide m-0 flex flex-col p-0">
          <FactLine label="Title">{p.title}</FactLine>
          <FactLine label="Place">{p.location || '—'}</FactLine>
          <FactLine label="JD format">{formatGone ? 'Gone' : format.label}</FactLine>
          <FactLine label="Style">{p.style?.length ? p.style.join(' · ') : '—'}</FactLine>
          {p.lang && p.lang !== 'en' && <FactLine label="Language">{langOf(p.lang as JobLang).label}</FactLine>}
          <FactLine label="Sections">{tags.map((k) => headingFor(k, format)).join(' · ') || '—'}</FactLine>
          <FactLine label="From">
            {source ? (
              <button type="button" className="aj-text-btn" style={{ height: 'auto', padding: 0 }} onClick={() => openJob(source)}>
                {source.facts.title}
              </button>
            ) : (
              <span>{p.title} (job no longer in the list)</span>
            )}
          </FactLine>
        </dl>
      </Section>

      <Section title="Facts">
        <div className="flex flex-col gap-3">
          <FactSelect
            label="Contract"
            value={p.facts.contract ?? ''}
            options={CONTRACTS[p.facts.engagement ?? 'job'] ?? CONTRACTS.job}
            onChange={(contract) => updateProfile(p.id, { facts: { contract } })}
          />
          <FactInput label="Grade" value={p.facts.grade ?? ''} onChange={(grade) => updateProfile(p.id, { facts: { grade } })} />
          <FactSelect
            label="Who can apply"
            value={p.facts.eligibility ?? 'anyone'}
            options={['anyone', 'nationals', 'internal']}
            labels={{ anyone: 'Anyone', nationals: 'Nationals only', internal: 'Internal only' }}
            onChange={(eligibility) => updateProfile(p.id, { facts: { eligibility: eligibility as Facts['eligibility'] } })}
          />
          <FactInput
            label="Languages"
            value={(p.facts.languages ?? []).join(', ')}
            onChange={(raw) =>
              updateProfile(p.id, {
                facts: {
                  languages: raw
                    .split(/[,;]/)
                    .map((x) => x.trim())
                    .filter(Boolean),
                },
              })
            }
          />
          <FactSelect
            label="Safeguarding"
            value={p.facts.safeguarding ?? ''}
            options={['', 'low', 'medium', 'high']}
            labels={{ '': 'None', low: 'Low', medium: 'Medium', high: 'High' }}
            onChange={(safeguarding) => updateProfile(p.id, { facts: { safeguarding: safeguarding as Facts['safeguarding'] } })}
          />
          <FactInput label="Duration" value={p.facts.duration ?? ''} onChange={(duration) => updateProfile(p.id, { facts: { duration } })} />
          <FactSelect
            label="Arrangement"
            value={p.facts.arrangement ?? 'onsite'}
            options={['onsite', 'hybrid', 'remote']}
            labels={{ onsite: 'On site', hybrid: 'Hybrid', remote: 'Remote' }}
            onChange={(arrangement) => updateProfile(p.id, { facts: { arrangement: arrangement as Facts['arrangement'] } })}
          />
          <FactSelect
            label="Hours"
            value={p.facts.hours ?? 'full'}
            options={['full', 'part']}
            labels={{ full: 'Full time', part: 'Part time' }}
            onChange={(hours) => updateProfile(p.id, { facts: { hours: hours as Facts['hours'] } })}
          />
          <FactSelect
            label="Recruitment"
            value={p.facts.recruitment ?? 'vacancy'}
            options={['vacancy', 'roster', 'proposal']}
            labels={{ vacancy: 'Vacancy', roster: 'Roster', proposal: 'Proposal' }}
            onChange={(recruitment) => updateProfile(p.id, { facts: { recruitment: recruitment as Facts['recruitment'] } })}
          />
          <p className="aj-faint m-0" style={{ fontSize: 12 }}>
            Pay as saved: {salaryText({ ...emptyFacts(), ...p.facts, title: p.title, location: p.location }) || 'Hidden'}
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <FactInput label="Pay min" value={p.facts.salaryMin ?? ''} onChange={(salaryMin) => updateProfile(p.id, { facts: { salaryMin } })} />
            <FactInput label="Pay max" value={p.facts.salaryMax ?? ''} onChange={(salaryMax) => updateProfile(p.id, { facts: { salaryMax } })} />
            <FactInput label="Currency" value={p.facts.currency ?? ''} onChange={(currency) => updateProfile(p.id, { facts: { currency } })} />
          </div>
        </div>
      </Section>

      <Section title="How to apply">
        <ApplyEdit apply={p.apply} onChange={(apply) => updateProfile(p.id, { apply })} />
      </Section>

      <Section title="Commitments">
        <ul className="m-0 flex flex-col gap-2 p-0" style={{ listStyle: 'none' }}>
          {COMMITMENTS.filter((c) => c.key !== 'mds' || s.org.mdsMember).map((c) => {
            const locked = isLocked(s.org, c.key);
            const on = p.commitments.includes(c.key);
            return (
              <li key={c.key} className="flex items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2" style={{ cursor: locked ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={locked && on}
                    onChange={() => {
                      if (locked && on) return;
                      const next = on ? p.commitments.filter((k) => k !== c.key) : [...p.commitments, c.key];
                      updateProfile(p.id, { commitments: next });
                    }}
                  />
                  <span>
                    {c.label}
                    {locked ? ' (locked)' : ''}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

function FactLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 py-2">
      <dt className="aj-faint w-[7rem] shrink-0">{label}</dt>
      <dd className="m-0 min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function FactInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <input style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)} onBlur={(e) => onChange(e.target.value.trim())} />
    </Field>
  );
}

function FactSelect({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <select style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        {!options.includes(value) && value ? <option value={value}>{value}</option> : null}
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
    </Field>
  );
}

function ApplyEdit({ apply, onChange }: { apply: ApplySettings; onChange: (a: ApplySettings) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <FactSelect
        label="Method"
        value={apply.method}
        options={['email', 'system', 'form', 'formOnly']}
        labels={{ email: 'By email', system: 'Careers site', form: 'Online form', formOnly: 'Form without CVs' }}
        onChange={(method) => onChange({ ...apply, method: method as ApplySettings['method'] })}
      />
      {apply.method === 'email' && <FactInput label="Email address" value={apply.address} onChange={(address) => onChange({ ...apply, address })} />}
      {(apply.method === 'system' || apply.method === 'form' || apply.method === 'formOnly') && (
        <FactInput label="Link" value={apply.address} onChange={(address) => onChange({ ...apply, address })} />
      )}
    </div>
  );
}

function SearchToggle({
  query,
  setQuery,
  openField,
  setOpenField,
  refocusRef,
}: {
  query: string;
  setQuery: (q: string) => void;
  openField: boolean;
  setOpenField: (o: boolean) => void;
  refocusRef: { current: boolean };
}) {
  const close = () => {
    refocusRef.current = true;
    setQuery('');
    setOpenField(false);
  };
  if (!openField)
    return (
      <button
        type="button"
        className="aj-icon-btn shrink-0"
        ref={(el) => {
          if (el && refocusRef.current) {
            refocusRef.current = false;
            el.focus();
          }
        }}
        onClick={() => setOpenField(true)}
        aria-label="Search profiles"
      >
        <Search size={15} strokeWidth={1.8} />
      </button>
    );
  return (
    <label className="ej-search">
      <Search size={14} strokeWidth={1.8} className="aj-faint shrink-0" />
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        placeholder="Search by name, title, or place"
        aria-label="Search profiles"
      />
      <button type="button" className="ej-search-close" onClick={close} aria-label="Close the search">
        <X size={13} strokeWidth={2} />
      </button>
    </label>
  );
}
