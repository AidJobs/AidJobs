'use client';

import { ArrowLeft, FileText, History, ListTree, PanelRightOpen, UserCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useIsPhone } from '@/components/site/BottomSheet';
import Tip from '@/components/site/Tip';
import { approvalRequired, isApproved, setFacts } from './actions';
import CreateEntry from './CreateEntry';
import { ChatDock, ChecksBar, DocumentView, ReviewArea } from './DocPane';
import FactBar from './FactBar';
import { statusLine } from './Home';
import { ReviewDialog, VersionsDialog } from './Review';
import { go, useDemo } from './store';
import Structure from './Structure';
import { Dialog, PlanBadge } from './ui';

const SPLIT_KEY = 'aidjobs.employerDemo.split';
const PANEL_KEY = 'aidjobs.employerDemo.structureOpen';

function readNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch {
    return fallback;
  }
}

function save(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* storage unavailable */
  }
}

export default function Create({ id }: { id?: string }) {
  const s = useDemo();
  const phone = useIsPhone();
  const job = id ? s.jobs.find((j) => j.id === id) : undefined;
  const [split, setSplit] = useState(() => readNumber(SPLIT_KEY, 62));
  const [panelOpen, setPanelOpen] = useState(() => readBool(PANEL_KEY, true));
  const [dragging, setDragging] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const b = box.current?.getBoundingClientRect();
      if (!b) return;
      const v = Math.min(75, Math.max(45, ((e.clientX - b.left) / b.width) * 100));
      setSplit(v);
      save(SPLIT_KEY, String(Math.round(v)));
    };
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging]);

  if (!id) return <CreateEntry />;
  if (!job) {
    return (
      <div className="mx-auto max-w-[560px] p-6">
        <p className="aj-muted">This job is not in the demo any more.</p>
        <button type="button" className="aj-ink-btn" onClick={() => go('create')}>
          Create a job
        </button>
      </div>
    );
  }

  const reviewing = Boolean(s.reviewerAs);
  const blocked = approvalRequired(s, job) && !(isApproved(job) || job.status === 'approved');
  const togglePanel = (v: boolean) => {
    setPanelOpen(v);
    save(PANEL_KEY, String(v));
  };

  const docPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-1.5 px-4 pb-2 pt-3 lg:px-6">
        <div className="flex items-center gap-2">
          <h2 className="aj-title" style={{ margin: 0, fontSize: 14 }}>
            Job description
          </h2>
          <span className="aj-faint" style={{ fontSize: 11 }}>
            {statusLine(s, job)}
          </span>
        </div>
        {job.sections.length > 0 && <ChecksBar job={job} s={s} />}
      </div>
      <div className="aj-scroll flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3 lg:px-6">
        <ReviewArea job={job} s={s} />
        {job.sections.length ? (
          <DocumentView job={job} s={s} />
        ) : (
          <div className="aj-card flex flex-col items-center gap-2 p-8 text-center aj-muted">
            <FileText size={22} strokeWidth={1.5} />
            The description appears here once it is written.
            <span className="aj-faint">Check the facts above and the outline in Structure, answer any question below, then write.</span>
          </div>
        )}
      </div>
      <div className="shrink-0 border-t px-4 py-3 aj-hair lg:px-6" style={{ background: 'var(--surface)' }}>
        <ChatDock job={job} s={s} />
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 aj-hair lg:px-4">
        <Tip label="Back to Create a job">
          <button type="button" className="aj-icon-btn" onClick={() => go('create')} aria-label="Back to Create a job">
            <ArrowLeft size={15} strokeWidth={1.8} />
          </button>
        </Tip>
        <input className="ej-title-input" value={job.facts.title} onChange={(e) => setFacts(job.id, { title: e.target.value })} placeholder="Job title" aria-label="Job title" disabled={reviewing} />
        {!phone && (
          <div className="min-w-0 flex-1">
            <FactBar job={job} s={s} />
          </div>
        )}
        <span className={phone ? 'ml-auto flex items-center gap-1.5' : 'flex shrink-0 items-center gap-1.5'}>
          {!phone && <PlanBadge plan={job.plan} />}
          {phone && (
            <button type="button" className="aj-icon-btn" onClick={() => setSheet(true)} aria-label="Structure">
              <ListTree size={15} strokeWidth={1.8} />
            </button>
          )}
          {job.versions.length > 0 && (
            <Tip label="Versions">
              <button type="button" className="aj-icon-btn" onClick={() => setVersionsOpen(true)} aria-label="Versions">
                <History size={15} strokeWidth={1.8} />
              </button>
            </Tip>
          )}
          {!reviewing && job.sections.length > 0 && job.status !== 'live' && (
            <Tip label={job.review.state === 'none' ? 'Send for review (optional)' : 'Review again'}>
              <button type="button" className="aj-icon-btn" onClick={() => setReviewOpen(true)} aria-label="Send for review">
                <UserCheck size={15} strokeWidth={1.8} />
              </button>
            </Tip>
          )}
          {!reviewing && job.sections.length > 0 && job.status !== 'live' && (
            <button type="button" className="aj-ink-btn" onClick={() => go('publish', job.id)} title={blocked ? 'Approval is required before publishing' : undefined}>
              {blocked ? 'Publish…' : 'Publish'}
            </button>
          )}
          {job.status === 'live' && (
            <button type="button" className="aj-ink-btn" onClick={() => go('jobs', job.id)}>
              Done
            </button>
          )}
        </span>
      </div>
      {phone && (
        <div className="shrink-0 border-b px-3 py-2 aj-hair">
          <FactBar job={job} s={s} />
        </div>
      )}

      {phone ? (
        <div className="min-h-0 flex-1">{docPane}</div>
      ) : (
        <div ref={box} className="flex min-h-0 flex-1" style={{ userSelect: dragging ? 'none' : undefined }}>
          <div className="min-h-0 min-w-0" style={{ width: panelOpen ? `${split}%` : '100%' }}>
            {docPane}
          </div>
          {panelOpen ? (
            <>
              <div
                className="aj-divider"
                data-dragging={dragging}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize the structure panel"
                aria-valuenow={Math.round(split)}
                tabIndex={0}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    const v = Math.min(75, Math.max(45, split + (e.key === 'ArrowLeft' ? -2 : 2)));
                    setSplit(v);
                    save(SPLIT_KEY, String(v));
                  }
                }}
              />
              <aside className="min-h-0 min-w-[280px] flex-1 border-l aj-hair" style={{ background: 'var(--surface)' }}>
                <Structure job={job} s={s} onCollapse={() => togglePanel(false)} />
              </aside>
            </>
          ) : (
            <div className="flex shrink-0 flex-col items-center border-l px-1 py-3 aj-hair" style={{ background: 'var(--surface)' }}>
              <Tip label="Show the structure panel" side="right">
                <button type="button" className="aj-icon-btn" onClick={() => togglePanel(true)} aria-label="Show the structure panel">
                  <PanelRightOpen size={15} strokeWidth={1.8} />
                </button>
              </Tip>
              <span className="mt-2 aj-faint" style={{ writingMode: 'vertical-rl', fontSize: 11, fontWeight: 600 }}>
                Structure · {job.tags.length}
              </span>
            </div>
          )}
        </div>
      )}

      {sheet && (
        <Dialog title="Structure" subtitle={`${job.tags.length} sections`} onClose={() => setSheet(false)}>
          <Structure job={job} s={s} />
        </Dialog>
      )}
      {reviewOpen && <ReviewDialog job={job} s={s} onClose={() => setReviewOpen(false)} />}
      {versionsOpen && <VersionsDialog job={job} onClose={() => setVersionsOpen(false)} />}
    </div>
  );
}
