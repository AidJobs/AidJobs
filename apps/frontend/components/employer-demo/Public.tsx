'use client';

import { BadgeCheck, Building2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import Flag from '@/components/site/Flag';
import { daysUntil } from './engine';
import { JobPage } from './Publish';
import { PUBLIC_SAMPLES } from './sample';
import { useDemo } from './store';
import type { DemoJob, State } from './types';
import { DemoMark, Dialog, OrgMark } from './ui';

type Card = { id: string; org: string; title: string; place: string; iso: string; days: number; premium: boolean; own?: DemoJob };

function DaysChip({ days }: { days: number }) {
  return (
    <span className="aj-chip" data-tone={days <= 3 ? 'red' : days <= 7 ? 'amber' : undefined}>
      {days === 0 ? 'Today' : `${days}d`}
    </span>
  );
}

function JobCard({ c, highlight, onOpen }: { c: Card; highlight?: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`${highlight ? 'ej-premium ' : ''}aj-card flex w-full items-center gap-3 p-3 text-left`} style={{ cursor: 'pointer' }} onClick={onOpen}>
      <OrgMark name={c.org} />
      <div className="min-w-0 flex-1">
        <div style={{ fontWeight: 650, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.title}</div>
        <div className="aj-muted flex items-center gap-1.5 truncate">
          <span className="truncate">{c.org}</span>
          <span className="aj-faint">·</span>
          <Flag iso={c.iso} title={c.place} />
          <span className="truncate">{c.place}</span>
        </div>
      </div>
      {highlight && (
        <span className="aj-chip shrink-0" style={{ background: 'var(--ink)', color: 'var(--on-ink)' }}>
          Sponsored
        </span>
      )}
      <DaysChip days={c.days} />
    </button>
  );
}

function cards(s: State): Card[] {
  const own: Card[] = s.jobs
    .filter((j) => j.status === 'live' && j.facts.deadline)
    .map((j) => ({ id: j.id, org: s.org.name, title: j.facts.title, place: j.facts.location, iso: j.facts.iso, days: daysUntil(s.today, j.facts.deadline), premium: j.plan === 'premium', own: j }));
  return [...own, ...PUBLIC_SAMPLES].sort((a, b) => a.days - b.days);
}

export default function Public({ id }: { id?: string }) {
  const s = useDemo();
  const [tab, setTab] = useState<'list' | 'org'>(id === 'org' ? 'org' : 'list');
  const [open, setOpen] = useState<string | null>(id && id !== 'org' ? id : null);
  const all = cards(s);
  const premium = all.filter((c) => c.premium);
  const openCard = all.find((c) => c.id === open);
  const ownOpen = open ? s.jobs.find((j) => j.id === open) : undefined;

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-4 py-5 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="aj-display aj-h1" style={{ margin: 0 }}>
          On AidJobs
        </h1>
        <DemoMark label="Demo · sample jobs from fictional organisations" />
      </div>
      <div className="aj-switch self-start" role="radiogroup" aria-label="View">
        <button type="button" role="radio" aria-checked={tab === 'list'} data-active={tab === 'list'} onClick={() => setTab('list')}>
          Job list
        </button>
        <button type="button" role="radio" aria-checked={tab === 'org'} data-active={tab === 'org'} onClick={() => setTab('org')}>
          Organisation page
        </button>
      </div>

      {tab === 'list' ? (
        <>
          {premium.length > 0 && (
            <section className="flex flex-col gap-2" aria-label="Premium jobs">
              <div className="flex items-center gap-2">
                <Sparkles size={14} strokeWidth={1.8} style={{ color: 'var(--sage-7)' }} />
                <h2 className="aj-section-label" style={{ padding: 0, margin: 0 }}>
                  Premium · sponsored by employers
                </h2>
              </div>
              <div className="flex flex-col gap-2">
                {premium.map((c) => (
                  <JobCard key={`p-${c.id}`} c={c} highlight onOpen={() => setOpen(c.id)} />
                ))}
              </div>
              <span className="aj-faint" style={{ fontSize: 11 }}>
                Sponsored listings are paid for by the employer and shown here, apart from the list below. The list&apos;s order is the same for every visitor and is not changed by payment.
              </span>
            </section>
          )}
          <section className="flex flex-col gap-2" aria-label="All jobs">
            <h2 className="aj-section-label" style={{ padding: 0, margin: 0 }}>
              All jobs · soonest deadline first
            </h2>
            {all.map((c) => (
              <JobCard key={c.id} c={c} onOpen={() => setOpen(c.id)} />
            ))}
          </section>
        </>
      ) : (
        <section className="flex flex-col gap-4" aria-label="Organisation page">
          <div className="aj-card flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <OrgMark name={s.org.name} size={44} />
              <div className="min-w-0">
                <div className="flex items-center gap-2" style={{ fontWeight: 700, fontSize: 16 }}>
                  {s.org.name}
                  {s.org.verified && <BadgeCheck size={16} strokeWidth={2} style={{ color: 'var(--sage-7)' }} aria-label="Verified employer" />}
                </div>
                <div className="aj-muted inline-flex items-center gap-1">
                  <Building2 size={12} strokeWidth={1.8} /> {s.org.type} · {s.org.hq}
                </div>
              </div>
            </div>
            <p style={{ margin: 0 }}>{s.org.about}</p>
            <div className="flex flex-wrap gap-1.5">
              {s.org.sectors.map((x) => (
                <span key={x} className="aj-chip">
                  {x}
                </span>
              ))}
              {s.org.sdgs.map((g) => (
                <span key={g} className="aj-chip" data-tone="sage">
                  SDG {g}
                </span>
              ))}
            </div>
            <span className="aj-faint" style={{ fontSize: 11 }}>
              Managed by {s.org.name} on AidJobs · verified by its email domain
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {all
              .filter((c) => c.own)
              .sort((a, b) => Number(b.premium) - Number(a.premium))
              .map((c) => (
                <JobCard key={c.id} c={c} highlight={c.premium} onOpen={() => setOpen(c.id)} />
              ))}
          </div>
        </section>
      )}

      {open && (ownOpen || openCard) && (
        <Dialog title={ownOpen ? ownOpen.facts.title : (openCard?.title ?? '')} subtitle={ownOpen ? s.org.name : openCard?.org} onClose={() => setOpen(null)} wide>
          {ownOpen ? (
            <JobPage job={ownOpen} s={s} />
          ) : (
            <p className="aj-muted">A sample job from another fictional organisation, to show the list. Its page is not part of this demo.</p>
          )}
        </Dialog>
      )}
    </div>
  );
}
