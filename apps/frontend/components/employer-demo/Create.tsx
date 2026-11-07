'use client';

import { ArrowLeft, ArrowRight, FileText, History, ListTree, Maximize2, MessagesSquare, Minimize2, MoreHorizontal, UserCheck, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useIsPhone } from '@/components/site/BottomSheet';
import Tip from '@/components/site/Tip';
import { approvalRequired, approvedFor, downloadCopy, isReviewable, updateBaseFromJob } from './actions';
import { changesSince, changeSummary, tellOffer } from './changes';
import CreateEntry, { OPEN_CHAT_KEY } from './CreateEntry';
import { ChatPanel, DocumentView, openChecks, TitleEditor } from './DocPane';
import FactBar from './FactBar';
import { statusLine } from './Home';
import { DeleteDialog } from './JobActions';
import { LangDoc, LangSwitch } from './LangDoc';
import MenuButton from './MenuButton';
import { ReviewDialog, ReviewPanel, VersionsDialog } from './Review';
import { go, goBack, useDemo } from './store';
import Structure from './Structure';
import { LANGS } from './translate';
import type { Lang } from './types';
import { Dialog, Steps } from './ui';

const SPLIT_KEY = 'aidjobs.employerDemo.split';
const PANEL_KEY = 'aidjobs.employerDemo.panel';
type Panel = 'outline' | 'chat' | 'review' | null;

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
    return v === 'chat' || v === 'outline' || v === 'review' ? v : v === 'none' ? null : 'outline';
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
  const [sheet, setSheet] = useState<'outline' | 'chat' | 'review' | null>(() => (phone && openChatOnce() ? 'chat' : null));
  const [chatFull, setChatFull] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [langPick, setDocLang] = useState<Lang | null>(null);
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
  const docLang = langPick && job.translations?.[langPick] ? langPick : null;
  const shown: Panel = reviewing && panel === 'chat' ? 'review' : panel;
  const reviewerName = s.team.find((p) => p.id === s.reviewerAs)?.name;
  const reviewBadge = reviewing ? (job.review.reviewers.some((r) => r.name === reviewerName && !r.decision) ? 1 : 0) : job.review.remarks.filter((r) => r.state === 'open').length;
  const blocked = approvalRequired(s, job) && !approvedFor(s, job);
  const last = job.chat[job.chat.length - 1];
  const waiting = !reviewing && last?.from === 'ai' && last.ask ? 1 : 0;
  const checks = job.sections.length ? openChecks(job, s) : [];
  const setPanel = (p: Panel) => {
    setPanelState(p);
    save(PANEL_KEY, p ?? 'none');
  };
  const toggle = (p: 'outline' | 'chat' | 'review') => setPanel(panel === p ? null : p);

  const actions = (
    <>
      {!phone && job.versions.length > 0 && (
        <Tip label="Earlier versions" side="bottom">
          <button type="button" className="aj-icon-btn" onClick={() => setVersionsOpen(true)} aria-label="Earlier versions">
            <History size={15} strokeWidth={1.8} />
          </button>
        </Tip>
      )}
      {!phone && !reviewing && job.sections.length > 0 && isReviewable(job) && (
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
            ...(phone && job.sections.length && isReviewable(job) ? [{ label: job.review.state === 'none' ? 'Send for review' : 'Review again', run: () => setReviewOpen(true) }] : []),
            ...(job.sections.length ? [{ label: 'Download a copy', run: () => downloadCopy(job, s.org.name) }] : []),
            ...(job.sections.length >= 3 ? [{ label: 'Update our base JD format from this job', run: () => updateBaseFromJob(job.id) }] : []),
            { label: 'Delete', danger: true, run: () => setDeleteOpen(true) },
          ]}
        />
      )}
      {!reviewing && job.sections.length > 0 && isReviewable(job) && (
        <Tip label={blocked ? 'Next: check, send for review (approval is required), and publish' : checks.length ? `Next: check and publish. To look at: ${checks.join('; ')}.` : 'Next: check and publish'} side="bottom">
          <button type="button" className="ej-soft-btn" onClick={() => go('publish', job.id)}>
            {phone ? 'Next' : 'Next: check and publish'} <ArrowRight size={13} strokeWidth={2} />
            {checks.length > 0 && <span className="ej-count-badge">{checks.length}</span>}
          </button>
        </Tip>
      )}
      {(job.status === 'live' || job.status === 'scheduled') && (
        <button type="button" className="ej-soft-btn" onClick={() => go('jobs', job.id)}>
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
        <Tip label="Back" side="bottom">
          <button type="button" className="aj-icon-btn" onClick={() => goBack('create')} aria-label="Back">
            <ArrowLeft size={15} strokeWidth={1.8} />
          </button>
        </Tip>
        {titleLabel}
        {phone ? (
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <button type="button" className="aj-icon-btn" onClick={() => setSheet('outline')} aria-label="JD outline">
              <ListTree size={15} strokeWidth={1.8} />
            </button>
            <button type="button" className="aj-icon-btn relative" onClick={() => setSheet('review')} aria-label={reviewBadge ? `Review, ${reviewBadge} waiting` : 'Review'}>
              <UserCheck size={15} strokeWidth={1.8} />
              {reviewBadge ? <span className="ej-rail-badge">{reviewBadge}</span> : null}
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
      {(phone || !shown || (!reviewing && isReviewable(job))) && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-2 lg:px-6">
          <span className="aj-faint min-w-0 flex-1" style={{ fontSize: 11 }}>
            {(phone || !shown) && statusLine(s, job)}
          </span>
          {!reviewing && isReviewable(job) && <Steps current={1} />}
        </div>
      )}
      {job.sections.length > 0 && LANGS.some((l) => job.translations?.[l.key]) && (
        <div className="shrink-0 px-3 pt-2 lg:px-5">
          <LangSwitch job={job} current={docLang} onPick={setDocLang} />
        </div>
      )}
      <div className="aj-scroll flex min-h-0 flex-1 flex-col gap-3 px-4 py-3 lg:px-6">
        {job.status === 'live' && changesSince(job).length > 0 && (
          <div className="aj-card flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" role="status" aria-label="Changed since publishing">
            <span className="min-w-0 flex-1">
              <strong>Changed since publishing:</strong> <span className="aj-muted">{changeSummary(changesSince(job))}</span>
            </span>
            {tellOffer(job) && !reviewing && (
              <button type="button" className="aj-text-btn" onClick={() => go('jobs', job.id)}>
                Tell the people Reach invited
              </button>
            )}
          </div>
        )}
        {job.sections.length && docLang ? (
          <LangDoc job={job} lang={docLang} readOnly={reviewing} />
        ) : job.sections.length ? (
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
        {job.sections.length > 0 && !reviewing && isReviewable(job) && (
          <section className="aj-card flex flex-col gap-2 p-4" aria-label="Next step">
            <span className="aj-section-label" style={{ padding: 0 }}>
              Next: check and publish
            </span>
            {checks.length > 0 && <span>Still to look at: {checks.join('; ')}.</span>}
            <span className="aj-muted">
              Check your job against similar ones, add language versions, {approvalRequired(s, job) && !approvedFor(s, job) ? 'send it for review (approval is required before publishing)' : 'send it for review if you want'}, and choose how to publish.
            </span>
            <button type="button" className="aj-ink-btn self-start" onClick={() => go('publish', job.id)}>
              Next: check and publish <ArrowRight size={14} strokeWidth={2} />
            </button>
          </section>
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
        {sheet === 'review' && (
          <Dialog title="Review" subtitle={statusLine(s, job)} onClose={() => setSheet(null)}>
            <ReviewPanel
              job={job}
              s={s}
              onSend={() => {
                setSheet(null);
                setReviewOpen(true);
              }}
            />
          </Dialog>
        )}
        {reviewOpen && <ReviewDialog job={job} s={s} onClose={() => setReviewOpen(false)} />}
        {versionsOpen && <VersionsDialog job={job} readOnly={reviewing} onClose={() => setVersionsOpen(false)} />}
        {deleteOpen && <DeleteDialog job={job} s={s} onClose={() => setDeleteOpen(false)} onDeleted={() => go('create')} />}
      </div>
    );
  }

  const showChat = shown === 'chat';
  const panelName = shown === 'chat' ? 'Chat with AidJobs' : shown === 'review' ? 'Review' : 'JD outline';
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
            aria-label={`Resize the ${shown === 'chat' ? 'chat' : shown === 'review' ? 'review panel' : 'JD outline'}`}
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
          <aside className="flex min-h-0 min-w-[300px] flex-1 flex-col border-l aj-hair" style={{ background: 'var(--surface)' }} aria-label={panelName}>
            <div className="flex shrink-0 items-center gap-1.5 px-3 pt-2.5">
              <div className="ej-switch" role="group" aria-label="Show">
                <button type="button" className="ej-switch-btn" aria-pressed={shown === 'outline'} onClick={() => setPanel('outline')}>
                  <ListTree size={14} strokeWidth={1.8} /> JD outline · {job.tags.length}
                </button>
                {!reviewing && (
                  <button type="button" className="ej-switch-btn" aria-pressed={shown === 'chat'} onClick={() => setPanel('chat')}>
                    <MessagesSquare size={14} strokeWidth={1.8} /> Chat
                    {waiting && shown !== 'chat' ? <span className="ej-rail-badge static">1</span> : null}
                  </button>
                )}
                <button type="button" className="ej-switch-btn" aria-pressed={shown === 'review'} onClick={() => setPanel('review')}>
                  <UserCheck size={14} strokeWidth={1.8} /> Review
                  {reviewBadge && shown !== 'review' ? <span className="ej-rail-badge static">{reviewBadge}</span> : null}
                </button>
              </div>
              <Tip label="Close this panel" side="bottom" className="ml-auto">
                <button type="button" className="aj-icon-btn" style={{ width: 30, height: 30 }} onClick={() => setPanel(null)} aria-label="Close this panel">
                  <X size={14} strokeWidth={1.8} />
                </button>
              </Tip>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 border-b px-3 pb-2 pt-2 aj-hair">
              <span className="aj-faint min-w-0 flex-1 truncate" style={{ fontSize: 11 }}>
                {statusLine(s, job)}
              </span>
              {actions}
            </div>
            <div className={shown === 'review' ? 'aj-scroll min-h-0 flex-1' : 'min-h-0 flex-1'}>
              {showChat ? <ChatPanel job={job} s={s} autoFocus /> : shown === 'review' ? <ReviewPanel job={job} s={s} onSend={() => setReviewOpen(true)} /> : <Structure job={job} s={s} bare />}
            </div>
          </aside>
        </>
      )}
      {!shown && (
      <nav className="ej-rail" aria-label="Panels">
        <RailButton icon={<ListTree size={17} strokeWidth={1.8} />} label="JD outline" active={shown === 'outline'} onClick={() => toggle('outline')} />
        {!reviewing && <RailButton icon={<MessagesSquare size={17} strokeWidth={1.8} />} label="Chat" active={shown === 'chat'} badge={waiting} onClick={() => toggle('chat')} />}
        <RailButton icon={<UserCheck size={17} strokeWidth={1.8} />} label="Review" active={shown === 'review'} badge={reviewBadge} onClick={() => toggle('review')} />
      </nav>
      )}
      {reviewOpen && <ReviewDialog job={job} s={s} onClose={() => setReviewOpen(false)} />}
      {versionsOpen && <VersionsDialog job={job} readOnly={reviewing} onClose={() => setVersionsOpen(false)} />}
      {deleteOpen && <DeleteDialog job={job} s={s} onClose={() => setDeleteOpen(false)} onDeleted={() => go('create')} />}
    </div>
  );
}
