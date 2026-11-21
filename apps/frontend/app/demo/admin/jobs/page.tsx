'use client';

import { Briefcase, Clock, Download, MapPin, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Flag from '../../_components/Flag';
import Tip from '../../_components/Tip';
import { DaysChip, displayOrg, FilterPill, OptionList, OrgMark } from '../../_components/PublicDemo';
import jobsData from '../../_data/jobs.json';
import {
  countBy,
  countryName,
  DEADLINE_LABELS,
  formatDate,
  matchesDeadline,
  normaliseJobs,
  sortByDeadline,
  type DeadlineFilter,
  type RawJob,
} from '../../_lib/jobs';

type Column = 'organisation' | 'location' | 'deadline' | 'status';
const COLUMN_LABELS: Record<Column, string> = { organisation: 'Organisation', location: 'Location', deadline: 'Deadline', status: 'Status' };

export default function DemoAdminJobs() {
  const jobs = useMemo(() => sortByDeadline(normaliseJobs(jobsData as RawJob[])), []);
  const [org, setOrg] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<DeadlineFilter | null>(null);
  const [query, setQuery] = useState('');
  const [popover, setPopover] = useState<'org' | 'country' | 'deadline' | 'columns' | null>(null);
  const [columns, setColumns] = useState<Record<Column, boolean>>({ organisation: true, location: true, deadline: true, status: true });
  const [checked, setChecked] = useState<string[]>([]);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popover) return;
    const close = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setPopover(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [popover]);

  const q = query.trim().toLowerCase();
  const keep = (skip?: string) =>
    jobs.filter(
      (j) =>
        (skip === 'org' || !org || j.org === org) &&
        (skip === 'country' || !country || j.iso === country) &&
        (skip === 'deadline' || matchesDeadline(j, deadline)) &&
        (!q || `${j.title} ${j.org} ${j.place ?? ''}`.toLowerCase().includes(q)),
    );
  const list = keep();
  const shown = list.slice(0, 60);

  const grid = ['32px', 'minmax(0,2.2fr)', columns.organisation && 'minmax(0,1fr)', columns.location && 'minmax(0,1.3fr)', columns.deadline && '130px', columns.status && '90px']
    .filter(Boolean)
    .join(' ');

  const toggleAll = () => setChecked(checked.length === shown.length ? [] : shown.map((j) => j.id));

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-4 pb-24 pt-6 lg:px-8 lg:pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="dj-display" style={{ margin: 0 }}>
            Jobs
          </h1>
          <p className="dj-muted" style={{ margin: 0 }}>
            {list.length} of {jobs.length} shown publicly · demo copy from 20 Oct 2026
          </p>
        </div>
        <div className="flex items-center gap-2">
          {checked.length > 0 && (
            <span className="dj-chip" data-tone="sage">
              {checked.length} selected
            </span>
          )}
          <Tip label="Export as CSV (demo: does nothing)">
            <button type="button" className="dj-pill" aria-disabled="true">
              <Download size={13} strokeWidth={1.8} /> Export
            </button>
          </Tip>
        </div>
      </div>

      <div ref={barRef} className="dj-card flex flex-wrap items-center gap-2 p-2">
        <FilterPill label="Organisation" icon={<Briefcase size={13} strokeWidth={1.8} />} value={org ? displayOrg(org) : null} open={popover === 'org'} onOpen={() => setPopover(popover === 'org' ? null : 'org')} onClear={() => setOrg(null)}>
          <OptionList
            options={countBy(keep('org'), (j) => j.org).map(([k, n]) => ({ key: k, label: displayOrg(k), count: n, lead: <OrgMark name={k} size={18} /> }))}
            selected={org}
            searchable
            placeholder="Find an organisation"
            onPick={(k) => {
              setOrg(k === org ? null : k);
              setPopover(null);
            }}
          />
        </FilterPill>
        <FilterPill label="Country" icon={<MapPin size={13} strokeWidth={1.8} />} value={country ? countryName(country) : null} open={popover === 'country'} onOpen={() => setPopover(popover === 'country' ? null : 'country')} onClear={() => setCountry(null)}>
          <OptionList
            options={countBy(keep('country'), (j) => j.iso).map(([k, n]) => ({ key: k, label: countryName(k) ?? k, count: n, lead: <Flag iso={k} title={countryName(k)} /> }))}
            selected={country}
            searchable
            placeholder="Find a country"
            onPick={(k) => {
              setCountry(k === country ? null : k);
              setPopover(null);
            }}
          />
        </FilterPill>
        <FilterPill label="Deadline" icon={<Clock size={13} strokeWidth={1.8} />} value={deadline ? DEADLINE_LABELS[deadline] : null} open={popover === 'deadline'} onOpen={() => setPopover(popover === 'deadline' ? null : 'deadline')} onClear={() => setDeadline(null)}>
          <OptionList
            options={(Object.keys(DEADLINE_LABELS) as DeadlineFilter[]).map((k) => ({ key: k, label: DEADLINE_LABELS[k], count: keep('deadline').filter((j) => matchesDeadline(j, k)).length })).filter((o) => o.count > 0)}
            selected={deadline}
            onPick={(k) => {
              setDeadline(k === deadline ? null : (k as DeadlineFilter));
              setPopover(null);
            }}
          />
        </FilterPill>
        <div className="relative min-w-[180px] flex-1">
          <Search size={14} strokeWidth={1.8} className="dj-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="dj-input" placeholder="Search jobs" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search jobs" />
        </div>
        <div className="relative">
          <Tip label="Choose columns">
            <button type="button" className="dj-icon-btn" onClick={() => setPopover(popover === 'columns' ? null : 'columns')} aria-label="Choose columns" aria-expanded={popover === 'columns'}>
              <SlidersHorizontal size={14} strokeWidth={1.8} />
            </button>
          </Tip>
          {popover === 'columns' && (
            <div className="dj-popover absolute right-0 top-[calc(100%+6px)]" style={{ minWidth: 200 }}>
              {(Object.keys(COLUMN_LABELS) as Column[]).map((c) => (
                <label key={c} className="dj-option">
                  <input type="checkbox" checked={columns[c]} onChange={() => setColumns({ ...columns, [c]: !columns[c] })} />
                  <span>{COLUMN_LABELS[c]}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="dj-card overflow-x-auto p-2">
        <div className="min-w-[720px]">
          <div className="dj-faint grid items-center gap-3 px-3 py-2" style={{ gridTemplateColumns: grid }}>
            <input type="checkbox" aria-label="Select all shown" checked={shown.length > 0 && checked.length === shown.length} onChange={toggleAll} />
            <span>Title</span>
            {columns.organisation && <span>Organisation</span>}
            {columns.location && <span>Location</span>}
            {columns.deadline && <span>Deadline</span>}
            {columns.status && <span>Status</span>}
          </div>
          {shown.map((j) => {
            const isChecked = checked.includes(j.id);
            return (
              <div key={j.id} className="dj-row gap-3" style={{ display: 'grid', gridTemplateColumns: grid, cursor: 'default' }} data-active={isChecked}>
                <input
                  type="checkbox"
                  aria-label={`Select ${j.title}`}
                  checked={isChecked}
                  onChange={() => setChecked(isChecked ? checked.filter((c) => c !== j.id) : [...checked, j.id])}
                />
                <span className="truncate" style={{ fontWeight: 560 }} title={j.title}>
                  {j.title}
                </span>
                {columns.organisation && (
                  <span className="flex min-w-0 items-center gap-2">
                    <OrgMark name={j.org} size={18} />
                    <span className="truncate">{displayOrg(j.org)}</span>
                  </span>
                )}
                {columns.location && (
                  <span className="dj-muted flex min-w-0 items-center gap-1.5">
                    <Flag iso={j.iso} title={j.country} />
                    <span className="truncate">{j.place ?? 'Not listed'}</span>
                  </span>
                )}
                {columns.deadline && (
                  <span className="flex items-center gap-1.5">
                    {j.deadline ? (
                      <>
                        <span className="dj-muted">{formatDate(j.deadline)}</span>
                        <DaysChip job={j} />
                      </>
                    ) : (
                      <span className="dj-faint">None</span>
                    )}
                  </span>
                )}
                {columns.status && (
                  <span>
                    <span className="dj-chip" data-tone={j.daysLeft !== null && j.daysLeft < 0 ? undefined : 'sage'}>
                      {j.daysLeft !== null && j.daysLeft < 0 ? 'Closed' : 'Active'}
                    </span>
                  </span>
                )}
              </div>
            );
          })}
          {list.length > shown.length && <div className="dj-faint px-3 py-3">Showing the first {shown.length} of {list.length}. Paging is not part of the demo.</div>}
        </div>
      </div>
    </div>
  );
}
