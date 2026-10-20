'use client';

import {
  Bookmark,
  Briefcase,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  LayoutDashboard,
  Mail,
  MapPin,
  Menu,
  Palette,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Flag from './Flag';
import SideMenu, { type MenuEntry, type MenuSection } from './SideMenu';
import Tip from './Tip';
import { usePersistentState } from './DemoRoot';
import {
  countBy,
  countryName,
  DEADLINE_LABELS,
  formatDate,
  formatLongDate,
  initials,
  isOpen,
  matchesDeadline,
  normaliseJobs,
  sortByDeadline,
  type DeadlineFilter,
  type Job,
  type RawJob,
} from '../_lib/jobs';

type View = 'all' | 'closing' | 'saved';
type PopoverKey = 'org' | 'country' | 'deadline';

export function displayOrg(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
}

export function OrgMark({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <span className="dj-mark" style={{ width: size, height: size, fontSize: size < 20 ? 8 : 10, borderRadius: size < 20 ? 5 : 7 }} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function DaysChip({ job }: { job: Job }) {
  if (job.daysLeft === null) return null;
  const d = job.daysLeft;
  const tone = d <= 3 ? 'red' : d <= 7 ? 'amber' : undefined;
  const text = d === 0 ? 'Today' : `${d}d`;
  return (
    <Tip label={`Closes ${formatLongDate(job.deadline)}${d === 0 ? ', today' : `, in ${d} day${d === 1 ? '' : 's'}`}`}>
      <span className="dj-chip" data-tone={tone}>
        <Clock size={11} strokeWidth={2} />
        {text}
      </span>
    </Tip>
  );
}

function matchesText(job: Job, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${job.title} ${job.org} ${job.place ?? ''} ${job.country ?? ''}`.toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

function icsFor(job: Job): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
  const day = (job.deadline ?? '').replace(/-/g, '');
  const next = new Date(`${job.deadline}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = next.toISOString().slice(0, 10).replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AidJobs//Design demo//EN',
    'BEGIN:VEVENT',
    `UID:${job.id}@aidjobs.app`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${esc(`Deadline: ${job.title} (${displayOrg(job.org)})`)}`,
    `DESCRIPTION:${esc(`Apply: ${job.apply_url}`)}`,
    `URL:${job.apply_url}`,
    'BEGIN:VALARM',
    'TRIGGER:-P2D',
    'ACTION:DISPLAY',
    'DESCRIPTION:Application deadline in 2 days',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function FilterPill({
  label,
  icon,
  value,
  open,
  onOpen,
  onClear,
  children,
}: {
  label: string;
  icon: ReactNode;
  value: string | null;
  open: boolean;
  onOpen: () => void;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative shrink-0">
      <button type="button" className="dj-pill" data-active={value ? 'true' : 'false'} onClick={onOpen} aria-expanded={open} aria-haspopup="listbox">
        {icon}
        <span className="max-w-[140px] truncate">{value ?? label}</span>
        {value ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Clear ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
                onClear();
              }
            }}
            className="inline-flex"
          >
            <X size={12} strokeWidth={2} />
          </span>
        ) : (
          <ChevronDown size={13} strokeWidth={1.8} />
        )}
      </button>
      {open && children}
    </div>
  );
}

export function OptionList({
  options,
  selected,
  onPick,
  searchable,
  placeholder,
}: {
  options: Array<{ key: string; label: string; count: number; lead?: ReactNode }>;
  selected: string | null;
  onPick: (key: string) => void;
  searchable?: boolean;
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="dj-popover dj-scroll fixed inset-x-3 bottom-24 lg:absolute lg:inset-x-auto lg:bottom-auto lg:left-0 lg:top-[calc(100%+6px)]" role="listbox">
      {searchable && (
        <div className="relative mb-1">
          <Search size={13} className="dj-faint absolute left-3 top-1/2 -translate-y-1/2" />
          <input autoFocus className="dj-input" style={{ height: 32 }} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {shown.map((o) => (
        <button key={o.key} type="button" className="dj-option" data-active={o.key === selected} onClick={() => onPick(o.key)} role="option" aria-selected={o.key === selected}>
          {o.lead}
          <span className="min-w-0 flex-1 truncate">{o.label}</span>
          <span className="dj-faint" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {o.count}
          </span>
          {o.key === selected && <Check size={13} style={{ color: 'var(--sage-7)' }} />}
        </button>
      ))}
      {shown.length === 0 && <div className="dj-faint px-2 py-3">Nothing matches</div>}
    </div>
  );
}

function JobRow({ job, active, saved, onOpen, onToggleSave }: { job: Job; active: boolean; saved: boolean; onOpen: () => void; onToggleSave: () => void }) {
  return (
    <div
      className="dj-row"
      data-active={active}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`${job.title}, ${displayOrg(job.org)}`}
    >
      <OrgMark name={job.org} />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 lg:line-clamp-1" style={{ fontSize: 13, fontWeight: 560, lineHeight: 1.35 }}>
          {job.title}
        </div>
        <div className="dj-muted flex min-w-0 items-center gap-1.5">
          <span className="shrink-0">{displayOrg(job.org)}</span>
          <span className="dj-faint">·</span>
          <Flag iso={job.iso} title={job.country} />
          <span className="truncate">{job.place ?? 'Location not listed'}</span>
        </div>
      </div>
      <DaysChip job={job} />
      <Tip label={saved ? 'Saved on this device. Remove' : 'Save on this device'}>
        <button
          type="button"
          className="dj-icon-btn"
          data-active={saved}
          style={{ width: 28, height: 28, border: saved ? undefined : 'none', background: saved ? undefined : 'transparent' }}
          aria-label={saved ? 'Remove from saved' : 'Save job'}
          aria-pressed={saved}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSave();
          }}
        >
          <Bookmark size={14} strokeWidth={1.8} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </Tip>
    </div>
  );
}

function JobDetail({
  job,
  saved,
  sameOrg,
  sameCountry,
  onToggleSave,
  onClose,
  onPickOrg,
  onPickCountry,
  onToast,
}: {
  job: Job;
  saved: boolean;
  sameOrg: number;
  sameCountry: number;
  onToggleSave: () => void;
  onClose: () => void;
  onPickOrg: () => void;
  onPickCountry: () => void;
  onToast: (msg: string) => void;
}) {
  const org = displayOrg(job.org);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: job.title, text: `${job.title} at ${org}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      onToast('Link copied');
    } catch {
      /* share sheet dismissed */
    }
  };
  const calendar = () => {
    const blob = new Blob([icsFor(job)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `deadline-${job.id.slice(0, 8)}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
    onToast('Calendar file downloaded');
  };
  const mailto = `mailto:?subject=${encodeURIComponent(`${job.title} – ${org}`)}&body=${encodeURIComponent(
    `${job.title}\n${org}${job.place ? `, ${job.place}` : ''}\n${job.deadline ? `Deadline: ${formatDate(job.deadline)}\n` : ''}Apply: ${job.apply_url}\n`,
  )}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <OrgMark name={job.org} />
        <span className="dj-muted min-w-0 flex-1 truncate">{org}</span>
        <Tip label="Close" side="bottom">
          <button type="button" className="dj-icon-btn" onClick={onClose} aria-label="Close job">
            <X size={15} strokeWidth={1.8} />
          </button>
        </Tip>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 650, lineHeight: 1.35, margin: 0 }}>{job.title}</h2>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <MapPin size={14} strokeWidth={1.8} className="dj-faint" />
          <Flag iso={job.iso} title={job.country} />
          <span>{job.place ?? `Location on the ${org} vacancy page`}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock size={14} strokeWidth={1.8} className="dj-faint" />
          {job.deadline ? (
            <>
              <span>Closes {formatLongDate(job.deadline)}</span>
              <DaysChip job={job} />
            </>
          ) : (
            <span className="dj-muted">No deadline listed</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a className="dj-ink-btn" href={job.apply_url} target="_blank" rel="noopener noreferrer">
          Apply on {org}
          <ExternalLink size={13} strokeWidth={2} />
        </a>
        <Tip label={saved ? 'Saved on this device. Remove' : 'Save on this device'}>
          <button type="button" className="dj-icon-btn" data-active={saved} onClick={onToggleSave} aria-label={saved ? 'Remove from saved' : 'Save job'} aria-pressed={saved}>
            <Bookmark size={15} strokeWidth={1.8} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </Tip>
        <Tip label="Share: WhatsApp, LinkedIn, email, or copy link">
          <button type="button" className="dj-icon-btn" onClick={share} aria-label="Share job">
            <Share2 size={15} strokeWidth={1.8} />
          </button>
        </Tip>
        {job.deadline && (
          <Tip label="Add deadline to calendar, reminder 2 days before">
            <button type="button" className="dj-icon-btn" onClick={calendar} aria-label="Add deadline to calendar">
              <CalendarPlus size={15} strokeWidth={1.8} />
            </button>
          </Tip>
        )}
        <Tip label="Email this job to myself">
          <a className="dj-icon-btn" href={mailto} aria-label="Email this job">
            <Mail size={15} strokeWidth={1.8} />
          </a>
        </Tip>
      </div>

      <div className="dj-card dj-muted" style={{ borderStyle: 'dashed', borderRadius: 16, padding: 12 }}>
        Demo note: the role summary and full description appear here once the crawler stores descriptions (UX-23).
      </div>

      <div className="flex flex-col gap-1.5">
        {sameOrg > 0 && (
          <button type="button" className="dj-option" onClick={onPickOrg}>
            <OrgMark name={job.org} size={18} />
            <span className="flex-1">More from {org}</span>
            <span className="dj-faint">{sameOrg}</span>
          </button>
        )}
        {sameCountry > 0 && job.country && (
          <button type="button" className="dj-option" onClick={onPickCountry}>
            <Flag iso={job.iso} title={job.country} />
            <span className="flex-1">More in {job.country}</span>
            <span className="dj-faint">{sameCountry}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function ClosingThisWeek({ jobs, onOpen }: { jobs: Job[]; onOpen: (id: string) => void }) {
  const week = sortByDeadline(jobs.filter((j) => j.daysLeft !== null && j.daysLeft <= 7));
  const groups = new Map<string, Job[]>();
  for (const j of week) {
    const k = j.deadline as string;
    groups.set(k, [...(groups.get(k) ?? []), j]);
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="dj-title" style={{ fontSize: 15, margin: 0 }}>
          Closing this week
        </h2>
        <span className="dj-chip" data-tone="sage">
          {week.length} roles
        </span>
      </div>
      {week.length === 0 && <p className="dj-muted">No deadlines in the next 7 days.</p>}
      {[...groups.entries()].map(([date, list]) => {
        const d = list[0].daysLeft as number;
        return (
          <div key={date} className="flex gap-3">
            <div className="w-[64px] shrink-0 pt-1">
              <div style={{ fontWeight: 600 }}>{formatLongDate(date).split(' ').slice(0, 3).join(' ')}</div>
              <div className="dj-faint">{d === 0 ? 'today' : `in ${d}d`}</div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 border-l pl-3 dj-hair">
              {list.map((j) => (
                <button key={j.id} type="button" className="dj-option" onClick={() => onOpen(j.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ fontWeight: 560 }}>
                      {j.title}
                    </span>
                    <span className="dj-muted flex items-center gap-1.5">
                      {displayOrg(j.org)}
                      {j.iso && <Flag iso={j.iso} title={j.country} />}
                      <span className="truncate">{j.country ?? ''}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PublicDemo({ rawJobs, snapshotDate }: { rawJobs: RawJob[]; snapshotDate: string }) {
  const jobs = useMemo(() => normaliseJobs(rawJobs).filter(isOpen), [rawJobs]);

  const [view, setView] = useState<View>('all');
  const [org, setOrg] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<DeadlineFilter | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverKey | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreCountries, setMoreCountries] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saved, setSaved] = usePersistentState<string[]>('aidjobs.demo.saved', []);
  const [collapsed, setCollapsed] = usePersistentState<boolean>('aidjobs.demo.menuCollapsed', false);
  const [split, setSplit] = usePersistentState<number>('aidjobs.demo.split', 52);
  const [dragging, setDragging] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);

  const syncFromUrl = useCallback(() => {
    const id = new URLSearchParams(window.location.search).get('job');
    setSelectedId(id);
  }, []);

  useEffect(() => {
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [syncFromUrl]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!popover) return;
    const close = (e: MouseEvent) => {
      if (pillsRef.current && !pillsRef.current.contains(e.target as Node)) setPopover(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [popover]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const box = mainRef.current?.getBoundingClientRect();
      if (!box) return;
      setSplit(Math.min(70, Math.max(34, ((e.clientX - box.left) / box.width) * 100)));
    };
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, setSplit]);

  const openJob = (id: string) => {
    setSelectedId(id);
    window.history.pushState({}, '', `${window.location.pathname}?job=${id}`);
  };
  const closeJob = () => {
    setSelectedId(null);
    window.history.pushState({}, '', window.location.pathname);
  };
  const toggleSave = (id: string) => {
    const next = saved.includes(id) ? saved.filter((s) => s !== id) : [...saved, id];
    setSaved(next);
    setToast(saved.includes(id) ? 'Removed from saved' : 'Saved on this device');
  };

  const matches = (j: Job, skip?: PopoverKey) =>
    (view !== 'saved' || saved.includes(j.id)) &&
    (view !== 'closing' || (j.daysLeft !== null && j.daysLeft <= 7)) &&
    (skip === 'org' || !org || j.org === org) &&
    (skip === 'country' || !country || j.iso === country) &&
    (skip === 'deadline' || matchesDeadline(j, deadline)) &&
    matchesText(j, query);

  const list = sortByDeadline(jobs.filter((j) => matches(j)));
  const selected = jobs.find((j) => j.id === selectedId) ?? null;
  const closingCount = jobs.filter((j) => j.daysLeft !== null && j.daysLeft <= 7).length;
  const orgCounts = countBy(jobs, (j) => j.org);
  const countryCounts = countBy(jobs, (j) => j.iso);
  const orgOptions = countBy(jobs.filter((j) => matches(j, 'org')), (j) => j.org).map(([k, n]) => ({
    key: k,
    label: displayOrg(k),
    count: n,
    lead: <OrgMark name={k} size={18} />,
  }));
  const countryOptions = countBy(jobs.filter((j) => matches(j, 'country')), (j) => j.iso).map(([k, n]) => ({
    key: k,
    label: countryName(k) ?? k,
    count: n,
    lead: <Flag iso={k} title={countryName(k)} />,
  }));
  const deadlinePool = jobs.filter((j) => matches(j, 'deadline'));
  const deadlineOptions = (Object.keys(DEADLINE_LABELS) as DeadlineFilter[])
    .map((k) => ({ key: k, label: DEADLINE_LABELS[k], count: deadlinePool.filter((j) => matchesDeadline(j, k)).length }))
    .filter((o) => o.count > 0);

  const anyFilter = !!(org || country || deadline || query || view !== 'all');
  const clearAll = () => {
    setOrg(null);
    setCountry(null);
    setDeadline(null);
    setQuery('');
    setView('all');
  };

  const primary: MenuEntry[] = [
    { key: 'all', label: 'Jobs', icon: <Briefcase size={15} strokeWidth={1.8} />, count: jobs.length, active: view === 'all' && !org && !country, onSelect: clearAll },
    { key: 'closing', label: 'Closing soon', icon: <Clock size={15} strokeWidth={1.8} />, count: closingCount, active: view === 'closing', onSelect: () => setView(view === 'closing' ? 'all' : 'closing') },
    { key: 'saved', label: 'Saved', icon: <Bookmark size={15} strokeWidth={1.8} />, count: saved.length, active: view === 'saved', onSelect: () => setView(view === 'saved' ? 'all' : 'saved') },
  ];
  const shownCountries = moreCountries ? countryCounts : countryCounts.slice(0, 8);
  const sections: MenuSection[] = [
    {
      title: 'Organisations',
      entries: orgCounts.map(([k, n]) => ({
        key: `org-${k}`,
        label: displayOrg(k),
        icon: <OrgMark name={k} size={16} />,
        count: n,
        active: org === k,
        onSelect: () => setOrg(org === k ? null : k),
      })),
    },
    {
      title: 'Countries',
      entries: shownCountries.map(([k, n]) => ({
        key: `c-${k}`,
        label: countryName(k) ?? k,
        icon: <Flag iso={k} title={countryName(k)} />,
        count: n,
        active: country === k,
        onSelect: () => setCountry(country === k ? null : k),
      })),
      footer:
        countryCounts.length > 8 ? (
          <button type="button" className="dj-nav dj-faint" onClick={() => setMoreCountries(!moreCountries)}>
            <span className="w-4" />
            {moreCountries ? 'Fewer countries' : `All ${countryCounts.length} countries`}
          </button>
        ) : undefined,
    },
    {
      title: 'Demo',
      entries: [
        { key: 'admin', label: 'Admin demo', icon: <LayoutDashboard size={15} strokeWidth={1.8} />, href: '/demo/admin' },
        { key: 'tokens', label: 'Design tokens', icon: <Palette size={15} strokeWidth={1.8} />, href: '/demo/tokens' },
      ],
    },
  ];

  const pills = (
    <div ref={pillsRef} className="dj-no-scrollbar flex items-center gap-2 overflow-x-auto pb-1 lg:overflow-visible">
      <FilterPill
        label="Organisation"
        icon={<Briefcase size={13} strokeWidth={1.8} />}
        value={org ? displayOrg(org) : null}
        open={popover === 'org'}
        onOpen={() => setPopover(popover === 'org' ? null : 'org')}
        onClear={() => setOrg(null)}
      >
        <OptionList
          options={orgOptions}
          selected={org}
          searchable
          placeholder="Find an organisation"
          onPick={(k) => {
            setOrg(k === org ? null : k);
            setPopover(null);
          }}
        />
      </FilterPill>
      <FilterPill
        label="Country"
        icon={<MapPin size={13} strokeWidth={1.8} />}
        value={country ? countryName(country) : null}
        open={popover === 'country'}
        onOpen={() => setPopover(popover === 'country' ? null : 'country')}
        onClear={() => setCountry(null)}
      >
        <OptionList
          options={countryOptions}
          selected={country}
          searchable
          placeholder="Find a country"
          onPick={(k) => {
            setCountry(k === country ? null : k);
            setPopover(null);
          }}
        />
      </FilterPill>
      <FilterPill
        label="Deadline"
        icon={<Clock size={13} strokeWidth={1.8} />}
        value={deadline ? DEADLINE_LABELS[deadline] : null}
        open={popover === 'deadline'}
        onOpen={() => setPopover(popover === 'deadline' ? null : 'deadline')}
        onClear={() => setDeadline(null)}
      >
        <OptionList
          options={deadlineOptions}
          selected={deadline}
          onPick={(k) => {
            setDeadline(k === deadline ? null : (k as DeadlineFilter));
            setPopover(null);
          }}
        />
      </FilterPill>
      {anyFilter && (
        <button type="button" className="dj-pill shrink-0" style={{ border: 'none', background: 'transparent' }} onClick={clearAll}>
          Clear
        </button>
      )}
    </div>
  );

  const searchBox = (
    <div className="relative min-w-0 flex-1">
      <Search size={14} strokeWidth={1.8} className="dj-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
      <input className="dj-input" placeholder="Search roles, organisations, places" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search jobs" />
      {query && (
        <button type="button" className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 dj-faint" style={{ border: 'none', background: 'transparent' }} onClick={() => setQuery('')} aria-label="Clear search">
          <X size={14} />
        </button>
      )}
    </div>
  );

  const sameOrg = selected ? jobs.filter((j) => j.org === selected.org && j.id !== selected.id).length : 0;
  const sameCountry = selected?.iso ? jobs.filter((j) => j.iso === selected.iso && j.id !== selected.id).length : 0;
  const detail = selected ? (
    <JobDetail
      job={selected}
      saved={saved.includes(selected.id)}
      sameOrg={sameOrg}
      sameCountry={sameCountry}
      onToggleSave={() => toggleSave(selected.id)}
      onClose={closeJob}
      onPickOrg={() => {
        setOrg(selected.org);
        closeJob();
      }}
      onPickCountry={() => {
        setCountry(selected.iso);
        closeJob();
      }}
      onToast={setToast}
    />
  ) : null;

  const heading = view === 'saved' ? 'Saved jobs' : view === 'closing' ? 'Closing within 7 days' : 'NGO, humanitarian and development jobs';

  return (
    <div className="flex h-full">
      <SideMenu
        primary={primary}
        sections={sections}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
        drawerOpen={drawerOpen}
        onCloseDrawer={() => setDrawerOpen(false)}
        homeHref="/demo"
        tag="demo"
      />

      <div ref={mainRef} className="flex min-w-0 flex-1" style={{ ['--split' as string]: `${split}%` }}>
        <section className="flex h-full w-full min-w-0 shrink-0 flex-col lg:w-[var(--split)]" aria-label="Jobs">
          <div className="shrink-0 px-4 pb-2 pt-5 lg:px-6 lg:pt-6">
            <h1 className="dj-display" style={{ margin: 0 }}>
              {heading}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="dj-chip" data-tone="sage">
                {list.length} {list.length === 1 ? 'role' : 'roles'}
              </span>
              <span className="dj-chip">{closingCount} closing this week</span>
              <span className="dj-chip">{orgCounts.length} organisations</span>
              <span className="dj-chip">{countryCounts.length} countries</span>
              <Tip label={`Fixed copy of the public jobs taken on ${snapshotDate}`}>
                <span className="dj-chip">Demo data · {snapshotDate}</span>
              </Tip>
            </div>
            <div className="mt-4 hidden items-center gap-2 lg:flex">{searchBox}</div>
            <div className="mt-3">{pills}</div>
          </div>
          <div className="dj-scroll flex-1 px-2 pb-28 lg:px-4 lg:pb-4">
            {list.map((j) => (
              <JobRow key={j.id} job={j} active={j.id === selectedId} saved={saved.includes(j.id)} onOpen={() => openJob(j.id)} onToggleSave={() => toggleSave(j.id)} />
            ))}
            {list.length === 0 && (
              <div className="flex flex-col items-start gap-2 px-3 py-8">
                <span className="dj-title">No jobs match</span>
                <span className="dj-muted">{view === 'saved' ? 'Save a job with the bookmark and it appears here.' : 'Try fewer filters.'}</span>
                {anyFilter && (
                  <button type="button" className="dj-pill" onClick={clearAll}>
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <div
          className="dj-divider hidden lg:block"
          data-dragging={dragging}
          onPointerDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panes"
          title="Drag to resize"
        />
        <aside className="dj-scroll hidden h-full min-w-0 flex-1 lg:block" style={{ padding: 24 }} aria-label="Job">
          <div className="dj-card" style={{ padding: 20 }}>
            {detail ?? <ClosingThisWeek jobs={jobs} onOpen={openJob} />}
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 lg:hidden" style={{ background: 'linear-gradient(to top, var(--page) 70%, transparent)' }}>
        <div className="dj-card flex items-center gap-2 p-1.5" style={{ borderRadius: 999 }}>
          <Tip label="Menu">
            <button type="button" className="dj-icon-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <Menu size={16} strokeWidth={1.8} />
            </button>
          </Tip>
          {searchBox}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end lg:hidden">
          <div className="flex-1" style={{ background: 'var(--scrim)' }} onClick={closeJob} aria-hidden />
          <div className="dj-sheet dj-scroll max-h-[86vh] px-5 pb-8" role="dialog" aria-modal="true" aria-label={selected.title}>
            <div className="dj-grabber" />
            {detail}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 lg:bottom-6" role="status">
          <span className="dj-chip" style={{ background: 'var(--ink)', color: 'var(--on-ink)', height: 30, padding: '0 14px', fontSize: 12 }}>
            {toast}
          </span>
        </div>
      )}
    </div>
  );
}
