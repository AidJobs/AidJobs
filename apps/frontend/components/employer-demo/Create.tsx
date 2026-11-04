'use client';

import { ArrowLeft, FileText, History, ListTree, MessagesSquare, MoreHorizontal, PanelRightClose, PanelRightOpen, UserCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useIsPhone } from '@/components/site/BottomSheet';
import Tip from '@/components/site/Tip';
import { approvalRequired, deleteDraft, downloadCopy, isApproved } from './actions';
import CreateEntry from './CreateEntry';
import { ChatHistory, ChatLine, ChecksBar, DocumentView, ReviewArea, TitleEditor } from './DocPane';
import FactBar from './FactBar';
import { statusLine } from './Home';
import MenuButton from './MenuButton';
import { ReviewDialog, VersionsDialog } from './Review';
import { go, useDemo } from './store';
import Structure from './Structure';
import { Dialog } from './ui';

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

function goToTitle() {
  const el = document.getElementById('ej-title-edit');
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el?.focus();
}

export default function Create({ id }: { id?: string }) {
  const s = useDemo();
  const phone = useIsPhone();
  const job = id ? s.jobs.find((j) => j.id === id) : undefined;
  const [split, setSplit] = useState(() => readNumber(SPLIT_KEY, 62));
  const [panelOpen, setPanelOpen] = useState(() => readBool(PANEL_KEY, true));
  const [dragging, setDragging] = useState(false);
  const [sheet, setSheet] = useState<'outline' | 'chat' | null>(null);
  const [tab, setTab] = useState<'outline' | 'chat'>('outline');
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
  const seeChat = () => {
    if (phone) setSheet('chat');
    else {
      togglePanel(true);
      setTab('chat');
    }
  };
  const onTyping = () => {
    if (!phone && panelOpen) setTab('chat');
  };

  const actions = (
    <>
      {!phone && job.versions.length > 0 && (
        <Tip label="Earlier versions">
          <button type="button" className="aj-icon-btn" onClick={() => setVersionsOpen(true)} aria-label="Earlier versions">
            <History size={15} strokeWidth={1.8} />
          </button>
        </Tip>
      )}
      {!phone && !reviewing && job.sections.length > 0 && job.status !== 'live' && (
        <Tip label={job.review.state === 'none' ? 'Send for review (optional)' : 'Review again'}>
          <button type="button" className="aj-icon-btn" onClick={() => setReviewOpen(true)} aria-label="Send for review">
            <UserCheck size={15} strokeWidth={1.8} />
          </button>
        </Tip>
      )}
      {!reviewing && job.status !== 'live' && job.status !== 'closed' && (
        <MenuButton
          label="More actions for this job draft"
          trigger={<MoreHorizontal size={15} strokeWidth={1.8} />}
          actions={[
            ...(phone && job.versions.length ? [{ label: 'Earlier versions', run: () => setVersionsOpen(true) }] : []),
            ...(phone && job.sections.length ? [{ label: job.review.state === 'none' ? 'Send for review' : 'Review again', run: () => setReviewOpen(true) }] : []),
            ...(job.sections.length ? [{ label: 'Download a copy', run: () => downloadCopy(job, s.org.name) }] : []),
            {
              label: job.status === 'review' || job.status === 'approved' ? 'Withdraw from review and delete' : 'Delete job draft',
              danger: true,
              run: () => {
                deleteDraft(job.id);
                go('create');
              },
            },
          ]}
        />
      )}
      {!reviewing && job.sections.length > 0 && job.status !== 'live' && (
        <Tip label={blocked ? 'Approval is required before publishing' : 'Choose Standard or Premium, then publish'}>
          <button type="button" className="aj-ink-btn" onClick={() => go('publish', job.id)}>
            {blocked ? 'Publish…' : 'Publish'}
          </button>
        </Tip>
      )}
      {job.status === 'live' && (
        <button type="button" className="aj-ink-btn" onClick={() => go('jobs', job.id)}>
          Done
        </button>
      )}
    </>
  );

  const titleLabel = (
    <Tip label={job.facts.title ? `${job.facts.title}. Click to edit it in the job description.` : 'Add a job title in the job description'} side="bottom" className="min-w-0">
      <button type="button" className="ej-title-label" onClick={goToTitle}>
        {job.facts.title || 'Untitled job'}
      </button>
    </Tip>
  );

  const docPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 aj-hair lg:px-4">
        <Tip label="Back to Create a job" side="bottom">
          <button type="button" className="aj-icon-btn" onClick={() => go('create')} aria-label="Back to Create a job">
            <ArrowLeft size={15} strokeWidth={1.8} />
          </button>
        </Tip>
        {titleLabel}
        {phone ? (
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <button type="button" className="aj-icon-btn" onClick={() => setSheet('outline')} aria-label="JD outline">
              <ListTree size={15} strokeWidth={1.8} />
            </button>
            {!reviewing && (
              <button type="button" className="aj-icon-btn" onClick={() => setSheet('chat')} aria-label="Chat">
                <MessagesSquare size={15} strokeWidth={1.8} />
              </button>
            )}
            {actions}
          </span>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <FactBar job={job} s={s} />
            </div>
            {!panelOpen && <span className="flex shrink-0 items-center gap-1.5">{actions}</span>}
          </>
        )}
      </div>
      {phone && (
        <div className="shrink-0 border-b px-3 py-2 aj-hair">
          <FactBar job={job} s={s} />
        </div>
      )}
      {job.sections.length > 0 && (
        <div className="shrink-0 px-4 pt-2.5 lg:px-6">
          <ChecksBar job={job} s={s} />
        </div>
      )}
      <div className="aj-scroll flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3 pt-2.5 lg:px-6">
        <ReviewArea job={job} s={s} />
        {job.sections.length ? (
          <DocumentView job={job} s={s} onSeeChat={reviewing ? undefined : seeChat} />
        ) : (
          <div className="aj-card flex flex-col gap-2 p-5">
            <TitleEditor job={job} disabled={reviewing} />
            <div className="flex flex-col items-center gap-2 py-4 text-center aj-muted">
              <FileText size={22} strokeWidth={1.5} />
              Your job description appears here once it is written.
              <span className="aj-faint">Check the facts above and the JD outline, answer any question below, then write the job description.</span>
            </div>
          </div>
        )}
      </div>
      <div className="shrink-0 border-t px-4 py-2.5 aj-hair lg:px-6" style={{ background: 'var(--surface)' }}>
        <ChatLine job={job} s={s} onTyping={onTyping} />
      </div>
    </div>
  );

  if (phone) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {docPane}
        {sheet === 'outline' && (
          <Dialog title="JD outline" subtitle={`${job.tags.length} sections`} onClose={() => setSheet(null)}>
            <Structure job={job} s={s} bare />
          </Dialog>
        )}
        {sheet === 'chat' && (
          <Dialog title="Chat" subtitle={`${job.chat.length} messages`} onClose={() => setSheet(null)} half>
            <ChatHistory job={job} />
          </Dialog>
        )}
        {reviewOpen && <ReviewDialog job={job} s={s} onClose={() => setReviewOpen(false)} />}
        {versionsOpen && <VersionsDialog job={job} onClose={() => setVersionsOpen(false)} />}
      </div>
    );
  }

  return (
    <div ref={box} className="flex h-full min-h-0" style={{ userSelect: dragging ? 'none' : undefined }}>
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
            aria-label="Resize the JD outline"
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
          <aside className="flex min-h-0 min-w-[300px] flex-1 flex-col border-l aj-hair" style={{ background: 'var(--surface)' }}>
            <div className="flex shrink-0 items-center gap-1.5 px-3 pb-1 pt-2.5">
              <Tip label="Hide this panel" side="bottom">
                <button type="button" className="aj-icon-btn" onClick={() => togglePanel(false)} aria-label="Hide the JD outline and chat panel">
                  <PanelRightClose size={15} strokeWidth={1.8} />
                </button>
              </Tip>
              <span className="ml-auto flex items-center gap-1.5">{actions}</span>
            </div>
            <div className="aj-faint shrink-0 px-4 pb-2" style={{ fontSize: 11 }}>
              {statusLine(s, job)}
            </div>
            <div className="ej-tabs shrink-0" role="tablist" aria-label="JD outline and chat">
              <button type="button" role="tab" className="ej-tab" aria-selected={tab === 'outline'} onClick={() => setTab('outline')}>
                JD outline · {job.tags.length}
              </button>
              {!reviewing && (
                <button type="button" role="tab" className="ej-tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>
                  Chat · {job.chat.length}
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1" role="tabpanel">
              {tab === 'chat' && !reviewing ? (
                <div className="aj-scroll h-full">
                  <ChatHistory job={job} />
                </div>
              ) : (
                <Structure job={job} s={s} bare />
              )}
            </div>
          </aside>
        </>
      ) : (
        <div className="flex shrink-0 flex-col items-center border-l px-1 py-3 aj-hair" style={{ background: 'var(--surface)' }}>
          <Tip label="Show the JD outline and chat" side="left">
            <button type="button" className="aj-icon-btn" onClick={() => togglePanel(true)} aria-label="Show the JD outline">
              <PanelRightOpen size={15} strokeWidth={1.8} />
            </button>
          </Tip>
          <span className="mt-2 aj-faint" style={{ writingMode: 'vertical-rl', fontSize: 11, fontWeight: 600 }}>
            JD outline · {job.tags.length}
          </span>
        </div>
      )}
      {reviewOpen && <ReviewDialog job={job} s={s} onClose={() => setReviewOpen(false)} />}
      {versionsOpen && <VersionsDialog job={job} onClose={() => setVersionsOpen(false)} />}
    </div>
  );
}
