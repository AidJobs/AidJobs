'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, CalendarClock, Check, Circle, Clock } from 'lucide-react';
import Tip from '../_components/Tip';
import { Bar, Gauge, Sparkline } from '../_components/Charts';
import { displayOrg, OrgMark } from '../_components/PublicDemo';
import { ALERTS, CHECKLIST, FOUND_HISTORY, RUNS, SOURCES, TOTALS } from '../_lib/adminData';

function Stat({ label, value, chip, hint }: { label: string; value: string | number; chip?: { text: string; tone?: 'sage' | 'amber' | 'red' }; hint: string }) {
  return (
    <Tip label={hint}>
      <div className="dj-card flex w-full flex-col gap-1 p-4">
        <span className="dj-muted">{label}</span>
        <div className="flex items-end gap-2">
          <span className="dj-number">{value}</span>
          {chip && (
            <span className="dj-chip mb-1" data-tone={chip.tone}>
              {chip.text}
            </span>
          )}
        </div>
      </div>
    </Tip>
  );
}

const STATUS_TONE: Record<string, 'sage' | 'amber' | 'red'> = { ok: 'sage', partial: 'amber', failed: 'red' };

export default function DemoAdminDashboard() {
  const unicef = SOURCES.find((s) => s.id === 'unicef');
  const failed7d = RUNS.filter((r) => r.status === 'failed').length;
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-4 pb-24 pt-6 lg:px-8 lg:pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="dj-muted" style={{ margin: 0 }}>
            Tuesday, 20 October 2026
          </p>
          <h1 className="dj-display" style={{ margin: 0 }}>
            Dashboard
          </h1>
        </div>
        <span className="dj-chip">Demo data from the ledger, 20 Oct 2026</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Shown publicly" value={TOTALS.shownPublicly} chip={{ text: `+${TOTALS.addedOn19Oct} on 19 Oct`, tone: 'sage' }} hint={`Active jobs visible on the site. All rows: ${TOTALS.allRows}; active: ${TOTALS.active}.`} />
        <Stat label="Sources live" value={SOURCES.length} chip={{ text: '1 partial', tone: 'amber' }} hint="UNICEF reads 6 of about 11 pages" />
        <Stat label="Crawls, last 7 days" value={RUNS.length} chip={{ text: `${failed7d} failed`, tone: 'red' }} hint="Both failures were page-1 timeouts; the next crawl succeeded" />
        <Stat label="Rejected, last crawls" value={20} chip={{ text: 'ICRC' }} hint="Non-job links on the ICRC listing, correctly rejected" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <section className="dj-card flex flex-col gap-3 p-4 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="dj-title" style={{ margin: 0 }}>
              Source health
            </h2>
            <Tip label="Open Sources">
              <Link href="/demo/admin/sources" className="dj-icon-btn" aria-label="Open Sources">
                <ArrowUpRight size={14} strokeWidth={1.8} />
              </Link>
            </Tip>
          </div>
          {SOURCES.map((s) => (
            <div key={s.id} className="flex items-center gap-3">
              <OrgMark name={s.org} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate" style={{ fontWeight: 600 }}>
                  {displayOrg(s.org)}
                </div>
                <div className="dj-faint truncate">Last crawl {s.lastCrawl}</div>
                <div className="mt-1.5">
                  <Bar pct={s.health} />
                </div>
              </div>
              <Sparkline values={FOUND_HISTORY[s.id] ?? []} label={`${displayOrg(s.org)}: jobs found per crawl`} />
            </div>
          ))}
        </section>

        <section className="dj-card flex flex-col items-center gap-2 p-4">
          <div className="flex w-full items-center justify-between">
            <h2 className="dj-title" style={{ margin: 0 }}>
              Listing completeness
            </h2>
            <span className="dj-chip">UNICEF</span>
          </div>
          {unicef && unicef.expected && (
            <>
              <Gauge value={unicef.found} total={unicef.expected} />
              <div className="-mt-12 text-center">
                <div className="dj-number">{Math.round((unicef.found / unicef.expected) * 100)}%</div>
                <div className="dj-muted">
                  {unicef.found} of {unicef.expected} jobs read
                </div>
              </div>
              <p className="dj-faint mt-2 text-center" style={{ margin: 0 }}>
                {unicef.note} Only UNICEF reports completeness today.
              </p>
            </>
          )}
        </section>

        <section className="dj-card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="dj-title" style={{ margin: 0 }}>
              Upcoming crawls
            </h2>
            <CalendarClock size={15} strokeWidth={1.8} className="dj-faint" />
          </div>
          {SOURCES.map((s) => (
            <div key={s.id} className="flex items-center gap-3">
              <div className="w-[88px] shrink-0" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {s.nextCrawl ?? '—'}
              </div>
              <div className="min-w-0 flex-1 border-l pl-3 dj-hair">
                <div className="truncate">{displayOrg(s.org)}</div>
                <div className="dj-faint">{s.nextCrawl ? `${s.schedule} · UTC` : `${s.schedule} · next time not read in the review`}</div>
              </div>
            </div>
          ))}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <section className="dj-card flex flex-col gap-1 p-4 lg:col-span-2">
          <h2 className="dj-title" style={{ margin: '0 0 6px' }}>
            Recent crawls
          </h2>
          {RUNS.slice(0, 7).map((r, i) => (
            <div key={`${r.source}-${r.when}-${i}`} className="dj-row" style={{ cursor: 'default' }}>
              <OrgMark name={r.source} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span style={{ fontWeight: 600 }}>{r.source}</span>
                  <span className="dj-faint">{r.when}</span>
                </div>
                <div className="dj-muted truncate">{r.message}</div>
              </div>
              <span className="hidden sm:inline-flex">
                <Tip label={`${r.inserted} inserted, ${r.updated} updated`}>
                  <span className="dj-chip" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    +{r.inserted} · ~{r.updated}
                  </span>
                </Tip>
              </span>
              <span className="dj-chip" data-tone={STATUS_TONE[r.status]}>
                {r.status}
              </span>
            </div>
          ))}
        </section>

        <div className="flex flex-col gap-3">
          <section className="dj-card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between">
              <h2 className="dj-title" style={{ margin: 0 }}>
                Adding a source
              </h2>
              <span className="dj-chip">0/4</span>
            </div>
            <p className="dj-muted" style={{ margin: 0 }}>
              Next: Médecins Sans Frontières (W-08)
            </p>
            {CHECKLIST.map((c) => (
              <div key={c.step} className="flex items-center gap-2">
                {c.done ? <Check size={15} style={{ color: 'var(--sage-7)' }} /> : <Circle size={15} className="dj-faint" />}
                <span>{c.step}</span>
              </div>
            ))}
          </section>
          <section className="dj-card flex flex-col gap-2 p-4">
            <h2 className="dj-title" style={{ margin: 0 }}>
              Alerts
            </h2>
            {ALERTS.map((a) => (
              <div key={a.text} className="flex items-start gap-2">
                {a.tone === 'red' ? (
                  <AlertTriangle size={14} style={{ color: 'var(--red)', marginTop: 2 }} />
                ) : (
                  <Clock size={14} style={{ color: 'var(--amber)', marginTop: 2 }} />
                )}
                <span>{a.text}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
