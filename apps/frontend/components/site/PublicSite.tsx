'use client';

import {
  ArrowUpDown,
  Bookmark,
  Briefcase,
  BriefcaseBusiness,
  CalendarPlus,
  CircleDashed,
  Layers,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  FileSignature,
  GraduationCap,
  Hourglass,
  House,
  Languages,
  Mail,
  MapPin,
  Menu,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Target,
  Timer,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction, type UIEvent } from 'react';
import BottomSheet, { useIsPhone } from './BottomSheet';
import DayStrip, { type DayGroup } from './DayStrip';
import Flag from './Flag';
import SideMenu, { type MenuEntry, type MenuSection } from './SideMenu';
import { usePersistentState } from './SiteRoot';
import Tip from './Tip';
import { countryName } from '@/lib/site/countries';
import {
  countBy,
  DEADLINE_LABELS,
  dayStart,
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
} from '@/lib/site/jobs';
import { loadOpenJobs } from '@/lib/site/loadJobs';
import { HOME_PATH as HOME } from '@/lib/site/siteUrl';
import { CONTRACT_HINT, factsOf, gradeHint, LEVEL_HINT, LEVELS, SECTOR_SDG, typicalExperience, type Contract, type Facts } from '@/lib/site/facts';

type JobF = Job & { facts: Facts };
type View = 'all' | 'saved';
type PopoverKey = 'sector' | 'org' | 'country' | 'deadline';
type Sort = 'recommended' | 'closing';
const SORT_KEYS: Sort[] = ['recommended', 'closing'];
const SORTS: Record<Sort, { label: string; hint: string }> = {
  recommended: { label: 'Recommended', hint: 'Urgent deadlines first, mixing organisations so no employer fills the list' },
  closing: { label: 'Soonest deadline', hint: 'Strictly by deadline, soonest first' },
};

const FACTS_HINT = 'Read from job titles. Today mostly UNICEF titles carry this, so some jobs are not counted.';

export function displayOrg(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
}

export function OrgMark({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <span className="aj-mark" style={{ width: size, height: size, fontSize: size < 20 ? 8 : 10, borderRadius: size < 20 ? 5 : 7 }} aria-hidden>
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
      <span className="aj-chip" data-tone={tone} tabIndex={0}>
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
        <span className="aj-muted flex items-center gap-2" tabIndex={0}>
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

/** UNICEF region and office codes that appear in titles but say nothing about the work. */
const PLACE_CODES = new Set('ecar esar wcar mena lacr eapr nyhq gpd'.split(' '));

function placeWords(job: Job): string[] {
  return `${job.place ?? ''} ${job.country ?? ''}`.toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
}

function keyWords(title: string, exclude: Set<string> = new Set()): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[^a-zà-ÿ&]+/)
      .filter((w) => w.length > 3 && !COMMON_WORDS.has(w) && !PLACE_CODES.has(w) && !exclude.has(w)),
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
      const places = new Set([...placeWords(job), ...placeWords(j)]);
      const shared = [...keyWords(j.title, places)].filter((w) => words.has(w)).slice(0, 3);
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
    'PRODID:-//AidJobs//AidJobs//EN',
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
  resultCount,
  tall,
  children,
}: {
  label: string;
  icon: ReactNode;
  value: string | null;
  open: boolean;
  onOpen: () => void;
  onClear: () => void;
  /** Jobs that match with this filter applied; shown on the phone sheet's button. */
  resultCount?: number;
  tall?: boolean;
  children: ReactNode;
}) {
  const phone = useIsPhone();
  const panel = !open ? null : phone ? (
    <BottomSheet
      title={label}
      subtitle={value ?? undefined}
      tall={tall}
      onClose={onOpen}
      action={
        value ? (
          <button type="button" className="aj-text-btn" onClick={onClear}>
            Clear
          </button>
        ) : undefined
      }
      footer={
        <button type="button" className="aj-ink-btn w-full justify-center" style={{ height: 44 }} onClick={onOpen}>
          {resultCount === undefined ? 'Done' : resultCount === 0 ? 'No jobs match' : `Show ${resultCount} ${resultCount === 1 ? 'job' : 'jobs'}`}
        </button>
      }
    >
      {children}
    </BottomSheet>
  ) : (
    <div className="aj-popover absolute left-0 top-[calc(100%+6px)] flex flex-col">{children}</div>
  );
  return (
    <div className="relative shrink-0">
      <button type="button" className="aj-pill" data-active={value ? 'true' : 'false'} onClick={onOpen} aria-expanded={open} aria-haspopup="listbox">
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
      {panel}
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
  selected: string | string[] | null;
  onPick: (key: string) => void;
  searchable?: boolean;
  placeholder?: string;
}) {
  const phone = useIsPhone();
  const [q, setQ] = useState('');
  const picked = Array.isArray(selected) ? selected : selected ? [selected] : [];
  // Long lists show earlier picks first, fixed at opening so rows do not jump while tapping.
  const [pinned] = useState(() => (options.length > 8 ? picked : []));
  const needle = q.trim().toLowerCase();
  const top = needle ? [] : options.filter((o) => pinned.includes(o.key));
  const rest = options.filter((o) => o.label.toLowerCase().includes(needle) && (needle !== '' || !pinned.includes(o.key)));
  const row = (o: (typeof options)[number]) => {
    const on = picked.includes(o.key);
    return (
      <button key={o.key} type="button" className="aj-option" data-active={on} onClick={() => onPick(o.key)} role="option" aria-selected={on}>
        {o.lead}
        <span className="min-w-0 flex-1 truncate">{o.label}</span>
        <span className="aj-faint" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {o.count}
        </span>
        <span className="flex w-[14px] shrink-0 justify-center">{on && <Check size={14} strokeWidth={2.2} style={{ color: 'var(--sage-7)' }} />}</span>
      </button>
    );
  };
  return (
    <>
      {searchable && (
        <div className="relative mb-1 shrink-0">
          <Search size={13} className="aj-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
          <input autoFocus={!phone} className="aj-input" style={{ height: phone ? 40 : 32 }} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label={placeholder} />
        </div>
      )}
      <div className="aj-scroll min-h-0 flex-1 pb-1" role="listbox" aria-multiselectable={Array.isArray(selected)}>
        {top.length > 0 && (
          <>
            <div className="aj-option-label">Selected</div>
            {top.map(row)}
            <div className="aj-option-label">All</div>
          </>
        )}
        {rest.map(row)}
        {top.length === 0 && rest.length === 0 && <div className="aj-faint px-2 py-3">Nothing matches</div>}
      </div>
    </>
  );
}

function JobRow({
  job,
  active,
  saved,
  onOpen,
  onToggleSave,
}: {
  job: JobF;
  active: boolean;
  saved: boolean;
  onOpen: () => void;
  onToggleSave: () => void;
}) {
  return (
    <div
      className="aj-row"
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
        <div className="aj-muted flex min-w-0 items-center gap-1.5">
          <span className="shrink-0">{displayOrg(job.org)}</span>
          <span className="aj-faint">·</span>
          <Flag iso={job.iso} title={job.country} />
          <span className="min-w-0 truncate">{job.country ?? job.place ?? 'Location not listed'}</span>
          {job.facts.contract && (
            <>
              <span className="aj-faint">·</span>
              <span className="shrink-0">{job.facts.contract}</span>
            </>
          )}
          {job.facts.sdgs.slice(0, 1).map((s) => (
            <Tip key={s.goal} label={`SDG ${s.goal}: ${s.name}${job.facts.sdgs.length > 1 ? ` (and ${job.facts.sdgs.length - 1} more)` : ''}, read from the job title`}>
              <span className="aj-sdg" tabIndex={0}>
                <span className="aj-sdg-dot" style={{ background: s.colour }} aria-hidden />
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
      <DaysChip job={job} />
      <Tip label={saved ? 'Saved on this device. Remove' : 'Save on this device'}>
        <button
          type="button"
          className="aj-icon-btn"
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
      <span className="aj-chip" style={{ height: 26, fontSize: 12 }} tabIndex={0}>
        {icon}
        {label}
      </span>
    </Tip>
  );
}

function JobDetail({
  job,
  saved,
  sameOrg,
  sameCountry,
  similar,
  onOpenJob,
  onToggleSave,
  onClose,
  onPickOrg,
  onPickCountry,
  onToast,
}: {
  job: JobF;
  saved: boolean;
  sameOrg: number;
  sameCountry: number;
  similar: Similar[];
  onOpenJob: (id: string) => void;
  onToggleSave: () => void;
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
  const hasFacts = f.sectors.length > 0 || f.contract || f.grade || f.duration || f.openTo || f.remote || f.language !== 'English';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <OrgMark name={job.org} />
        <span className="aj-muted min-w-0 flex-1 truncate">{org}</span>
        <Tip label="Close" side="bottom">
          <button type="button" className="aj-icon-btn" onClick={onClose} aria-label="Close job">
            <X size={15} strokeWidth={1.8} />
          </button>
        </Tip>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 650, lineHeight: 1.35, margin: 0 }}>{job.title}</h2>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <MapPin size={14} strokeWidth={1.8} className="aj-faint" />
          <Flag iso={job.iso} title={job.country} />
          <span>{job.place ?? `Location on the ${org} vacancy page`}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock size={14} strokeWidth={1.8} className="aj-faint" />
          {job.deadline ? (
            <>
              <span>Closes {formatLongDate(job.deadline)}</span>
              <DaysChip job={job} />
            </>
          ) : (
            <span className="aj-muted">No deadline listed</span>
          )}
        </div>
        <Freshness job={job} />
      </div>

      {hasFacts && (
        <div className="flex flex-wrap gap-1.5">
          {f.sectors.map((s) => {
            const sdg = SECTOR_SDG[s];
            return (
              <FactChip
                key={s}
                icon={sdg ? <span className="aj-sdg-dot" style={{ background: sdg.colour }} aria-hidden /> : <Target size={12} />}
                label={sdg ? `${s} · SDG ${sdg.goal}` : s}
                hint={sdg ? `Sector: ${s}. SDG ${sdg.goal}: ${sdg.name}. Read from the job title.` : `Sector: ${s}, read from the job title. No single SDG applies.`}
              />
            );
          })}
          {f.contract && <FactChip icon={<FileSignature size={12} />} label={f.contract} hint={CONTRACT_HINT[f.contract]} />}
          {f.level && <FactChip icon={<Layers size={12} />} label={f.level} hint={`Level: ${LEVEL_HINT[f.level]}`} />}
          {f.grade && (
            <FactChip
              icon={<ShieldCheck size={12} />}
              label={typicalExperience(f.grade) ? `${f.grade} · ${typicalExperience(f.grade)}` : f.grade}
              hint={gradeHint(f.grade)}
            />
          )}
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
        <a className="aj-ink-btn" href={job.apply_url} target="_blank" rel="noopener noreferrer">
          Apply on {org}
          <ExternalLink size={13} strokeWidth={2} />
        </a>
        <Tip label={saved ? 'Saved on this device. Remove' : 'Save on this device'}>
          <button type="button" className="aj-icon-btn" data-active={saved} onClick={onToggleSave} aria-label={saved ? 'Remove from saved' : 'Save job'} aria-pressed={saved}>
            <Bookmark size={15} strokeWidth={1.8} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </Tip>
        {job.deadline && (
          <Tip label="Add the deadline to my calendar, reminder 2 days before">
            <button type="button" className="aj-icon-btn" onClick={calendar} aria-label="Add deadline to calendar">
              <CalendarPlus size={15} strokeWidth={1.8} />
            </button>
          </Tip>
        )}
        <Tip label="Share: WhatsApp, LinkedIn, email, or copy link">
          <button type="button" className="aj-icon-btn" onClick={share} aria-label="Share job">
            <Share2 size={15} strokeWidth={1.8} />
          </button>
        </Tip>
        <Tip label="Email this job to myself">
          <a className="aj-icon-btn" href={mailto} aria-label="Email this job">
            <Mail size={15} strokeWidth={1.8} />
          </a>
        </Tip>
      </div>

      {similar.length > 0 && (
        <section className="flex flex-col gap-1" aria-label="Similar jobs">
          <div className="aj-section-label" style={{ padding: '2px 0 4px' }}>
            Similar jobs
          </div>
          {similar.map((s) => (
            <button key={s.job.id} type="button" className="aj-option" onClick={() => onOpenJob(s.job.id)}>
              <OrgMark name={s.job.org} size={18} />
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontWeight: 560 }}>
                  {s.job.title}
                </span>
                <span className="aj-muted block truncate">
                  {displayOrg(s.job.org)}
                  {s.job.country ? ` · ${s.job.country}` : ''}
                </span>
                <span className="aj-faint block truncate">Shared: {s.why}</span>
              </span>
              <DaysChip job={s.job} />
            </button>
          ))}
        </section>
      )}

      <div className="flex flex-col gap-1">
        {sameOrg > 0 && (
          <button type="button" className="aj-option" onClick={onPickOrg}>
            <OrgMark name={job.org} size={18} />
            <span className="flex-1">More from {org}</span>
            <span className="aj-faint">{sameOrg}</span>
          </button>
        )}
        {sameCountry > 0 && job.country && (
          <button type="button" className="aj-option" onClick={onPickCountry}>
            <Flag iso={job.iso} title={job.country} />
            <span className="flex-1">More in {job.country}</span>
            <span className="aj-faint">{sameCountry}</span>
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
        <h2 className="aj-title" style={{ fontSize: 15, margin: 0 }}>
          Closing in the next {SOON_DAYS} days
        </h2>
        <span className="aj-chip" data-tone="sage">
          {soon.length} roles
        </span>
      </div>
      {soon.length === 0 && <p className="aj-muted">No deadlines in the next {SOON_DAYS} days.</p>}
      {soon.length > 0 && (
        <DayStrip groups={dayGroups(soon)} value={day} onChange={(d) => setPicked(d ?? firstDay)} />
      )}
      {shown.map(([date, list]) => {
        const d = list[0].daysLeft as number;
        return (
          <section key={date} aria-label={`${dayLabel(d)}, ${formatLongDate(date)}`}>
            <div className="sticky top-0 z-10 flex items-center gap-2 py-2" style={{ background: 'var(--surface)' }}>
              <span style={{ fontWeight: 650 }}>{dayLabel(d)}</span>
              <span className="aj-faint">{formatLongDate(date)}</span>
              <span className="ml-auto aj-chip" data-tone={d <= 3 ? 'red' : 'amber'}>
                {list.length}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 pb-2">
              {list.map((j) => (
                <button key={j.id} type="button" className="aj-option" onClick={() => onOpen(j.id)}>
                  <OrgMark name={j.org} size={18} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ fontWeight: 560 }}>
                      {j.title}
                    </span>
                    <span className="aj-muted flex items-center gap-1.5">
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

type Facet = 'contract' | 'level' | 'openTo' | 'work' | 'language';
const FACETS: Facet[] = ['contract', 'level', 'openTo', 'work', 'language'];
const NO_PICKS: Record<Facet, string[]> = { contract: [], level: [], openTo: [], work: [], language: [] };
/** Value for jobs whose title says nothing on a facet, so every job is reachable through some choice. */
const NONE = '__none';

function facetValue(j: JobF, f: Facet): string {
  if (f === 'contract') return j.facts.contract ?? NONE;
  if (f === 'level') return j.facts.level ?? NONE;
  if (f === 'openTo') return j.facts.openTo ?? NONE;
  if (f === 'work') return j.facts.remote ? 'Remote' : NONE;
  return j.facts.language;
}

type Load = 'ready' | 'loading' | 'failed';

function LoadState({ state, onRetry }: { state: Exclude<Load, 'ready'>; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 px-3 py-8" role="status">
      <span className="aj-title">{state === 'loading' ? 'Loading jobs' : 'Jobs could not be loaded'}</span>
      {state === 'failed' && (
        <>
          <span className="aj-muted">The job service did not answer. It may be starting up.</span>
          <button type="button" className="aj-pill" onClick={onRetry}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}

/**
 * `initialJobs` is null when the page was built while the backend was unreachable; the browser then loads the jobs.
 * Days left start from `builtAt`, the time the cached page was made, so the first render matches the server's HTML.
 */
export default function PublicSite({ initialJobs, builtAt }: { initialJobs: RawJob[] | null; builtAt: number }) {
  const [rawJobs, setRawJobs] = useState<RawJob[]>(initialJobs ?? []);
  const [load, setLoad] = useState<Load>(initialJobs ? 'ready' : 'loading');
  const [today, setToday] = useState(() => dayStart(builtAt));
  const [ready, setReady] = useState(false);
  const jobs = useMemo<JobF[]>(() => normaliseJobs(rawJobs, today).filter(isOpen).map((j) => ({ ...j, facts: factsOf(j.title) })), [rawJobs, today]);

  useEffect(() => {
    setToday(dayStart(Date.now()));
    setReady(true);
  }, []);

  const fetchJobs = useCallback(() => {
    setLoad('loading');
    loadOpenJobs({ origin: '', timeoutMs: 60_000 })
      .then((list) => {
        setRawJobs(list);
        setLoad('ready');
      })
      .catch(() => setLoad('failed'));
  }, []);

  useEffect(() => {
    if (!initialJobs) fetchJobs();
  }, [initialJobs, fetchJobs]);

  const [view, setView] = useState<View>('all');
  const [orgs, setOrgs] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineFilter[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [picks, setPicks] = useState<Record<Facet, string[]>>(NO_PICKS);
  const [day, setDay] = useState<string | null>(null);
  const [sectors, setSectors] = useState<string[]>([]);
  const [sort, setSort] = usePersistentState<Sort>('aidjobs.sort', 'recommended');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverKey | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saved, setSaved] = usePersistentState<string[]>('aidjobs.saved', []);
  const [collapsed, setCollapsed] = usePersistentState<boolean>('aidjobs.menuCollapsed', false);
  const [split, setSplit] = usePersistentState<number>('aidjobs.split', 56);
  const [dragging, setDragging] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  const lastScroll = useRef(0);
  const phone = useIsPhone();

  /** Phone: fold the brand bar and heading away while reading down the list, bring them back on the way up. */
  const onListScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const top = el.scrollTop;
    const atBottom = top + el.clientHeight >= el.scrollHeight - 4;
    if (top < 40) setCompact(false);
    else if (top > lastScroll.current + 6) setCompact(true);
    else if (top < lastScroll.current - 6 && !atBottom) setCompact(false);
    lastScroll.current = top;
  };

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
  type Skip = PopoverKey | Facet | 'day';
  const matches = (j: JobF, skip?: Skip) =>
    (view !== 'saved' || saved.includes(j.id)) &&
    (skip === 'sector' || sectors.length === 0 || (j.facts.sectors.length ? j.facts.sectors.some((s) => sectors.includes(s)) : sectors.includes(NONE))) &&
    (skip === 'org' || orgs.length === 0 || orgs.includes(j.org)) &&
    (skip === 'country' || countries.length === 0 || countries.includes(j.iso ?? NONE)) &&
    (skip === 'deadline' || deadlines.length === 0 || deadlines.some((d) => matchesDeadline(j, d))) &&
    FACETS.every((f) => skip === f || picks[f].length === 0 || picks[f].includes(facetValue(j, f))) &&
    (skip === 'day' || !day || j.deadline === day) &&
    matchesText(j, query);
  const togglePick = (f: Facet, v: string) =>
    setPicks((prev) => ({ ...prev, [f]: prev[f].includes(v) ? prev[f].filter((x) => x !== v) : [...prev[f], v] }));

  const filtered = jobs.filter((j) => matches(j));
  const list = sort === 'recommended' ? recommendedOrder(filtered) : sortByDeadline(filtered);
  const selected = jobs.find((j) => j.id === selectedId) ?? null;
  const selectedTitle = selected?.title ?? null;

  useEffect(() => {
    if (!selectedTitle) return;
    const before = document.title;
    document.title = `${selectedTitle} | AidJobs`;
    return () => {
      document.title = before;
    };
  }, [selectedTitle]);
  const closingCount = jobs.filter(
    (j) => j.daysLeft !== null && j.daysLeft <= SOON_DAYS && (deadlines.length === 1 && deadlines[0] === 'soon' ? matches(j, 'day') : matches(j, 'deadline')),
  ).length;

  const orgOptions = countBy(jobs.filter((j) => matches(j, 'org')), (j) => j.org).map(([k, n]) => ({ key: k, label: displayOrg(k), count: n, lead: <OrgMark name={k} size={18} /> }));
  for (const k of orgs) if (!orgOptions.some((o) => o.key === k)) orgOptions.push({ key: k, label: displayOrg(k), count: 0, lead: <OrgMark name={k} size={18} /> });
  const countryPool = jobs.filter((j) => matches(j, 'country'));
  const noCountry = countryPool.filter((j) => j.iso === null).length;
  const countryOptions = [
    ...countBy(countryPool, (j) => j.iso).map(([k, n]) => ({
      key: k,
      label: countryName(k) ?? k,
      count: n,
      lead: <Flag iso={k} title={countryName(k)} />,
    })),
    ...(noCountry > 0 || countries.includes(NONE)
      ? [{ key: NONE, label: 'Location not listed', count: noCountry, lead: <CircleDashed size={14} strokeWidth={1.8} className="aj-faint" /> }]
      : []),
  ];
  for (const k of countries) {
    if (k !== NONE && !countryOptions.some((o) => o.key === k)) countryOptions.push({ key: k, label: countryName(k) ?? k, count: 0, lead: <Flag iso={k} title={countryName(k)} /> });
  }
  const deadlinePool = jobs.filter((j) => matches(j, 'deadline'));
  const deadlineOptions = (Object.keys(DEADLINE_LABELS) as DeadlineFilter[])
    .map((k) => ({ key: k, label: DEADLINE_LABELS[k], count: deadlinePool.filter((j) => matchesDeadline(j, k)).length }))
    .filter((o) => o.count > 0 || deadlines.includes(o.key));

  const pickCount = FACETS.reduce((n, f) => n + picks[f].length, 0);
  const anyFilter = !!(sectors.length || orgs.length || countries.length || deadlines.length || pickCount || day || query || view !== 'all');
  const closingView = deadlines.length === 1 && deadlines[0] === 'soon';
  const setClosingView = (on: boolean) => {
    setDeadlines(on ? ['soon'] : []);
    setDay(null);
  };
  const clearAll = () => {
    setDay(null);
    setOrgs([]);
    setCountries([]);
    setDeadlines([]);
    setPicks(NO_PICKS);
    setSectors([]);
    setQuery('');
    setView('all');
  };

  /** One menu section per facet: values by count, "Not stated" last, every choice combinable. */
  const facetSection = (f: Facet, title: string, icon: ReactNode, hint: string, labelOf: (v: string) => string, iconOf: (v: string) => ReactNode, order?: string[]): MenuSection => {
    const counts = new Map<string, number>();
    for (const j of jobs.filter((x) => matches(x, f))) {
      const v = facetValue(j, f);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    for (const v of picks[f]) if (!counts.has(v)) counts.set(v, 0);
    const rank = (v: string) => (order ? order.indexOf(v) : -(counts.get(v) ?? 0));
    const keys = [...counts.keys()].sort((a, b) => Number(a === NONE) - Number(b === NONE) || rank(a) - rank(b));
    return {
      title,
      icon,
      hint,
      entries: keys.map((v) => ({
        key: `${f}-${v}`,
        label: v === NONE ? 'Not stated' : labelOf(v),
        icon: v === NONE ? <CircleDashed size={15} strokeWidth={1.8} /> : iconOf(v),
        count: counts.get(v) ?? 0,
        active: picks[f].includes(v),
        onSelect: () => togglePick(f, v),
      })),
    };
  };
  const inSaved = view === 'saved';

  const primary: MenuEntry[] = [
    { key: 'all', label: 'All jobs', icon: <Briefcase size={15} strokeWidth={1.8} />, count: jobs.length, active: view === 'all' && !anyFilter, onSelect: clearAll },
    { key: 'saved', label: 'Saved', icon: <Bookmark size={15} strokeWidth={1.8} />, count: saved.length, active: inSaved, onSelect: () => setView(inSaved ? 'all' : 'saved') },
  ];
  const facetSections: MenuSection[] = [
    facetSection(
      'contract',
      'Contract',
      <FileSignature size={15} strokeWidth={1.8} />,
      `${FACTS_HINT} Choose several to combine them.`,
      (v) => (v === 'Consultancy' ? 'Consultancies' : v === 'Internship' ? 'Internships' : v === 'Fellowship' ? 'Fellowships' : v),
      (v) => CONTRACT_ICONS[v as Contract],
    ),
    facetSection(
      'level',
      'Level',
      <Layers size={15} strokeWidth={1.8} />,
      `${FACTS_HINT} Read from UN grades (P, NO, G, D) and words such as Internship, Senior, Chief, Head of. Choose several to combine them.`,
      (v) => v,
      () => <Layers size={15} strokeWidth={1.8} />,
      [...LEVELS],
    ),
    facetSection(
      'openTo',
      'Open to',
      <Users size={15} strokeWidth={1.8} />,
      `${FACTS_HINT} UN National Officer and General Service grades count as nationals.`,
      (v) => (v === 'Nationals' ? 'Nationals of the country' : 'International candidates'),
      () => <Users size={15} strokeWidth={1.8} />,
    ),
    facetSection(
      'work',
      'Work style',
      <House size={15} strokeWidth={1.8} />,
      `${FACTS_HINT} "Not stated" means the title does not say; it does not mean on-site.`,
      () => 'Remote or home-based',
      () => <House size={15} strokeWidth={1.8} />,
    ),
    facetSection(
      'language',
      'Advert language',
      <Languages size={15} strokeWidth={1.8} />,
      'The language the advert is written in, detected from the title.',
      (v) => v,
      () => <Languages size={15} strokeWidth={1.8} />,
    ),
  ].filter((s) => s.entries.length > 0);

  const sectorPool = jobs.filter((j) => matches(j, 'sector'));
  const sectorCounts = new Map<string, number>();
  for (const j of sectorPool) {
    for (const s of j.facts.sectors.length ? j.facts.sectors : [NONE]) sectorCounts.set(s, (sectorCounts.get(s) ?? 0) + 1);
  }
  for (const s of sectors) if (!sectorCounts.has(s)) sectorCounts.set(s, 0);
  const sectorOptions = [...sectorCounts.entries()]
    .sort((a, b) => Number(a[0] === NONE) - Number(b[0] === NONE) || b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([s, n]) => {
      const sdg = s === NONE ? null : SECTOR_SDG[s];
      return {
        key: s,
        label: s === NONE ? 'Not stated' : sdg ? `${s} · SDG ${sdg.goal}` : s,
        count: n,
        lead:
          s === NONE ? (
            <CircleDashed size={14} strokeWidth={1.8} className="aj-faint" />
          ) : (
            <span className="aj-sdg-dot" style={{ background: sdg ? sdg.colour : 'var(--hair)', width: 10, height: 10 }} aria-hidden />
          ),
      };
    });
  const summarise = (keys: string[], nameOf: (k: string) => string, plural: string) =>
    keys.length === 0 ? null : keys.length === 1 ? nameOf(keys[0]) : `${keys.length} ${plural}`;
  const toggler =
    <T extends string>(set: Dispatch<SetStateAction<T[]>>) =>
    (k: string) =>
      set((prev) => (prev.includes(k as T) ? prev.filter((x) => x !== k) : [...prev, k as T]));
  const pillProps = (key: PopoverKey) => ({
    open: popover === key,
    onOpen: () => setPopover(popover === key ? null : key),
    resultCount: filtered.length,
  });

  const pills = (
    <div ref={pillsRef} className="aj-no-scrollbar flex items-center gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
      <span className="shrink-0 lg:hidden">
        <button
          type="button"
          className="aj-pill"
          data-active={pickCount > 0}
          onClick={() => {
            setPopover(null);
            setFiltersOpen(true);
          }}
          aria-label={pickCount ? `Filters, ${pickCount} selected` : 'Filters'}
        >
          <SlidersHorizontal size={13} strokeWidth={1.8} />
          Filters
          {pickCount > 0 && <span className="aj-badge">{pickCount}</span>}
        </button>
      </span>
      <FilterPill
        label="Sector"
        icon={<Target size={13} strokeWidth={1.8} />}
        value={summarise(sectors, (s) => (s === NONE ? 'Sector not stated' : s), 'sectors')}
        onClear={() => setSectors([])}
        tall
        {...pillProps('sector')}
      >
        <OptionList options={sectorOptions} selected={sectors} searchable placeholder="Find a sector" onPick={toggler(setSectors)} />
      </FilterPill>
      <FilterPill
        label="Organisation"
        icon={<Briefcase size={13} strokeWidth={1.8} />}
        value={summarise(orgs, displayOrg, 'organisations')}
        onClear={() => setOrgs([])}
        tall
        {...pillProps('org')}
      >
        <OptionList options={orgOptions} selected={orgs} searchable placeholder="Find an organisation" onPick={toggler(setOrgs)} />
      </FilterPill>
      <FilterPill
        label="Country"
        icon={<MapPin size={13} strokeWidth={1.8} />}
        value={summarise(countries, (k) => (k === NONE ? 'Location not listed' : countryName(k) ?? k), 'countries')}
        onClear={() => setCountries([])}
        tall
        {...pillProps('country')}
      >
        <OptionList options={countryOptions} selected={countries} searchable placeholder="Find a country" onPick={toggler(setCountries)} />
      </FilterPill>
      <FilterPill
        label="Deadline"
        icon={<Clock size={13} strokeWidth={1.8} />}
        value={summarise(deadlines, (k) => DEADLINE_LABELS[k as DeadlineFilter], 'deadline ranges')}
        onClear={() => {
          setDeadlines([]);
          setDay(null);
        }}
        {...pillProps('deadline')}
      >
        <OptionList
          options={deadlineOptions}
          selected={deadlines}
          onPick={(k) => {
            toggler(setDeadlines)(k);
            setDay(null);
          }}
        />
      </FilterPill>
      {anyFilter && (
        <button type="button" className="aj-pill shrink-0" style={{ border: 'none', background: 'transparent' }} onClick={clearAll}>
          Clear all
        </button>
      )}
    </div>
  );

  const searchBox = (
    <div className="relative min-w-0 flex-1">
      <Search size={14} strokeWidth={1.8} className="aj-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        className="aj-input"
        enterKeyHint="search"
        placeholder="Search roles, organisations, places"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        aria-label="Search jobs"
      />
      {query && (
        <button type="button" className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 aj-faint" style={{ border: 'none', background: 'transparent' }} onClick={() => setQuery('')} aria-label="Clear search">
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
      similar={similarJobs(selected, jobs)}
      onOpenJob={openJob}
      onToggleSave={() => toggleSave(selected.id)}
      onClose={closeJob}
      onPickOrg={() => {
        setOrgs([selected.org]);
        closeJob();
      }}
      onPickCountry={() => {
        setCountries(selected.iso ? [selected.iso] : []);
        closeJob();
      }}
      onToast={setToast}
    />
  ) : null;

  const heading = inSaved ? (
    'Saved jobs'
  ) : (
    <>
      <span className="lg:hidden">NGO, humanitarian &amp; development jobs</span>
      <span className="hidden lg:inline">NGO, humanitarian and development jobs</span>
    </>
  );
  const emptyHint =
    view === 'saved' ? 'Save a job with the bookmark and it appears here.' : 'Try fewer filters.';

  return (
    <div className="flex h-full">
      <SideMenu
        primary={primary}
        sections={facetSections}
        drawerSections={[
          {
            title: 'Refine',
            entries: [
              {
                key: 'filters',
                label: 'Filters',
                icon: <SlidersHorizontal size={15} strokeWidth={1.8} />,
                count: pickCount || undefined,
                active: pickCount > 0,
                onSelect: () => setFiltersOpen(true),
              },
            ],
          },
        ]}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
        drawerOpen={drawerOpen}
        onCloseDrawer={() => setDrawerOpen(false)}
        homeHref={HOME}
      />

      <div ref={mainRef} className="flex min-w-0 flex-1" style={ready ? { ['--split' as string]: `${split}%` } : undefined}>
        <section className="flex h-full w-full min-w-0 shrink-0 flex-col lg:w-[var(--split)] lg:min-w-[400px]" aria-label="Jobs">
          <div className="lg:hidden">
            <div className="aj-collapse" data-hidden={compact}>
              <div>
                <div className="flex items-center justify-between px-4 pt-3">
                  <Link href={HOME} className="flex items-center gap-2" aria-label="AidJobs home" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                    <Star size={18} strokeWidth={2} style={{ color: 'var(--sage-7)' }} />
                    <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>aidjobs</span>
                  </Link>
                  <button
                    type="button"
                    className="aj-icon-btn relative"
                    data-active={inSaved}
                    onClick={() => setView(inSaved ? 'all' : 'saved')}
                    aria-label={`Saved jobs, ${saved.length}`}
                    aria-pressed={inSaved}
                  >
                    <Bookmark size={16} strokeWidth={1.8} />
                    {saved.length > 0 && <span className="aj-badge aj-badge-corner">{saved.length}</span>}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="shrink-0 px-4 pb-2 pt-1 lg:px-6 lg:pt-6">
            <div className="aj-collapse" data-hidden={compact && phone}>
              <div>
                <h1 className="aj-display aj-h1" style={{ margin: 0 }}>
                  {heading}
                </h1>
              </div>
            </div>
            <div className="aj-muted mt-1 flex items-center gap-x-2">
              {load === 'ready' && (
                <span className="shrink-0">
                  <strong style={{ color: 'var(--text)', fontWeight: 650 }}>{list.length}</strong> {list.length === 1 ? 'open role' : 'open roles'}
                </span>
              )}
              {view === 'all' && closingCount > 0 && !closingView && (
                <span className="hidden items-center gap-2 lg:inline-flex">
                  <span className="aj-faint">·</span>
                  <button
                    type="button"
                    style={{ border: 'none', background: 'transparent', padding: 0, color: 'var(--amber)', cursor: 'pointer' }}
                    onClick={() => setClosingView(true)}
                  >
                    {closingCount} close within {SOON_DAYS} days
                  </button>
                </span>
              )}
              <span className="ml-auto lg:hidden">
                <button
                  type="button"
                  className="aj-sort inline-flex items-center gap-1.5"
                  style={{ color: 'var(--text-2)' }}
                  onClick={() => {
                    setPopover(null);
                    setSortOpen(true);
                  }}
                  aria-haspopup="dialog"
                  aria-label={`Sort: ${SORTS[sort].label}`}
                >
                  <ArrowUpDown size={13} strokeWidth={2} />
                  {SORTS[sort].label}
                </button>
              </span>
              <span className="ml-auto hidden items-center gap-1 lg:inline-flex" role="radiogroup" aria-label="Sort jobs">
                {SORT_KEYS.map((k) => (
                  <Tip key={k} label={SORTS[k].hint}>
                    <button type="button" className="aj-sort" data-active={sort === k} onClick={() => setSort(k)} role="radio" aria-checked={sort === k}>
                      {SORTS[k].label}
                    </button>
                  </Tip>
                ))}
              </span>
            </div>
            {view === 'all' && (
              <div className="mt-3 lg:hidden">
                <div className="aj-switch" role="radiogroup" aria-label="Which jobs to show">
                  <button type="button" role="radio" aria-checked={!closingView} data-active={!closingView} onClick={() => setClosingView(false)}>
                    All jobs
                  </button>
                  <button type="button" role="radio" aria-checked={closingView} data-active={closingView} onClick={() => setClosingView(true)}>
                    <Clock size={13} strokeWidth={2} />
                    Closing in {SOON_DAYS} days
                    <span className="aj-switch-count">{closingCount}</span>
                  </button>
                </div>
              </div>
            )}
            {closingView && (
              <div className="mt-2 lg:hidden">
                <DayStrip
                  groups={dayGroups(jobs.filter((j) => matches(j, 'day') && j.daysLeft !== null && j.daysLeft <= SOON_DAYS))}
                  value={day}
                  onChange={setDay}
                />
              </div>
            )}
            <div className="mt-3 hidden items-center gap-2 lg:flex">{searchBox}</div>
            <div className="mt-3">{pills}</div>
          </div>
          <div className="aj-scroll flex-1 px-2 pb-28 lg:px-4 lg:pb-4" onScroll={onListScroll}>
            {list.map((j) => (
              <JobRow
                key={j.id}
                job={j}
                active={j.id === selectedId}
                saved={saved.includes(j.id)}
                onOpen={() => openJob(j.id)}
                onToggleSave={() => toggleSave(j.id)}
              />
            ))}
            {load !== 'ready' && <LoadState state={load} onRetry={fetchJobs} />}
            {load === 'ready' && list.length === 0 && (
              <div className="flex flex-col items-start gap-2 px-3 py-8">
                <span className="aj-title">No jobs here yet</span>
                <span className="aj-muted">{emptyHint}</span>
                {anyFilter && (
                  <button type="button" className="aj-pill" onClick={clearAll}>
                    Show all jobs
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <div
          className="aj-divider hidden lg:block"
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
        <aside className="aj-scroll hidden h-full min-w-[340px] flex-1 lg:block" style={{ padding: 20 }} aria-label="Job">
          <div className="aj-card" style={{ padding: 20 }}>
            {detail ?? <ClosingSoon jobs={jobs} onOpen={openJob} />}
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 lg:hidden" style={{ background: 'linear-gradient(to top, var(--page) 70%, transparent)' }}>
        <div className="aj-card flex items-center gap-2 p-1.5" style={{ borderRadius: 999 }}>
          <Tip label="Menu">
            <button type="button" className="aj-icon-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <Menu size={16} strokeWidth={1.8} />
            </button>
          </Tip>
          {searchBox}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end lg:hidden">
          <div className="flex-1" style={{ background: 'var(--scrim)' }} onClick={closeJob} aria-hidden />
          <div className="aj-sheet aj-scroll max-h-[86vh] px-5 pb-8" role="dialog" aria-modal="true" aria-label={selected.title}>
            <div className="aj-grabber" />
            {detail}
          </div>
        </div>
      )}

      {filtersOpen && (
        <BottomSheet
          title="Filters"
          subtitle={pickCount ? `${pickCount} selected` : undefined}
          tall
          onClose={() => setFiltersOpen(false)}
          action={
            pickCount ? (
              <button type="button" className="aj-text-btn" onClick={() => setPicks(NO_PICKS)}>
                Clear
              </button>
            ) : undefined
          }
          footer={
            <button type="button" className="aj-ink-btn w-full justify-center" style={{ height: 44 }} onClick={() => setFiltersOpen(false)}>
              {filtered.length === 0 ? 'No jobs match' : `Show ${filtered.length} ${filtered.length === 1 ? 'job' : 'jobs'}`}
            </button>
          }
        >
          <div className="aj-scroll min-h-0 flex-1 px-1 pb-3">
            <p className="aj-faint" style={{ margin: '0 0 4px', fontSize: 12 }}>
              Read from job titles. &ldquo;Not stated&rdquo; means the title does not say. Choose as many as you like.
            </p>
            {facetSections.map((s) => (
              <section key={s.title} className="pt-3" aria-label={s.title}>
                <h3 className="aj-sheet-heading">
                  {s.icon}
                  {s.title}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {s.entries.map((e) => (
                    <button key={e.key} type="button" className="aj-pill" data-active={e.active ? 'true' : 'false'} aria-pressed={!!e.active} onClick={e.onSelect}>
                      {e.label}
                      <span style={{ opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>{e.count}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </BottomSheet>
      )}

      {sortOpen && (
        <BottomSheet title="Sort jobs" onClose={() => setSortOpen(false)}>
          <div className="flex flex-col gap-1 pb-[max(16px,env(safe-area-inset-bottom))]" role="radiogroup" aria-label="Sort jobs">
            {SORT_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className="aj-option"
                data-active={sort === k}
                role="radio"
                aria-checked={sort === k}
                onClick={() => {
                  setSort(k);
                  setSortOpen(false);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block" style={{ fontWeight: 600 }}>
                    {SORTS[k].label}
                  </span>
                  <span className="aj-faint block">{SORTS[k].hint}</span>
                </span>
                <span className="flex w-[14px] shrink-0 justify-center">{sort === k && <Check size={14} strokeWidth={2.2} style={{ color: 'var(--sage-7)' }} />}</span>
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 lg:bottom-6" role="status">
          <span className="aj-chip" style={{ background: 'var(--ink)', color: 'var(--on-ink)', height: 30, padding: '0 14px', fontSize: 12 }}>
            {toast}
          </span>
        </div>
      )}
    </div>
  );
}
