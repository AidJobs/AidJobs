'use client';

import { Archive as ArchiveIcon, ArrowLeft } from 'lucide-react';
import Tip from '@/components/site/Tip';
import { statusLine } from './Home';
import { go, goBack, useDemo } from './store';

/**
 * The screens before round 7, archived (the user, 12 November 2026: "keep the old pages archived, and accessible in case we want to use
 * or refer to them later on"): the earlier workspace and the Check and publish page, fully working at their addresses on the same demo
 * data, and reached only from this page.
 */
export function ArchivedBanner({ id }: { id: string }) {
  return (
    <div className="ej-archived flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2" role="note" aria-label="Archived screen">
      <span className="inline-flex min-w-0 flex-1 items-center gap-1.5" style={{ fontWeight: 650 }}>
        <ArchiveIcon size={14} strokeWidth={1.8} aria-hidden /> Archived screen, kept for reference
      </span>
      <button type="button" className="aj-pill" style={{ height: 30 }} onClick={() => go('job', id)}>
        Open this job in the new window
      </button>
    </div>
  );
}

const PUBLISHABLE = ['draft', 'review', 'approved'];

export default function Archive() {
  const s = useDemo();
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-4 py-5 lg:px-8 lg:py-8">
      <div className="flex items-center gap-2">
        <Tip label="Back" side="bottom">
          <button type="button" className="aj-icon-btn" onClick={() => goBack('create')} aria-label="Back">
            <ArrowLeft size={15} strokeWidth={1.8} />
          </button>
        </Tip>
        <h1 className="aj-display aj-h1" style={{ margin: 0 }}>
          Archived screens
        </h1>
      </div>
      <span className="aj-muted">
        The job workspace and the Check and publish page from before round 7, kept for reference. They still work, on the same demo data: a change made in them shows in the new window too. Nothing else in the demo links to them.
      </span>
      <ul className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {s.jobs.map((j) => (
          <li key={j.id} className="aj-card flex flex-wrap items-center gap-2 p-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span style={{ fontWeight: 650 }}>{j.facts.title || 'Untitled job'}</span>
              <span className="aj-faint">
                {j.facts.location ? `${j.facts.location} · ` : ''}
                {statusLine(s, j)}
              </span>
            </span>
            <button type="button" className="aj-pill" onClick={() => go('create', j.id)} aria-label={`Earlier workspace: ${j.facts.title || 'untitled job'}`}>
              Earlier workspace
            </button>
            {PUBLISHABLE.includes(j.status) && (
              <button type="button" className="aj-pill" onClick={() => go('publish', j.id)} aria-label={`Check and publish: ${j.facts.title || 'untitled job'}`}>
                Check and publish
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
