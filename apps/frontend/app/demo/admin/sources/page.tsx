'use client';

import {
  Download,
  ExternalLink,
  FlaskConical,
  LayoutGrid,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Rows3,
  ScanSearch,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Tip from '../../_components/Tip';
import { Bar, Sparkline } from '../../_components/Charts';
import { displayOrg, OrgMark } from '../../_components/PublicDemo';
import { FOUND_HISTORY, RUNS, SOURCES, STAGES, type DemoSource } from '../../_lib/adminData';

const ACTIONS = [
  { label: 'Run crawl', icon: Play },
  { label: 'Pause', icon: Pause },
  { label: 'Edit', icon: Pencil },
  { label: 'Test source', icon: FlaskConical },
  { label: 'Simulate extraction', icon: ScanSearch },
  { label: 'Export', icon: Download },
];

function ActionsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <Tip label="Actions">
        <button type="button" className="dj-icon-btn" style={{ width: 28, height: 28 }} onClick={() => setOpen(!open)} aria-label="Actions" aria-expanded={open}>
          <MoreHorizontal size={15} strokeWidth={1.8} />
        </button>
      </Tip>
      {open && (
        <div className="dj-popover absolute right-0 top-[calc(100%+6px)]" style={{ minWidth: 210 }} role="menu">
          {ACTIONS.map(({ label, icon: Icon }) => (
            <button key={label} type="button" className="dj-option" role="menuitem" aria-disabled="true" title="Demo: does nothing" onClick={() => setOpen(false)}>
              <Icon size={14} strokeWidth={1.8} className="dj-faint" />
              <span className="flex-1">{label}</span>
            </button>
          ))}
          <div className="dj-faint px-2 pb-1 pt-2">Deletes are in the danger area on the source.</div>
        </div>
      )}
    </div>
  );
}

function ResultChip({ s }: { s: DemoSource }) {
  if (s.result === 'partial') {
    return (
      <Tip label={s.note}>
        <span className="dj-chip" data-tone="amber">
          Partial {s.found}/{s.expected}
        </span>
      </Tip>
    );
  }
  return (
    <span className="dj-chip" data-tone="sage">
      Complete
    </span>
  );
}

function SourceDetail({ s }: { s: DemoSource }) {
  const runs = RUNS.filter((r) => displayOrg(s.org).startsWith(r.source) || r.source === s.org).slice(0, 5);
  const fields: Array<[string, string]> = [
    ['Type', s.type.toUpperCase()],
    ['Schedule', s.schedule],
    ['Last crawl', `${s.lastCrawl} UTC`],
    ['Next crawl', s.nextCrawl ? `${s.nextCrawl} UTC` : 'Not read in the review'],
    ['Failures in a row', String(s.failures)],
    ['Health', `${s.health} / 100`],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <OrgMark name={s.org} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate" style={{ fontSize: 15, fontWeight: 650 }}>
            {displayOrg(s.org)}
          </div>
          <a className="dj-muted inline-flex max-w-full items-center gap-1 truncate" href={s.url} target="_blank" rel="noopener noreferrer">
            <span className="truncate">{s.url}</span>
            <ExternalLink size={12} />
          </a>
        </div>
        <ResultChip s={s} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {fields.map(([k, v]) => (
          <div key={k}>
            <div className="dj-faint">{k}</div>
            <div>{v}</div>
          </div>
        ))}
      </div>
      <p className="dj-muted" style={{ margin: 0 }}>
        {s.note}
      </p>
      <div>
        <div className="dj-section-label" style={{ padding: '0 0 6px' }}>
          Recent crawl runs
        </div>
        {runs.map((r, i) => (
          <div key={`${r.when}-${i}`} className="flex items-center gap-2 border-t py-2 dj-hair">
            <span className="w-[88px] shrink-0 dj-faint">{r.when}</span>
            <span className="min-w-0 flex-1 truncate">{r.message}</span>
            <span className="dj-chip" data-tone={r.status === 'ok' ? 'sage' : r.status === 'partial' ? 'amber' : 'red'}>
              {r.status}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.slice(0, 5).map(({ label, icon: Icon }) => (
          <Tip key={label} label={`${label} (demo: does nothing)`}>
            <button type="button" className="dj-icon-btn" aria-label={label} aria-disabled="true">
              <Icon size={14} strokeWidth={1.8} />
            </button>
          </Tip>
        ))}
      </div>
      <div className="flex flex-col gap-2 p-3" style={{ border: '1px solid var(--red)', borderRadius: 16, background: 'var(--red-bg)' }}>
        <div style={{ fontWeight: 650, color: 'var(--red)' }}>Danger area</div>
        <p className="dj-muted" style={{ margin: 0 }}>
          Deleting cannot be undone and also removes users&apos; shortlists. Each action shows its impact and asks you to type the organisation name.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="dj-pill" style={{ borderColor: 'var(--red)', color: 'var(--red)', background: 'transparent' }} aria-disabled="true" title="Demo: does nothing">
            <Trash2 size={13} /> Delete this source&apos;s jobs
          </button>
          <button type="button" className="dj-pill" style={{ borderColor: 'var(--red)', color: 'var(--red)', background: 'transparent' }} aria-disabled="true" title="Demo: does nothing">
            <Trash2 size={13} /> Delete source
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DemoAdminSources() {
  const [view, setView] = useState<'table' | 'stages'>('table');
  const [selected, setSelected] = useState<string>('unicef');
  const current = SOURCES.find((s) => s.id === selected) ?? SOURCES[0];

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-4 pb-24 pt-6 lg:px-8 lg:pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="dj-display" style={{ margin: 0 }}>
            Sources
          </h1>
          <p className="dj-muted" style={{ margin: 0 }}>
            3 live · 6 proposed or checked offline
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full p-1" style={{ background: 'var(--surface-2)' }} role="tablist">
          <button type="button" className="dj-pill" data-active={view === 'table'} style={{ height: 28 }} onClick={() => setView('table')} role="tab" aria-selected={view === 'table'}>
            <Rows3 size={13} strokeWidth={1.8} /> Table
          </button>
          <button type="button" className="dj-pill" data-active={view === 'stages'} style={{ height: 28 }} onClick={() => setView('stages')} role="tab" aria-selected={view === 'stages'}>
            <LayoutGrid size={13} strokeWidth={1.8} /> By stage
          </button>
        </div>
      </div>

      {view === 'table' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="dj-card p-2">
            <div className="dj-faint hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_120px_90px_80px_36px] gap-3 px-3 py-2 md:grid">
              <span>Organisation</span>
              <span>Listing</span>
              <span>Result</span>
              <span>Last crawl</span>
              <span>Trend</span>
              <span />
            </div>
            {SOURCES.map((s) => (
              <div
                key={s.id}
                className="dj-row grid-cols-[minmax(0,1fr)_auto_36px] gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_120px_90px_80px_36px]"
                style={{ display: 'grid' }}
                data-active={s.id === selected}
                onClick={() => setSelected(s.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setSelected(s.id);
                }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <OrgMark name={s.org} />
                  <div className="min-w-0">
                    <div className="truncate" style={{ fontWeight: 600 }}>
                      {displayOrg(s.org)}
                    </div>
                    <div className="mt-1 w-24">
                      <Bar pct={s.health} />
                    </div>
                  </div>
                </div>
                <span className="dj-muted hidden truncate md:block">{s.url.replace(/^https?:\/\//, '')}</span>
                <span>
                  <ResultChip s={s} />
                </span>
                <span className="dj-muted hidden md:block">{s.lastCrawl}</span>
                <span className="hidden md:block">
                  <Sparkline values={FOUND_HISTORY[s.id] ?? []} width={72} height={22} label={`${displayOrg(s.org)}: jobs found per crawl`} />
                </span>
                <ActionsMenu />
              </div>
            ))}
          </div>
          <div className="dj-card p-5">
            <SourceDetail s={current} />
          </div>
        </div>
      ) : (
        <div className="dj-no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-4 lg:px-0">
          {STAGES.map((col) => (
            <div key={col.stage} className="flex w-[260px] shrink-0 flex-col gap-2 lg:w-auto">
              <div className="flex items-center justify-between px-1">
                <span className="dj-title">{col.stage}</span>
                <span className="dj-chip">{col.cards.length}</span>
              </div>
              {col.cards.map((c) => {
                const emphasis = col.stage === 'Needs attention';
                return (
                  <div
                    key={c.name}
                    className="flex flex-col gap-2 p-4"
                    style={{
                      borderRadius: 18,
                      border: `1px solid ${emphasis ? 'var(--ink)' : 'var(--hair)'}`,
                      background: emphasis ? 'var(--ink)' : 'var(--surface)',
                      color: emphasis ? 'var(--on-ink)' : 'var(--text)',
                    }}
                  >
                    <div style={{ fontWeight: 650, fontSize: 13 }}>{c.name}</div>
                    <div style={{ opacity: emphasis ? 0.8 : 1 }} className={emphasis ? '' : 'dj-muted'}>
                      {c.detail}
                    </div>
                    {c.item && (
                      <span className="dj-chip self-start" style={emphasis ? { background: 'rgba(255,255,255,0.14)', color: 'var(--on-ink)' } : undefined}>
                        {c.item}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
