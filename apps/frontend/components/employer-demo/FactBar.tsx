'use client';

import { Banknote, Briefcase, CalendarClock, Info, Layers, MapPin, MoreHorizontal, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Tip from '@/components/site/Tip';
import { setFacts } from './actions';
import { arrangementLabel, CONTRACTS, emptyFacts, ENGAGEMENTS, extractFacts, googleType, holiday, longDate, placeOf, PLACES, salarySuggestion, salaryText, SALARY_FACTS, shortDate, weekend } from './engine';
import type { DemoJob, Facts, SalaryMode, State } from './types';
import MenuButton from './MenuButton';
import { getState } from './store';
import { Dialog, Field, inputStyle } from './ui';

type PillKey = 'place' | 'type' | 'grade' | 'closes' | 'salary' | 'more';

function Pill({ icon, label, value, missing, onClick, extra, disabled }: { icon: ReactNode; label: string; value: string; missing?: boolean; onClick: () => void; extra?: ReactNode; disabled?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center">
      <button type="button" className="ej-fact" data-missing={missing} onClick={onClick} disabled={disabled} aria-label={disabled ? `${label}: ${value || 'not set'}` : `${label}: ${value || 'not set'}. Edit`}>
        {icon}
        <span style={{ fontWeight: 600 }}>{value || label}</span>
      </button>
      {extra}
    </span>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ key: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" className="aj-pill" data-active={value === o.key} onClick={() => onChange(o.key)} role="radio" aria-checked={value === o.key}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const UN_GRADES = [
  { group: 'Professional and director', grades: ['P1', 'P2', 'P3', 'P4', 'P5', 'D1', 'D2'] },
  { group: 'General Service', grades: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'] },
  { group: 'National Officer', grades: ['NOA', 'NOB', 'NOC', 'NOD'] },
];
const UN_YEARS: Record<string, number> = { P2: 2, P3: 5, P4: 7, P5: 10, D1: 15, D2: 15 };

function PlaceDialog({ job, s, onClose }: { job: DemoJob; s: State; onClose: () => void }) {
  const f = job.facts;
  const [q, setQ] = useState(f.location);
  const options = PLACES.filter((p) => s.org.countries.includes(p.country) || p.city.toLowerCase().startsWith(q.toLowerCase().slice(0, 3)));
  const choose = (city: string) => {
    const p = PLACES.find((x) => x.city === city);
    if (p) setFacts(job.id, { location: `${p.city}, ${p.country}`, country: p.country, iso: p.iso, timezone: p.tz, currency: f.currency || p.currency });
    setQ(p ? `${p.city}, ${p.country}` : city);
  };
  /** A place not in the list: the country, time zone, and weekend come from what was typed, never from the previous place. */
  const typed = (text: string) => {
    const { facts: read } = extractFacts(`based in ${text}`, s.today, emptyFacts());
    setFacts(job.id, { location: read.location || text, country: read.country, iso: read.iso, timezone: read.timezone });
  };
  return (
    <Dialog title="Duty station and work arrangement" onClose={onClose} footer={<div className="flex justify-end"><button type="button" className="aj-ink-btn" onClick={onClose}>Done</button></div>}>
      <div className="flex flex-col gap-3">
        <Field label="Duty station">
          <input style={inputStyle} value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q && q !== f.location && !placeOf(q) && typed(q)} placeholder="City, country" />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {options.slice(0, 8).map((p) => (
            <button key={p.city} type="button" className="aj-pill" data-active={f.location.startsWith(p.city)} onClick={() => choose(p.city)}>
              {p.city}
            </button>
          ))}
        </div>
        <Field label="Work arrangement">
          <Seg value={f.arrangement} label="Work arrangement" options={(['onsite', 'hybrid', 'remote'] as const).map((k) => ({ key: k, label: arrangementLabel(k) }))} onChange={(v) => setFacts(job.id, { arrangement: v })} />
        </Field>
      </div>
    </Dialog>
  );
}

function TypeDialog({ job, onClose }: { job: DemoJob; onClose: () => void }) {
  const f = job.facts;
  return (
    <Dialog title="Job type" subtitle={`Google job type: ${googleType(f).join(', ')}`} onClose={onClose} footer={<div className="flex justify-end"><button type="button" className="aj-ink-btn" onClick={onClose}>Done</button></div>}>
      <div className="flex flex-col gap-4">
        <Field label="1 · Engagement">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {ENGAGEMENTS.map((e) => (
              <button key={e.key} type="button" className="aj-option" data-active={f.engagement === e.key} onClick={() => setFacts(job.id, { engagement: e.key, contract: CONTRACTS[e.key][0] })} role="radio" aria-checked={f.engagement === e.key}>
                <span className="flex flex-col">
                  <span style={{ fontWeight: 650 }}>{e.label}</span>
                  <span className="aj-faint">{e.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="2 · Contract and hours">
          <div className="flex flex-col gap-2">
            <Seg value={f.contract} label="Contract" options={CONTRACTS[f.engagement].map((c) => ({ key: c, label: c }))} onChange={(v) => setFacts(job.id, { contract: v })} />
            <Seg value={f.hours} label="Hours" options={[{ key: 'full', label: 'Full-time' }, { key: 'part', label: 'Part-time' }]} onChange={(v) => setFacts(job.id, { hours: v })} />
            <input style={inputStyle} value={f.duration} onChange={(e) => setFacts(job.id, { duration: e.target.value })} placeholder="Duration, e.g. 12 months" aria-label="Duration" />
          </div>
        </Field>
        <Field label="3 · Recruitment">
          <div className="flex flex-col gap-1.5">
            {(
              [
                ['vacancy', 'Specific vacancy', 'One post to fill now'],
                ['roster', 'Roster or talent pool', 'Candidates join a pool and are deployed when needed (e.g. MSF, ICRC, DRC, Plan)'],
                ['proposal', 'Proposal stage', 'Contingent on a contract award (e.g. key personnel for a bid)'],
              ] as const
            ).map(([k, l, h]) => (
              <button key={k} type="button" className="aj-option" data-active={f.recruitment === k} onClick={() => setFacts(job.id, { recruitment: k })} role="radio" aria-checked={f.recruitment === k}>
                <span className="flex flex-col">
                  <span style={{ fontWeight: 650 }}>{l}</span>
                  <span className="aj-faint">{h}</span>
                </span>
              </button>
            ))}
            {f.recruitment === 'vacancy' && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={f.subjectToFunding} onChange={(e) => setFacts(job.id, { subjectToFunding: e.target.checked })} /> Subject to funding
              </label>
            )}
            {f.recruitment === 'roster' && <input style={inputStyle} value={f.availability} onChange={(e) => setFacts(job.id, { availability: e.target.value })} placeholder="Availability, e.g. at least 6 months" aria-label="Availability" />}
            {f.recruitment === 'proposal' && (
              <div className="flex flex-col gap-1.5">
                <input style={inputStyle} value={f.client} onChange={(e) => setFacts(job.id, { client: e.target.value })} placeholder="Client or donor" aria-label="Client or donor" />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={f.keyPersonnel} onChange={(e) => setFacts(job.id, { keyPersonnel: e.target.checked })} /> Key personnel
                </label>
              </div>
            )}
            <span className="aj-faint" style={{ fontSize: 11 }}>
              Candidates see {f.recruitment === 'roster' ? '"Roster"' : f.recruitment === 'proposal' ? '"Proposal stage"' : 'no extra label'} on AidJobs, and the wording follows.
            </span>
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

function GradeDialog({ job, s, onClose }: { job: DemoJob; s: State; onClose: () => void }) {
  const f = job.facts;
  const pick = (g: string) => setFacts(job.id, { grade: g });
  return (
    <Dialog title="Grade or band" onClose={onClose} footer={<div className="flex justify-between"><button type="button" className="aj-text-btn" onClick={() => pick('')}>No grade</button><button type="button" className="aj-ink-btn" onClick={onClose}>Done</button></div>}>
      <div className="flex flex-col gap-3">
        {s.org.scale.length > 0 && (
          <Field label={`${s.org.short} scale (private)`}>
            <div className="flex flex-wrap gap-1.5">
              {s.org.scale.map((r) => (
                <button key={r.grade} type="button" className="aj-pill" data-active={f.grade === r.grade} onClick={() => pick(r.grade)}>
                  {r.grade}
                </button>
              ))}
            </div>
          </Field>
        )}
        {UN_GRADES.map((g) => (
          <Field key={g.group} label={`UN common system · ${g.group}`}>
            <div className="flex flex-wrap gap-1.5">
              {g.grades.map((x) => (
                <Tip key={x} label={UN_YEARS[x] ? `${x}: usually at least ${UN_YEARS[x]} years of experience` : x}>
                  <button type="button" className="aj-pill" data-active={f.grade === x} onClick={() => pick(x)}>
                    {x}
                  </button>
                </Tip>
              ))}
            </div>
          </Field>
        ))}
        <Field label="Other scale">
          <input style={inputStyle} value={f.grade} onChange={(e) => pick(e.target.value)} placeholder="e.g. Grade 06 Step 01, Band G-2, SCHCADS Level 4" />
        </Field>
      </div>
    </Dialog>
  );
}

function ClosesDialog({ job, onClose }: { job: DemoJob; onClose: () => void }) {
  const f = job.facts;
  return (
    <Dialog title="Closing date" onClose={onClose} footer={<div className="flex justify-end"><button type="button" className="aj-ink-btn" onClick={onClose}>Done</button></div>}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Date">
            <input type="date" style={inputStyle} value={f.deadline} onChange={(e) => setFacts(job.id, { deadline: e.target.value })} />
          </Field>
          <Field label={`Time${f.timezone ? ` (${f.timezone})` : ''}`}>
            <input type="time" style={inputStyle} value={f.closingTime} onChange={(e) => setFacts(job.id, { closingTime: e.target.value })} />
          </Field>
        </div>
        {f.deadline && weekend(f.deadline) && <span className="aj-muted">{longDate(f.deadline)} is a weekend; candidates may expect it to close the working day before.</span>}
        {f.deadline && holiday(f.deadline, f.iso) && <span className="aj-muted">{longDate(f.deadline)} is a public holiday{f.country ? ` in ${f.country}` : ''}.</span>}
        <Field label="Start date (optional)">
          <input type="date" style={inputStyle} value={f.startDate} onChange={(e) => setFacts(job.id, { startDate: e.target.value })} />
        </Field>
      </div>
    </Dialog>
  );
}

const SALARY_MODES: Array<{ key: SalaryMode; label: string }> = [
  { key: 'range', label: 'Range' },
  { key: 'exact', label: 'Exact' },
  { key: 'scale', label: 'As per our scale' },
  { key: 'grade', label: 'Grade only' },
  { key: 'competitive', label: 'Competitive' },
  { key: 'daily', label: 'Daily rate' },
  { key: 'hidden', label: 'Not shown' },
];

function SalaryDialog({ job, s, onClose }: { job: DemoJob; s: State; onClose: () => void }) {
  const f = job.facts;
  const hint = salarySuggestion(f, s.org);
  const law = placeOf(f.location)?.payLaw;
  const fmt = (n: number) => n.toLocaleString('en-GB');
  return (
    <Dialog title="Salary" subtitle="Your choice" onClose={onClose} footer={<div className="flex justify-end"><button type="button" className="aj-ink-btn" onClick={onClose}>Done</button></div>}>
      <div className="flex flex-col gap-3">
        <Seg value={f.salaryMode} label="How to show pay" options={SALARY_MODES} onChange={(v) => setFacts(job.id, { salaryMode: v })} />
        {(f.salaryMode === 'range' || f.salaryMode === 'exact' || f.salaryMode === 'daily') && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input style={inputStyle} value={f.currency} onChange={(e) => setFacts(job.id, { currency: e.target.value.toUpperCase() })} placeholder="Currency" aria-label="Currency" />
            <input style={inputStyle} value={f.salaryMin} onChange={(e) => setFacts(job.id, { salaryMin: e.target.value })} placeholder={f.salaryMode === 'range' ? 'From' : 'Amount'} aria-label="Amount from" />
            {f.salaryMode === 'range' && <input style={inputStyle} value={f.salaryMax} onChange={(e) => setFacts(job.id, { salaryMax: e.target.value })} placeholder="To" aria-label="Amount to" />}
            {f.salaryMode !== 'daily' && (
              <select style={inputStyle} value={f.period} onChange={(e) => setFacts(job.id, { period: e.target.value as Facts['period'] })} aria-label="Per">
                <option value="hour">an hour</option>
                <option value="month">a month</option>
                <option value="year">a year</option>
              </select>
            )}
          </div>
        )}
        {hint && (
          <div className="rounded-xl p-3" style={{ background: 'var(--sage-1)' }}>
            <div className="flex items-center gap-1.5" style={{ fontWeight: 650 }}>
              <Sparkles size={13} strokeWidth={2} style={{ color: 'var(--sage-7)' }} /> Suggested: {hint.currency} {fmt(hint.min)} to {fmt(hint.max)} a {hint.period}
            </div>
            <div className="aj-muted" style={{ fontSize: 12 }}>
              Based on: {hint.basis}
            </div>
            <button type="button" className="aj-text-btn" onClick={() => setFacts(job.id, { salaryMode: 'range', currency: hint.currency, salaryMin: fmt(hint.min), salaryMax: fmt(hint.max), period: hint.period })}>
              Use this range
            </button>
          </div>
        )}
        <ul className="flex flex-col gap-1" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Why some employers show pay">
          {SALARY_FACTS.map((x) => (
            <li key={x.text} className="aj-muted" style={{ fontSize: 12 }}>
              {x.text} <span className="aj-faint">({x.source})</span>
            </li>
          ))}
        </ul>
        {law && <span className="aj-faint" style={{ fontSize: 12 }}>For information: in {law}, job postings must show a pay range by law.</span>}
      </div>
    </Dialog>
  );
}

function MoreDialog({ job, onClose }: { job: DemoJob; onClose: () => void }) {
  const f = job.facts;
  return (
    <Dialog title="More details" subtitle="Only what applies" onClose={onClose} footer={<div className="flex justify-end"><button type="button" className="aj-ink-btn" onClick={onClose}>Done</button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Who can apply">
          <select style={inputStyle} value={f.eligibility} onChange={(e) => setFacts(job.id, { eligibility: e.target.value as Facts['eligibility'] })}>
            <option value="anyone">Anyone</option>
            <option value="nationals">Nationals only</option>
            <option value="internal">Internal candidates only</option>
            <option value="righttowork">Must have the right to work</option>
          </select>
        </Field>
        <Field label="Contact with children">
          <select style={inputStyle} value={f.safeguarding} onChange={(e) => setFacts(job.id, { safeguarding: e.target.value as Facts['safeguarding'] })}>
            <option value="">Not stated</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High: frequent or intensive contact</option>
          </select>
        </Field>
        <Field label="Direct reports">
          <input style={inputStyle} value={f.directReports} onChange={(e) => setFacts(job.id, { directReports: e.target.value })} placeholder="e.g. 4" />
        </Field>
        <Field label="Positions">
          <input style={inputStyle} value={f.positions} onChange={(e) => setFacts(job.id, { positions: e.target.value })} placeholder="1" />
        </Field>
        <Field label="Donor or project">
          <input style={inputStyle} value={f.donor} onChange={(e) => setFacts(job.id, { donor: e.target.value })} placeholder="e.g. ECHO, FCDO" />
        </Field>
        <Field label="Languages (first is required)">
          <input style={inputStyle} value={f.languages.join(', ')} onChange={(e) => setFacts(job.id, { languages: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="English, French" />
        </Field>
      </div>
    </Dialog>
  );
}

export default function FactBar({ job, s }: { job: DemoJob; s: State }) {
  const [open, setOpen] = useState<PillKey | null>(null);
  const [fit, setFit] = useState(6);
  const row = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = row.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const count = () => {
      const widths = Array.from(measure.current?.children ?? []).map((x) => (x as HTMLElement).offsetWidth + 6);
      const room = el.clientWidth;
      const total = widths.reduce((a, w) => a + w, 0);
      if (total <= room) return setFit(widths.length);
      let used = 42;
      let n = 0;
      while (n < widths.length && used + widths[n] <= room) used += widths[n++];
      setFit(Math.max(1, n));
    };
    const watch = new ResizeObserver(count);
    watch.observe(el);
    if (measure.current) watch.observe(measure.current);
    return () => watch.disconnect();
  }, []);
  useEffect(() => {
    const fromSlot = (e: Event) => {
      if (!getState().reviewerAs) setOpen((e as CustomEvent<PillKey>).detail);
    };
    window.addEventListener('ej-open-fact', fromSlot);
    return () => window.removeEventListener('ej-open-fact', fromSlot);
  }, []);
  const f = job.facts;
  const type = [ENGAGEMENTS.find((e) => e.key === f.engagement)?.label.split(' ')[0], f.contract && f.contract !== 'Internship' ? f.contract.replace(' (under a year)', '') : '', f.recruitment === 'roster' ? 'Roster' : f.recruitment === 'proposal' ? 'Proposal' : ''].filter(Boolean).join(' · ');
  const salary = salaryText(f) || 'Not shown';
  const ro = Boolean(s.reviewerAs);
  const pills: Array<{ key: PillKey; icon: ReactNode; label: string; value: string; missing?: boolean; extra?: ReactNode }> = [
    { key: 'place', icon: <MapPin size={13} strokeWidth={1.8} />, label: 'Place', value: f.location ? `${f.location.split(',')[0]} · ${arrangementLabel(f.arrangement)}` : f.arrangement === 'remote' ? 'Remote' : '', missing: !f.location && f.arrangement !== 'remote' },
    { key: 'type', icon: <Briefcase size={13} strokeWidth={1.8} />, label: 'Job type', value: type },
    { key: 'grade', icon: <Layers size={13} strokeWidth={1.8} />, label: 'Grade', value: f.grade },
    { key: 'closes', icon: <CalendarClock size={13} strokeWidth={1.8} />, label: 'Closing date', value: f.deadline ? `Closes ${shortDate(f.deadline)}` : '', missing: !f.deadline },
    {
      key: 'salary',
      icon: <Banknote size={13} strokeWidth={1.8} />,
      label: 'Salary',
      value: salary,
      extra: (
        <Tip label={`${SALARY_FACTS[0].text} (${SALARY_FACTS[0].source})`}>
          <span className="ml-0.5 inline-flex items-center aj-faint" tabIndex={0} aria-label={SALARY_FACTS[0].text}>
            <Info size={12} strokeWidth={2} />
          </span>
        </Tip>
      ),
    },
    { key: 'more', icon: <MoreHorizontal size={13} strokeWidth={1.8} />, label: 'More details', value: 'More details' },
  ];
  const hidden = pills.slice(fit);
  return (
    <>
      <div ref={row} className="relative flex min-w-0 items-center gap-1.5" aria-label="Job facts">
        <div ref={measure} className="ej-measure" aria-hidden inert>
          {pills.map((p) => (
            <Pill key={p.key} icon={p.icon} label={p.label} value={p.value} missing={p.missing} extra={p.extra} onClick={() => undefined} />
          ))}
        </div>
        {pills.slice(0, fit).map((p) => (
          <Pill key={p.key} disabled={ro} icon={p.icon} label={p.label} value={p.value} missing={p.missing} extra={p.extra} onClick={() => setOpen(p.key)} />
        ))}
        {hidden.length > 0 && (
          <MenuButton
            label={`${hidden.length} more job ${hidden.length === 1 ? 'fact' : 'facts'}`}
            trigger={<span className="ej-more-facts">+{hidden.length}</span>}
            actions={hidden.map((p) => ({ label: `${p.label}: ${p.key === 'more' ? 'who can apply, start date, and more' : p.value || 'not set'}`, run: () => !ro && setOpen(p.key) }))}
          />
        )}
      </div>      {open === 'place' && <PlaceDialog job={job} s={s} onClose={() => setOpen(null)} />}
      {open === 'type' && <TypeDialog job={job} onClose={() => setOpen(null)} />}
      {open === 'grade' && <GradeDialog job={job} s={s} onClose={() => setOpen(null)} />}
      {open === 'closes' && <ClosesDialog job={job} onClose={() => setOpen(null)} />}
      {open === 'salary' && <SalaryDialog job={job} s={s} onClose={() => setOpen(null)} />}
      {open === 'more' && <MoreDialog job={job} onClose={() => setOpen(null)} />}
    </>
  );
}
