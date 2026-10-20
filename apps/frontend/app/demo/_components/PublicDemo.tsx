'use client';

import {
  Bookmark,
  Briefcase,
  BriefcaseBusiness,
  CalendarPlus,
  Check,
  CircleCheck,
  ChevronDown,
  Clock,
  ExternalLink,
  FileSignature,
  GraduationCap,
  Hourglass,
  House,
  Languages,
  LayoutDashboard,
  Mail,
  MapPin,
  Menu,
  Palette,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  Timer,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import DayStrip, { type DayGroup } from './DayStrip';
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
  recommendedOrder,
  sortByDeadline,
  OLD_DAYS,
  SOON_DAYS,
  STALE_DAYS,
  type DeadlineFilter,
  type Job,
  type RawJob,
} from '../_lib/jobs';
import { CONTRACT_HINT, factsOf, gradeHint, type Contract, type Facts, type Language, type OpenTo } from '../_lib/facts';

type JobF = Job & { facts: Facts };
type View = 'all' | 'saved' | 'applied';
type PopoverKey = 'org' | 'country' | 'deadline';

const FACTS_HINT = 'Read from job titles. Today mostly UNICEF titles carry this, so some jobs are not counted.';

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
  const tone = d <= 3 ? 'red' : d <= SOON_DAYS ? 'amber' : undefined;
  const text = d === 0 ? 'Today' : `${d}d`;
  return (
    <Tip label={`Closes ${formatLongDate(job.deadline)}${d === 0 ? ', today' : `, in ${d} day${d === 1 ? '' : 's'}`}`}>
      <span className="dj-chip" data-tone={tone} tabIndex={0}>
        <Clock size={11} strokeWidth={2} />
        {text}
      </span>
    </Tip>
  );
}

function seenLabel(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function Freshness({ job }: { job: Job }) {
  if (job.seenDaysAgo === null) return null;
  const org = displayOrg(job.org);
  const when = formatDate(job.last_seen_at ?? null);
  if (job.seenDaysAgo > OLD_DAYS) {
    return (
      <div className="flex items-start gap-2" style={{ color: 'var(--amber)' }}>
        <TriangleAlert size={14} strokeWidth={1.8} style={{ marginTop: 1, flexShrink: 0 }} />
        <span>
          Not found on the {org} site since {when}. It may have closed.
        </span>
      </div>
    );
  }
  if (job.seenDaysAgo > STALE_DAYS) {
    return (
      <Tip label={`AidJobs has not found this job on the ${org} site since ${when}. Check the deadline before applying.`}>
        <span className="dj-muted flex items-center gap-2" tabIndex={0}>
          <RefreshCw size={14} strokeWidth={1.8} style={{ color: 'var(--amber)' }} />
          <span>
            Last confirmed on the {org} site on {when}
          </span>
        </span>
      </Tip>
    );
  }
  return (
    <Tip label={`AidJobs last found this job on the ${org} site on ${when}`}>
      <span className="flex items-center gap-2" tabIndex={0}>
        <RefreshCw size={14} strokeWidth={1.8} style={{ color: 'var(--sage-7)' }} />
        <span>
          Checked on the {org} site {seenLabel(job.seenDaysAgo)}
        </span>
      </span>
    </Tip>
  );
}

const COMMON_WORDS = new Set(
  'officer consultant consultancy specialist national international position temporary fixed term months month days programme program unicef assistant associate support senior with from based remote office open only candidates nationals for and the des pour'.split(
    ' ',
  ),
);

function keyWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[^a-zà-ÿ&]+/)
      .filter((w) => w.length > 3 && !COMMON_WORDS.has(w)),
  );
}

type Similar = { job: JobF; why: string };

/** Up to four open jobs that share the most with this one, at most two per organisation. Each says why. */
function similarJobs(job: JobF, all: JobF[]): Similar[] {
  const words = keyWords(job.title);
  const scored = all
    .filter((j) => j.id !== job.id && (j.seenDaysAgo === null || j.seenDaysAgo <= OLD_DAYS))
    .map((j) => {
      const reasons: string[] = [];
      let score = 0;
      let content = 0;
      for (const s of j.facts.sdgs) {
        if (job.facts.sdgs.some((x) => x.goal === s.goal)) {
          score += 3;
          content += 1;
          reasons.push(`SDG ${s.goal}`);
        }
      }
      const shared = [...keyWords(j.title)].filter((w) => words.has(w)).slice(0, 3);
      if (shared.length) {
        score += shared.length;
        content += shared.length;
        reasons.push(`"${shared.join(', ')}"`);
      }
      if (content === 0) return { job: j, score: 0, why: '' };
      if (job.facts.contract && j.facts.contract === job.facts.contract) {
        score += 2;
        reasons.push(j.facts.contract);
      }
      if (job.iso && j.iso === job.iso && j.country) {
        score += 2;
        reasons.push(j.country);
      }
      if (job.facts.openTo && j.facts.openTo === job.facts.openTo) score += 1;
      if (job.facts.remote && j.facts.remote) {
        score += 1;
        reasons.push('Remote');
      }
      return { job: j, score, why: reasons.join(' · ') };
    })
    .filter((s) => s.score >= 3 && s.why)
    .sort((a, b) => b.score - a.score || (a.job.daysLeft ?? 999) - (b.job.daysLeft ?? 999));
  const perOrg = new Map<string, number>();
  const out: Similar[] = [];
  for (const s of scored) {
    const n = perOrg.get(s.job.org) ?? 0;
    if (n >= 2) continue;
    perOrg.set(s.job.org, n + 1);
    out.push({ job: s.job, why: s.why });
    if (out.length === 4) break;
  }
  return out;
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

function JobRow({
  job,
  active,
  saved,
  applied,
  onOpen,
  onToggleSave,
}: {
  job: JobF;
  active: boolean;
  saved: boolean;
  applied: boolean;
  onOpen: () => void;
  onToggleSave: () => void;
}) {
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
          <span className="min-w-0 truncate">{job.country ?? job.place ?? 'Location not listed'}</span>
          {job.facts.contract && (
            <>
              <span className="dj-faint">·</span>
              <span className="shrink-0">{job.facts.contract}</span>
            </>
          )}
          {job.facts.sdgs.slice(0, 1).map((s) => (
            <Tip key={s.goal} label={`SDG ${s.goal}: ${s.name}${job.facts.sdgs.length > 1 ? ` (and ${job.facts.sdgs.length - 1} more)` : ''}, read from the job title`}>
              <span className="dj-sdg" tabIndex={0}>
                <span className="dj-sdg-dot" style={{ background: s.colour }} aria-hidden />
                SDG {s.goal}
              </span>
            </Tip>
          ))}
        </div>
      </div>
      {job.seenDaysAgo !== null && job.seenDaysAgo > OLD_DAYS && (
        <Tip label={`Not found on the ${displayOrg(job.org)} site since ${formatDate(job.last_seen_at ?? null)}. It may have closed.`}>
          <span className="inline-flex" tabIndex={0} style={{ color: 'var(--amber)' }} aria-label="Not seen recently on the employer site">
            <TriangleAlert size={14} strokeWidth={1.8} />
          </span>
        </Tip>
      )}
      {applied && (
        <Tip label="You marked this as applied">
          <span className="dj-chip" data-tone="sage" tabIndex={0}>
            <CircleCheck size={11} strokeWidth={2} />
            Applied
          </span>
        </Tip>
      )}
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

function FactChip({ icon, label, hint }: { icon: ReactNode; label: string; hint: string }) {
  return (
    <Tip label={hint}>
      <span className="dj-chip" style={{ height: 26, fontSize: 12 }} tabIndex={0}>
        {icon}
        {label}
      </span>
    </Tip>
  );
}

function JobDetail({
  job,
  saved,
  applied,
  sameOrg,
  sameCountry,
  similar,
  onOpenJob,
  onToggleSave,
  onToggleApplied,
  onClose,
  onPickOrg,
  onPickCountry,
  onToast,
}: {
  job: JobF;
  saved: boolean;
  applied: boolean;
  sameOrg: number;
  sameCountry: number;
  similar: Similar[];
  onOpenJob: (id: string) => void;
  onToggleSave: () => void;
  onToggleApplied: () => void;
  onClose: () => void;
  onPickOrg: () => void;
  onPickCountry: () => void;
  onToast: (msg: string) => void;
}) {
  const org = displayOrg(job.org);
  const f = job.facts;
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
  const hasFacts = f.sdgs.length > 0 || f.contract || f.grade || f.duration || f.openTo || f.remote || f.language !== 'English';

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
        <Freshness job={job} />
      </div>

      {hasFacts && (
        <div className="flex flex-wrap gap-1.5">
          {f.sdgs.map((s) => (
            <FactChip
              key={s.goal}
              icon={<span className="dj-sdg-dot" style={{ background: s.colour }} aria-hidden />}
              label={`SDG ${s.goal} · ${s.name}`}
              hint="Sustainable Development Goal, read from the job title"
            />
          ))}
          {f.contract && <FactChip icon={<FileSignature size={12} />} label={f.contract} hint={CONTRACT_HINT[f.contract]} />}
          {f.grade && <FactChip icon={<ShieldCheck size={12} />} label={f.grade} hint={gradeHint(f.grade)} />}
          {f.duration && <FactChip icon={<Hourglass size={12} />} label={f.duration} hint="Contract length, read from the title" />}
          {f.openTo && (
            <FactChip
              icon={<Users size={12} />}
              label={f.openTo === 'Nationals' ? 'Nationals' : 'International'}
              hint={f.openTo === 'Nationals' ? 'Open to nationals of the duty-station country' : 'Open to international candidates'}
            />
          )}
          {f.remote && <FactChip icon={<House size={12} />} label="Remote" hint="Remote or home-based, read from the title" />}
          {f.language !== 'English' && <FactChip icon={<Languages size={12} />} label={f.language} hint={`Advert written in ${f.language}`} />}
        </div>
      )}

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
        <Tip label={applied ? 'Marked as applied. Undo' : 'I applied: track it under Applied'}>
          <button type="button" className="dj-icon-btn" data-active={applied} onClick={onToggleApplied} aria-label={applied ? 'Unmark applied' : 'Mark as applied'} aria-pressed={applied}>
            <CircleCheck size={15} strokeWidth={1.8} />
          </button>
        </Tip>
        {job.deadline && (
          <Tip label="Add the deadline to my calendar, reminder 2 days before">
            <button type="button" className="dj-icon-btn" onClick={calendar} aria-label="Add deadline to calendar">
              <CalendarPlus size={15} strokeWidth={1.8} />
            </button>
          </Tip>
        )}
        <Tip label="Share: WhatsApp, LinkedIn, email, or copy link">
          <button type="button" className="dj-icon-btn" onClick={share} aria-label="Share job">
            <Share2 size={15} strokeWidth={1.8} />
          </button>
        </Tip>
        <Tip label="Email this job to myself">
          <a className="dj-icon-btn" href={mailto} aria-label="Email this job">
            <Mail size={15} strokeWidth={1.8} />
          </a>
        </Tip>
      </div>

      <div className="dj-card dj-muted" style={{ borderStyle: 'dashed', borderRadius: 16, padding: 12 }}>
        Demo note: the role summary and full description appear here once the crawler stores descriptions (UX-23).
      </div>

      {similar.length > 0 && (
        <section className="flex flex-col gap-1" aria-label="Similar jobs">
          <div className="dj-section-label" style={{ padding: '2px 0 4px' }}>
            Similar jobs
          </div>
          {similar.map((s) => (
            <button key={s.job.id} type="button" className="dj-option" onClick={() => onOpenJob(s.job.id)}>
              <OrgMark name={s.job.org} size={18} />
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontWeight: 560 }}>
                  {s.job.title}
                </span>
                <span className="dj-muted block truncate">
                  {displayOrg(s.job.org)}
                  {s.job.country ? ` · ${s.job.country}` : ''}
                </span>
                <span className="dj-faint block truncate">Shared: {s.why}</span>
              </span>
              <DaysChip job={s.job} />
            </button>
          ))}
        </section>
      )}

      <div className="flex flex-col gap-1">
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

function dayLabel(d: number): string {
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return `In ${d} days`;
}

function dayGroups(soon: Job[]): DayGroup[] {
  const m = new Map<string, DayGroup>();
  for (const j of soon) {
    if (!j.deadline || j.daysLeft === null) continue;
    const g = m.get(j.deadline) ?? { date: j.deadline, count: 0, daysLeft: j.daysLeft };
    g.count += 1;
    m.set(j.deadline, g);
  }
  return [...m.values()].sort((a, b) => a.daysLeft - b.daysLeft);
}

function ClosingSoon({ jobs, onOpen }: { jobs: JobF[]; onOpen: (id: string) => void }) {
  const soon = sortByDeadline(jobs.filter((j) => j.daysLeft !== null && j.daysLeft <= SOON_DAYS));
  const [picked, setPicked] = useState<string | null>(null);
  const groups = new Map<string, JobF[]>();
  for (const j of soon) {
    const k = j.deadline as string;
    groups.set(k, [...(groups.get(k) ?? []), j]);
  }
  const firstDay = soon[0]?.deadline ?? null;
  const day = picked && groups.has(picked) ? picked : firstDay;
  const shown = [...groups.entries()].filter(([date]) => date === day).map(([date, list]) => [date, recommendedOrder(list)] as [string, JobF[]]);
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="dj-title" style={{ fontSize: 15, margin: 0 }}>
          Closing in the next {SOON_DAYS} days
        </h2>
        <span className="dj-chip" data-tone="sage">
          {soon.length} roles
        </span>
      </div>
      {soon.length === 0 && <p className="dj-muted">No deadlines in the next {SOON_DAYS} days.</p>}
      {soon.length > 0 && (
        <DayStrip groups={dayGroups(soon)} value={day} onChange={(d) => setPicked(d ?? firstDay)} />
      )}
      {shown.map(([date, list]) => {
        const d = list[0].daysLeft as number;
        return (
          <section key={date} aria-label={`${dayLabel(d)}, ${formatLongDate(date)}`}>
            <div className="sticky top-0 z-10 flex items-center gap-2 py-2" style={{ background: 'var(--surface)' }}>
              <span style={{ fontWeight: 650 }}>{dayLabel(d)}</span>
              <span className="dj-faint">{formatLongDate(date)}</span>
              <span className="ml-auto dj-chip" data-tone={d <= 3 ? 'red' : 'amber'}>
                {list.length}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 pb-2">
              {list.map((j) => (
                <button key={j.id} type="button" className="dj-option" onClick={() => onOpen(j.id)}>
                  <OrgMark name={j.org} size={18} />
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
          </section>
        );
      })}
    </div>
  );
}

const CONTRACT_ICONS: Record<Contract, ReactNode> = {
  Consultancy: <BriefcaseBusiness size={15} strokeWidth={1.8} />,
  'Fixed term': <FileSignature size={15} strokeWidth={1.8} />,
  Temporary: <Timer size={15} strokeWidth={1.8} />,
  Internship: <GraduationCap size={15} strokeWidth={1.8} />,
  Fellowship: <GraduationCap size={15} strokeWidth={1.8} />,
};

export default function PublicDemo({ rawJobs, snapshotDate }: { rawJobs: RawJob[]; snapshotDate: string }) {
  const jobs = useMemo<JobF[]>(() => normaliseJobs(rawJobs).filter(isOpen).map((j) => ({ ...j, facts: factsOf(j.title) })), [rawJobs]);

  const [view, setView] = useState<View>('all');
  const [org, setOrg] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<DeadlineFilter | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [openTo, setOpenTo] = useState<OpenTo | null>(null);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [language, setLanguage] = useState<Language | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [sort, setSort] = usePersistentState<'recommended' | 'closing'>('aidjobs.demo.sort', 'recommended');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverKey | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saved, setSaved] = usePersistentState<string[]>('aidjobs.demo.saved', []);
  const [applied, setApplied] = usePersistentState<string[]>('aidjobs.demo.applied', []);
  const [collapsed, setCollapsed] = usePersistentState<boolean>('aidjobs.demo.menuCollapsed', false);
  const [split, setSplit] = usePersistentState<number>('aidjobs.demo.split2', 56);
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
      setSplit(Math.min(68, Math.max(42, ((e.clientX - box.left) / box.width) * 100)));
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
  const toggleIn = (list: string[], set: (v: string[]) => void, id: string, added: string, removed: string) => {
    const has = list.includes(id);
    set(has ? list.filter((s) => s !== id) : [...list, id]);
    setToast(has ? removed : added);
  };
  const toggleSave = (id: string) => toggleIn(saved, setSaved, id, 'Saved on this device', 'Removed from saved');
  const toggleApplied = (id: string) => toggleIn(applied, setApplied, id, 'Marked as applied', 'Unmarked');

  type Skip = PopoverKey | 'contract' | 'openTo' | 'remote' | 'language' | 'day';
  const matches = (j: JobF, skip?: Skip) =>
    (view !== 'saved' || saved.includes(j.id)) &&
    (view !== 'applied' || applied.includes(j.id)) &&
    (skip === 'org' || !org || j.org === org) &&
    (skip === 'country' || !country || j.iso === country) &&
    (skip === 'deadline' || matchesDeadline(j, deadline)) &&
    (skip === 'contract' || !contract || j.facts.contract === contract) &&
    (skip === 'openTo' || !openTo || j.facts.openTo === openTo) &&
    (skip === 'remote' || !remoteOnly || j.facts.remote) &&
    (skip === 'language' || !language || j.facts.language === language) &&
    (skip === 'day' || !day || j.deadline === day) &&
    matchesText(j, query);

  const filtered = jobs.filter((j) => matches(j));
  const list = sort === 'recommended' ? recommendedOrder(filtered) : sortByDeadline(filtered);
  const selected = jobs.find((j) => j.id === selectedId) ?? null;
  const closingCount = jobs.filter((j) => j.daysLeft !== null && j.daysLeft <= SOON_DAYS).length;

  const orgOptions = countBy(jobs.filter((j) => matches(j, 'org')), (j) => j.org).map(([k, n]) => ({ key: k, label: displayOrg(k), count: n, lead: <OrgMark name={k} size={18} /> }));
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

  const anyFilter = !!(org || country || deadline || contract || openTo || remoteOnly || language || day || query || view !== 'all');
  const clearAll = () => {
    setDay(null);
    setOrg(null);
    setCountry(null);
    setDeadline(null);
    setContract(null);
    setOpenTo(null);
    setRemoteOnly(false);
    setLanguage(null);
    setQuery('');
    setView('all');
  };

  const contractCounts = countBy(jobs.filter((j) => matches(j, 'contract')), (j) => j.facts.contract);
  const openToCounts = countBy(jobs.filter((j) => matches(j, 'openTo')), (j) => j.facts.openTo);
  const remoteCount = jobs.filter((j) => matches(j, 'remote') && j.facts.remote).length;
  const languageCounts = countBy(jobs.filter((j) => matches(j, 'language')), (j) => (j.facts.language === 'English' ? null : j.facts.language));
  const inSaved = view === 'saved' || view === 'applied';

  const primary: MenuEntry[] = [
    { key: 'all', label: 'All jobs', icon: <Briefcase size={15} strokeWidth={1.8} />, count: jobs.length, active: view === 'all' && !anyFilter, onSelect: clearAll },
    { key: 'saved', label: 'Saved', icon: <Bookmark size={15} strokeWidth={1.8} />, count: saved.length, active: inSaved, onSelect: () => setView(inSaved ? 'all' : 'saved') },
  ];
  const sections: MenuSection[] = [
    {
      title: 'Contract',
      icon: <FileSignature size={12} strokeWidth={2} />,
      hint: FACTS_HINT,
      entries: contractCounts.map(([k, n]) => ({
        key: `c-${k}`,
        label: k === 'Consultancy' ? 'Consultancies' : k === 'Internship' ? 'Internships' : k === 'Fellowship' ? 'Fellowships' : k,
        icon: CONTRACT_ICONS[k as Contract],
        count: n,
        active: contract === k,
        onSelect: () => setContract(contract === k ? null : (k as Contract)),
      })),
    },
    {
      title: 'Open to',
      icon: <Users size={12} strokeWidth={2} />,
      hint: `${FACTS_HINT} UN National Officer and General Service grades count as nationals.`,
      entries: openToCounts.map(([k, n]) => ({
        key: `o-${k}`,
        label: k === 'Nationals' ? 'Nationals of the country' : 'International candidates',
        icon: <Users size={15} strokeWidth={1.8} />,
        count: n,
        active: openTo === k,
        onSelect: () => setOpenTo(openTo === k ? null : (k as OpenTo)),
      })),
    },
    {
      title: 'Work style',
      icon: <House size={12} strokeWidth={2} />,
      hint: FACTS_HINT,
      entries:
        remoteCount > 0
          ? [{ key: 'remote', label: 'Remote or home-based', icon: <House size={15} strokeWidth={1.8} />, count: remoteCount, active: remoteOnly, onSelect: () => setRemoteOnly(!remoteOnly) }]
          : [],
    },
    {
      title: 'Advert language',
      icon: <Languages size={12} strokeWidth={2} />,
      hint: 'Adverts written in a language other than English, detected from the title.',
      entries: languageCounts.map(([k, n]) => ({
        key: `l-${k}`,
        label: k,
        icon: <Languages size={15} strokeWidth={1.8} />,
        count: n,
        active: language === k,
        onSelect: () => setLanguage(language === k ? null : (k as Language)),
      })),
    },
    {
      title: 'Demo',
      icon: <LayoutDashboard size={12} strokeWidth={2} />,
      entries: [
        { key: 'admin', label: 'Admin demo', icon: <LayoutDashboard size={15} strokeWidth={1.8} />, href: '/demo/admin' },
        { key: 'tokens', label: 'Design tokens', icon: <Palette size={15} strokeWidth={1.8} />, href: '/demo/tokens' },
      ],
    },
  ].filter((s) => s.entries.length > 0);

  const pills = (
    <div ref={pillsRef} className="dj-no-scrollbar flex items-center gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
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
        onClear={() => {
          setDeadline(null);
          setDay(null);
        }}
      >
        <OptionList
          options={deadlineOptions}
          selected={deadline}
          onPick={(k) => {
            setDeadline(k === deadline ? null : (k as DeadlineFilter));
            setDay(null);
            setPopover(null);
          }}
        />
      </FilterPill>
      {anyFilter && (
        <button type="button" className="dj-pill shrink-0" style={{ border: 'none', background: 'transparent' }} onClick={clearAll}>
          Clear all
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
      applied={applied.includes(selected.id)}
      sameOrg={sameOrg}
      sameCountry={sameCountry}
      similar={similarJobs(selected, jobs)}
      onOpenJob={openJob}
      onToggleSave={() => toggleSave(selected.id)}
      onToggleApplied={() => toggleApplied(selected.id)}
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

  const heading = inSaved ? 'Saved jobs' : 'NGO, humanitarian and development jobs';
  const emptyHint =
    view === 'saved' ? 'Save a job with the bookmark and it appears here.' : view === 'applied' ? 'Open a job and mark it as applied to track it here.' : 'Try fewer filters.';

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
        footnote={`Demo data · ${snapshotDate}`}
      />

      <div ref={mainRef} className="flex min-w-0 flex-1" style={{ ['--split' as string]: `${split}%` }}>
        <section className="flex h-full w-full min-w-0 shrink-0 flex-col lg:w-[var(--split)] lg:min-w-[400px]" aria-label="Jobs">
          <div className="shrink-0 px-4 pb-2 pt-5 lg:px-6 lg:pt-6">
            <h1 className="dj-display" style={{ margin: 0, fontSize: 22 }}>
              {heading}
            </h1>
            <div className="dj-muted mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                <strong style={{ color: 'var(--text)', fontWeight: 650 }}>{list.length}</strong> {list.length === 1 ? 'open role' : 'open roles'}
              </span>
              {view === 'all' && closingCount > 0 && deadline !== 'soon' && (
                <>
                  <span className="dj-faint">·</span>
                  <button
                    type="button"
                    className="-my-2.5 inline-flex items-center gap-1 py-2.5 lg:my-0 lg:py-0"
                    style={{ border: 'none', background: 'transparent', paddingLeft: 0, paddingRight: 0, color: 'var(--amber)', cursor: 'pointer' }}
                    onClick={() => setDeadline('soon')}
                  >
                    {closingCount} close within {SOON_DAYS} days
                  </button>
                </>
              )}
              <span className="ml-auto inline-flex items-center gap-1" role="radiogroup" aria-label="Sort jobs">
                <Tip label="Urgent deadlines first, mixing organisations so no employer fills the list">
                  <button type="button" className="dj-sort" data-active={sort === 'recommended'} onClick={() => setSort('recommended')} role="radio" aria-checked={sort === 'recommended'}>
                    Recommended
                  </button>
                </Tip>
                <Tip label="Strictly by deadline, soonest first">
                  <button type="button" className="dj-sort" data-active={sort === 'closing'} onClick={() => setSort('closing')} role="radio" aria-checked={sort === 'closing'}>
                    Closing soon
                  </button>
                </Tip>
              </span>
            </div>
            {inSaved && (
              <div className="mt-3 flex items-center gap-1.5" role="tablist" aria-label="Saved or applied">
                <button type="button" className="dj-pill" data-active={view === 'saved'} onClick={() => setView('saved')} role="tab" aria-selected={view === 'saved'}>
                  <Bookmark size={13} strokeWidth={1.8} /> Saved {saved.length}
                </button>
                <button type="button" className="dj-pill" data-active={view === 'applied'} onClick={() => setView('applied')} role="tab" aria-selected={view === 'applied'}>
                  <CircleCheck size={13} strokeWidth={1.8} /> Applied {applied.length}
                </button>
              </div>
            )}
            <div className="mt-3 hidden items-center gap-2 lg:flex">{searchBox}</div>
            <div className="mt-3">{pills}</div>
            {deadline === 'soon' && (
              <div className="mt-2 lg:hidden">
                <DayStrip
                  groups={dayGroups(jobs.filter((j) => matches(j, 'day') && j.daysLeft !== null && j.daysLeft <= SOON_DAYS))}
                  value={day}
                  onChange={setDay}
                />
              </div>
            )}
          </div>
          <div className="dj-scroll flex-1 px-2 pb-28 lg:px-4 lg:pb-4">
            {list.map((j) => (
              <JobRow
                key={j.id}
                job={j}
                active={j.id === selectedId}
                saved={saved.includes(j.id)}
                applied={applied.includes(j.id)}
                onOpen={() => openJob(j.id)}
                onToggleSave={() => toggleSave(j.id)}
              />
            ))}
            {list.length === 0 && (
              <div className="flex flex-col items-start gap-2 px-3 py-8">
                <span className="dj-title">No jobs here yet</span>
                <span className="dj-muted">{emptyHint}</span>
                {anyFilter && (
                  <button type="button" className="dj-pill" onClick={clearAll}>
                    Show all jobs
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
        <aside className="dj-scroll hidden h-full min-w-[340px] flex-1 lg:block" style={{ padding: 20 }} aria-label="Job">
          <div className="dj-card" style={{ padding: 20 }}>
            {detail ?? <ClosingSoon jobs={jobs} onOpen={openJob} />}
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
