'use client';

import { ArrowLeft, FileText, History, ListTree, Maximize2, MessagesSquare, Minimize2, MoreHorizontal, UserCheck, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useIsPhone } from '@/components/site/BottomSheet';
import Tip from '@/components/site/Tip';
import { approvalRequired, deleteDraft, downloadCopy, isApproved } from './actions';
import CreateEntry, { OPEN_CHAT_KEY } from './CreateEntry';
import { ChatPanel, DocumentView, openChecks, ReviewArea, TitleEditor } from './DocPane';
import FactBar from './FactBar';
import { statusLine } from './Home';
import MenuButton from './MenuButton';
import { ReviewDialog, VersionsDialog } from './Review';
import { go, useDemo } from './store';
import Structure from './Structure';
import { Dialog } from './ui';

const SPLIT_KEY = 'aidjobs.employerDemo.split';
const PANEL_KEY = 'aidjobs.employerDemo.panel';
type Panel = 'outline' | 'chat' | null;

function readNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function openChatOnce(): boolean {
  try {
    return localStorage.getItem(OPEN_CHAT_KEY) === '1';
  } catch {
    return false;
  }
}

function readPanel(): Panel {
  try {
    if (openChatOnce()) return 'chat';
    const v = localStorage.getItem(PANEL_KEY);
    return v === 'chat' || v === 'outline' ? v : v === 'none' ? null : 'outline';
  } catch {
    return 'outline';
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

/** One labelled button on the right-hand rail: an icon and a full-strength name, with a badge when something waits. */
function RailButton({ icon, label, active, badge, onClick }: { icon: ReactNode; label: string; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button type="button" className="ej-rail-btn" data-active={active} aria-pressed={active} aria-label={badge ? `${label}, ${badge} waiting` : label} onClick={onClick}>
      <span className="relative">
        {icon}
        {badge ? <span className="ej-rail-badge">{badge}</span> : null}
      </span>
      <span>{label}</span>
    </button>
  );
}

export default function Create({ id }: { id?: string }) {
  const s = useDemo();
  const phone = useIsPhone();
  const job = id ? s.jobs.find((j) => j.id === id) : undefined;
  const [split, setSplit] = useState(() => readNumber(SPLIT_KEY, 62));
  const [panel, setPanelState] = useState<Panel>(readPanel);
  const [dragging, setDragging] = useState(false);
  const [sheet, setSheet] = useState<'outline' | 'chat' | null>(() => (phone && openChatOnce() ? 'chat' : null));
  const [chatFull, setChatFull] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.removeItem(OPEN_CHAT_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const b = box.current?.getBoundingClientRect();
      if (!b) return;
      const v = Math.min(75, Math.max(40, ((e.clientX - b.left) / b.width) * 100));
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
  const shown: Panel = reviewing && panel === 'chat' ? 'outline' : panel;
  const blocked = approvalRequired(s, job) && !(isApproved(job) || job.status === 'approved');
  const last = job.chat[job.chat.length - 1];
  const waiting = !reviewing && last?.from === 'ai' && last.ask ? 1 : 0;
  const checks = job.sections.length ? openChecks(job, s) : [];
  const setPanel = (p: Panel) => {
    setPanelState(p);
    save(PANEL_KEY, p ?? 'none');
  };
  const toggle = (p: 'outline' | 'chat') => setPanel(panel === p ? null : p);

  const actions = (
    <>
      {!phone && job.versions.length > 0 && (
        <Tip label="Earlier versions" side="bottom">
          <button type="button" className="aj-icon-btn" onClick={() => setVersionsOpen(true)} aria-label="Earlier versions">
            <History size={15} strokeWidth={1.8} />
          </button>
        </Tip>
      )}
      {!phone && !reviewing && job.sections.length > 0 && job.status !== 'live' && (
        <Tip label={job.review.state === 'none' ? 'Send for review (optional)' : 'Review again'} side="bottom">
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
        <Tip label={blocked ? 'Approval is required before publishing' : checks.length ? `To look at before publishing: ${checks.join('; ')}.` : 'Nothing to check. Choose Standard or Premium, then publish.'} side="bottom">
          <button type="button" className="aj-ink-btn" onClick={() => go('publish', job.id)}>
            {blocked ? 'Publish…' : 'Publish'}
            {checks.length > 0 && <span className="ej-count-badge">{checks.length}</span>}
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
              <button type="button" className="aj-icon-btn relative" onClick={() => setSheet('chat')} aria-label={waiting ? 'Chat, 1 question waiting' : 'Chat'}>
                <MessagesSquare size={15} strokeWidth={1.8} />
                {waiting ? <span className="ej-rail-badge">1</span> : null}
              </button>
            )}
            {actions}
          </span>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <FactBar job={job} s={s} />
            </div>
            {!shown && <span className="flex shrink-0 items-center gap-1.5">{actions}</span>}
          </>
        )}
      </div>
      {phone && (
        <div className="shrink-0 border-b px-3 py-2 aj-hair">
          <FactBar job={job} s={s} />
        </div>
      )}
      {(phone || !shown) && (
        <div className="aj-faint shrink-0 px-4 pt-2 lg:px-6" style={{ fontSize: 11 }}>
          {statusLine(s, job)}
        </div>
      )}
      <div className="aj-scroll flex min-h-0 flex-1 flex-col gap-3 px-4 py-3 lg:px-6">
        <ReviewArea job={job} s={s} />
        {job.sections.length ? (
          <DocumentView job={job} s={s} onSeeChat={reviewing ? undefined : () => (phone ? setSheet('chat') : setPanel('chat'))} />
        ) : (
          <div className="aj-card flex flex-col gap-2 p-5">
            <TitleEditor job={job} disabled={reviewing} />
            <div className="flex flex-col items-center gap-2 py-4 text-center aj-muted">
              <FileText size={22} strokeWidth={1.5} />
              Your job description appears here as soon as AidJobs knows the role.
              <span className="aj-faint">Add the job title above, or tell AidJobs in the chat.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (phone) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {docPane}
        {sheet === 'outline' && (
          <Dialog title="JD outline" subtitle={`${job.tags.length} sections`} onClose={() => setSheet(null)} half>
            <Structure job={job} s={s} bare />
          </Dialog>
        )}
        {sheet === 'chat' && (
          <Dialog title="Chat with AidJobs" onClose={() => setSheet(null)} half={!chatFull}>
            <div className="flex flex-col" style={{ height: chatFull ? '64dvh' : '42dvh' }}>
              <button type="button" className="aj-text-btn self-end" style={{ height: 26 }} onClick={() => setChatFull(!chatFull)}>
                {chatFull ? <Minimize2 size={13} strokeWidth={2} /> : <Maximize2 size={13} strokeWidth={2} />} {chatFull ? 'Half height' : 'Full height'}
              </button>
              <div className="min-h-0 flex-1">
                <ChatPanel job={job} s={s} />
              </div>
            </div>
          </Dialog>
        )}
        {reviewOpen && <ReviewDialog job={job} s={s} onClose={() => setReviewOpen(false)} />}
        {versionsOpen && <VersionsDialog job={job} onClose={() => setVersionsOpen(false)} />}
      </div>
    );
  }

  const showChat = shown === 'chat';
  return (
    <div ref={box} className="flex h-full min-h-0" style={{ userSelect: dragging ? 'none' : undefined }}>
      <div className="min-h-0 min-w-0" style={{ width: shown ? `${split}%` : undefined, flex: shown ? undefined : 1 }}>
        {docPane}
      </div>
      {shown && (
        <>
          <div
            className="aj-divider"
            data-dragging={dragging}
            role="separator"
            aria-orientation="vertical"
            aria-label={showChat ? 'Resize the chat' : 'Resize the JD outline'}
            aria-valuenow={Math.round(split)}
            aria-valuemin={40}
            aria-valuemax={75}
            tabIndex={0}
            onPointerDown={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                const v = Math.min(75, Math.max(40, split + (e.key === 'ArrowLeft' ? -2 : 2)));
                setSplit(v);
                save(SPLIT_KEY, String(v));
              }
            }}
          />
          <aside className="flex min-h-0 min-w-[300px] flex-1 flex-col border-l aj-hair" style={{ background: 'var(--surface)' }} aria-label={showChat ? 'Chat with AidJobs' : 'JD outline'}>
            <div className="flex shrink-0 items-center justify-end gap-1.5 px-3 pt-2.5">{actions}</div>
            <div className="aj-faint shrink-0 px-4 pt-1 text-right" style={{ fontSize: 11 }}>
              {statusLine(s, job)}
            </div>
            <div className="flex shrink-0 items-center gap-2 border-b px-4 pb-2 pt-2 aj-hair">
              <h2 className="aj-title" style={{ margin: 0, fontSize: 14 }}>
                {showChat ? 'Chat with AidJobs' : `JD outline · ${job.tags.length}`}
              </h2>
              <Tip label="Close this panel" side="bottom" className="ml-auto">
                <button type="button" className="aj-icon-btn" style={{ width: 28, height: 28 }} onClick={() => setPanel(null)} aria-label="Close this panel">
                  <X size={14} strokeWidth={1.8} />
                </button>
              </Tip>
            </div>
            <div className="min-h-0 flex-1">{showChat ? <ChatPanel job={job} s={s} autoFocus /> : <Structure job={job} s={s} bare />}</div>
          </aside>
        </>
      )}
      <nav className="ej-rail" aria-label="Panels">
        <RailButton icon={<ListTree size={17} strokeWidth={1.8} />} label="JD outline" active={shown === 'outline'} onClick={() => toggle('outline')} />
        {!reviewing && <RailButton icon={<MessagesSquare size={17} strokeWidth={1.8} />} label="Chat" active={shown === 'chat'} badge={waiting} onClick={() => toggle('chat')} />}
      </nav>
      {reviewOpen && <ReviewDialog job={job} s={s} onClose={() => setReviewOpen(false)} />}
      {versionsOpen && <VersionsDialog job={job} onClose={() => setVersionsOpen(false)} />}
    </div>
  );
}
