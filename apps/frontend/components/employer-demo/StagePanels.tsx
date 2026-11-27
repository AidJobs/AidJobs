'use client';

import { AlertCircle, ArrowRight, CheckCircle2, Printer, Send, Sparkles, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { applyFix, isReviewable, leaveAmplifyPoint } from './actions';
import { approvalRequired, approvedFor } from './approval';
import { findInclusive, quality } from './engine';
import { amplifying, essentials, ESSENTIAL_WORDS, fullPoints, marketPoints, reachOpen } from './flow';
import type { FactKey } from './FactBar';
import { isPublished } from './lifecycle';
import { fullAdvertCheck, marketCheck, MIN_SIMILAR, type Point } from './market';
import { singlePrice, usd } from './plans';
import { PlanChoice, PublishCard, type Opener } from './PublishSteps';
import { ReachEditor } from './Reach';
import { ReviewColumn, ReviewForm, ReviewPanel } from './Review';
import type { AskKind, DemoJob, State } from './types';
import { radioKeys } from './ui';

export type WorkspaceStage = 'draft' | 'check' | 'review' | 'publish';
export type PublishSubTab = 'publish' | 'share';
export type ShareKind = 'flyer' | 'reach';

/** Maps legacy / AI part keys into one of the 4 unified workspace stages. */
export function stageFromPart(part: string): WorkspaceStage {
  if (part === 'check' || part === 'market' || part === 'full') return 'check';
  if (part === 'review') return 'review';
  if (part === 'publish' || part === 'plan' || part === 'flyer' || part === 'reach') return 'publish';
  return 'draft';
}

export function stageSummary(job: DemoJob, s: State) {
  const missing = essentials(job, s.org);
  const liveTitles = s.jobs.filter((j) => j.id !== job.id && (j.status === 'live' || j.status === 'scheduled')).map((j) => j.facts.title);
  const basic = quality(job.sections, job.facts, s.today, liveTitles);
  const basicOpen = basic.filter((q) => q.level === 'issue' || q.level === 'warn').length;
  const inclusiveHits = job.sections.reduce(
    (n, sec) =>
      n +
      sec.lines.reduce(
        (m, line) => m + findInclusive(line, job.format).filter((h) => !job.genuine[`${h.rule.id}:${sec.key}:${h.match.toLowerCase()}`]).length,
        0,
      ),
    0,
  );
  const market = marketCheck(job, s, job.publishOn ?? null);
  const full = fullAdvertCheck(job, s);
  const marketOpen = market.thin ? 0 : marketPoints(job, s).length;
  const fullOpen = full.thin ? 0 : fullPoints(job, s).length;
  const reviewRequired = approvalRequired(s, job);
  const reviewApproved = approvedFor(s, job);
  const openRemarks = job.review.remarks.filter((r) => r.state === 'open').length;
  return {
    missing,
    draftMissing: missing.length,
    checkIssues: basicOpen + inclusiveHits + marketOpen + fullOpen,
    basic,
    inclusiveHits,
    market,
    full,
    reviewRequired,
    reviewApproved,
    openRemarks,
  };
}

const FACT_FOR_ESSENTIAL: Partial<Record<AskKind, FactKey>> = {
  place: 'place',
  deadline: 'closes',
  contract: 'type',
};

function AmplifyPointRow({
  job,
  p,
  kind,
  readOnly,
  onAskAi,
}: {
  job: DemoJob;
  p: Point;
  kind: 'market' | 'full';
  readOnly: boolean;
  onAskAi: (prompt: string) => void;
}) {
  const left = Boolean(job.walk?.settled.includes(`${kind}:${p.key}`));
  const ok = p.ok || left;
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-start gap-2">
        {ok ? (
          <CheckCircle2 size={14} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: 'var(--sage-7)' }} />
        ) : (
          <AlertCircle size={14} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: 'var(--amber)' }} />
        )}
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: 13, fontWeight: 550 }}>{p.title}</div>
          {p.detail && (
            <div className="aj-faint" style={{ fontSize: 12 }}>
              {p.detail}
            </div>
          )}
        </div>
      </div>
      {!readOnly && !ok && (
        <div className="flex flex-wrap items-center gap-1.5 pl-6">
          {p.fix ? (
            <button type="button" className="aj-pill" style={{ height: 28, fontSize: 12 }} onClick={() => applyFix(job.id, p.fix!.fix, p.fix!.label)}>
              {p.fix.label}
            </button>
          ) : (
            <button
              type="button"
              className="aj-pill"
              style={{ height: 28, fontSize: 12 }}
              onClick={() => onAskAi(`Please fix this check in the job description: ${p.title}`)}
            >
              <Sparkles size={12} strokeWidth={1.8} /> Ask AI to rewrite
            </button>
          )}
          <button type="button" className="aj-text-btn" style={{ height: 28, fontSize: 12 }} onClick={() => leaveAmplifyPoint(job.id, kind, p.key)}>
            Leave as is
          </button>
        </div>
      )}
    </li>
  );
}

/** Stage 2 Left pane: Basic checks + previewable Amplify Market & Full advert checks (never dead-ends to Publish). */
export function CheckStagePanel({
  job,
  s,
  onAskAi,
  onOpenFact,
  onOpenApply,
  onScrollSection,
  onNext,
}: {
  job: DemoJob;
  s: State;
  onAskAi: (prompt: string) => void;
  onOpenFact: (k: FactKey) => void;
  onOpenApply: () => void;
  onScrollSection: (secKey: string) => void;
  onNext: () => void;
}) {
  const sum = stageSummary(job, s);
  const readOnly = Boolean(s.reviewerAs);
  const single = singlePrice(s);
  const inclusiveItems = job.sections.flatMap((sec) =>
    sec.lines.flatMap((line) =>
      findInclusive(line, job.format)
        .filter((h) => !job.genuine[`${h.rule.id}:${sec.key}:${h.match.toLowerCase()}`])
        .map((h) => ({ section: sec.key, title: sec.title, match: h.match, why: h.rule.why, alt: h.rule.alt })),
    ),
  );
  const nextLabel = sum.reviewRequired ? 'Next: Review' : 'Next: Publish';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="aj-scroll flex min-h-0 flex-1 flex-col gap-3 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Checks</div>
            <div className="aj-faint" style={{ fontSize: 12 }}>
              {sum.checkIssues === 0 ? 'Everything looks ready.' : `${sum.checkIssues} ${sum.checkIssues === 1 ? 'item' : 'items'} to review.`}
            </div>
          </div>
        </div>

        {/* Basic quality + essentials */}
        <section className="aj-card flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="ej-panel-label">Basic check</span>
            <span className="aj-chip" data-tone={sum.basic.some((q) => q.level === 'issue' || q.level === 'warn') || inclusiveItems.length ? 'amber' : 'sage'}>
              Free
            </span>
          </div>
          {sum.basic.length === 0 && inclusiveItems.length === 0 ? (
            <div className="flex items-center gap-2" style={{ fontSize: 13 }}>
              <CheckCircle2 size={14} strokeWidth={2} style={{ color: 'var(--sage-7)' }} />
              <span>All basic facts, placeholders, and inclusive wording look clear.</span>
            </div>
          ) : (
            <ul className="ej-divide flex flex-col" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {sum.basic.map((item) => (
                <li key={item.key} className="flex flex-col gap-1 py-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={14} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: item.level === 'issue' ? 'var(--red)' : 'var(--amber)' }} />
                    <span style={{ fontSize: 13 }}>{item.text}</span>
                  </div>
                  {!readOnly && (
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      {item.key === 'location' && (
                        <button type="button" className="aj-pill" style={{ height: 26, fontSize: 12 }} onClick={() => onOpenFact('place')}>
                          Set duty station
                        </button>
                      )}
                      {item.key.startsWith('deadline') && (
                        <button type="button" className="aj-pill" style={{ height: 26, fontSize: 12 }} onClick={() => onOpenFact('closes')}>
                          Set closing date
                        </button>
                      )}
                      {item.section === 'apply' && (
                        <button type="button" className="aj-pill" style={{ height: 26, fontSize: 12 }} onClick={onOpenApply}>
                          Configure how to apply
                        </button>
                      )}
                      {item.section && item.section !== 'apply' && (
                        <button type="button" className="aj-text-btn" style={{ height: 26, fontSize: 12 }} onClick={() => onScrollSection(item.section!)}>
                          Jump to section
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
              {inclusiveItems.map((hit, idx) => (
                <li key={`${hit.section}-${hit.match}-${idx}`} className="flex flex-col gap-1 py-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={14} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: 'var(--amber)' }} />
                    <div className="min-w-0 flex-1">
                      <div style={{ fontSize: 13, fontWeight: 550 }}>
                        &ldquo;{hit.match}&rdquo; in {hit.title}
                      </div>
                      <div className="aj-faint" style={{ fontSize: 12 }}>
                        {hit.why} Try: {hit.alt}.
                      </div>
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      <button
                        type="button"
                        className="aj-pill"
                        style={{ height: 26, fontSize: 12 }}
                        onClick={() => onAskAi(`Rewrite "${hit.match}" in ${hit.title} using more inclusive wording such as "${hit.alt}".`)}
                      >
                        <Sparkles size={12} strokeWidth={1.8} /> Ask AI to rewrite
                      </button>
                      <button type="button" className="aj-text-btn" style={{ height: 26, fontSize: 12 }} onClick={() => onScrollSection(hit.section)}>
                        Jump to section
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Previewable Amplify Market check */}
        <section className="aj-card flex flex-col gap-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="ej-panel-label">Market check</span>
            <span className="aj-chip" data-tone="sage">
              {amplifying(job) ? 'Amplify' : `Included with Amplify · ${usd(single.amount)} at Publish`}
            </span>
          </div>
          {sum.market.thin ? (
            <p className="aj-faint m-0" style={{ fontSize: 12.5 }}>
              Needs at least {MIN_SIMILAR} similar jobs on AidJobs to compare timing and local language demand.
            </p>
          ) : (
            <ul className="ej-divide flex flex-col" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {sum.market.points.map((p) => (
                <AmplifyPointRow key={p.key} job={job} p={p} kind="market" readOnly={readOnly} onAskAi={onAskAi} />
              ))}
            </ul>
          )}
        </section>

        {/* Previewable Amplify Full advert check */}
        <section className="aj-card flex flex-col gap-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="ej-panel-label">Full advert check</span>
            <span className="aj-chip" data-tone="sage">
              {amplifying(job) ? 'Amplify' : `Included with Amplify · ${usd(single.amount)} at Publish`}
            </span>
          </div>
          {sum.full.thin ? (
            <p className="aj-faint m-0" style={{ fontSize: 12.5 }}>
              Needs at least {MIN_SIMILAR} similar jobs on AidJobs to benchmark requirements and pay transparency.
            </p>
          ) : (
            <ul className="ej-divide flex flex-col" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {sum.full.points.map((p) => (
                <AmplifyPointRow key={p.key} job={job} p={p} kind="full" readOnly={readOnly} onAskAi={onAskAi} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {!readOnly && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-3.5 py-2.5 aj-hair">
          <span className="aj-faint" style={{ fontSize: 12 }}>
            Fixes apply live to your draft.
          </span>
          <button type="button" className="aj-ink-btn" onClick={onNext}>
            {nextLabel} <ArrowRight size={14} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Stage 3 Left pane: Review & Approval for both authors and reviewers, covering all language versions. */
export function ReviewStagePanel({
  job,
  s,
  on,
  onSection,
  onAskAi,
  onNext,
}: {
  job: DemoJob;
  s: State;
  on?: string;
  onSection: (secKey: string) => void;
  onAskAi: (prompt: string) => void;
  onNext: () => void;
}) {
  const [sending, setSending] = useState(false);
  if (s.reviewerAs) {
    return <ReviewColumn job={job} s={s} on={on} onSection={onSection} />;
  }
  const required = approvalRequired(s, job);
  const approved = approvedFor(s, job);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="aj-scroll flex min-h-0 flex-1 flex-col gap-3 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5" style={{ fontSize: 14, fontWeight: 700 }}>
              <UserCheck size={15} strokeWidth={1.8} /> Review &amp; approval
            </div>
            <div className="aj-faint" style={{ fontSize: 12 }}>
              {required
                ? approved
                  ? 'Approved — ready to publish.'
                  : 'Required by your organisation before publishing.'
                : 'Optional — colleagues can comment on all language versions; publishing does not wait.'}
            </div>
          </div>
          {!required && <span className="aj-chip">Optional</span>}
        </div>

        {sending && isReviewable(job) ? (
          <div className="aj-card flex flex-col gap-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="ej-panel-label">Send for review</span>
              <button type="button" className="aj-text-btn" style={{ height: 26 }} onClick={() => setSending(false)}>
                Cancel
              </button>
            </div>
            <ReviewForm job={job} s={s} onSent={() => setSending(false)} />
          </div>
        ) : (
          <div className="aj-card">
            <ReviewPanel job={job} s={s} on={on} onSection={onSection} onAskAi={onAskAi} onSend={() => setSending(true)} />
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t px-3.5 py-2.5 aj-hair">
        <span className="aj-faint" style={{ fontSize: 12 }}>
          Switch language tabs on the right to inspect translations.
        </span>
        <button type="button" className="aj-ink-btn" onClick={onNext}>
          Next: Publish <ArrowRight size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

/** Stage 4 Left pane: Clickable essentials checklist, Free vs Amplify, Publish, plus Share & Reach (Flyer + Reach). */
export function PublishStagePanel({
  job,
  s,
  open,
  onOpenFact,
  onOpenApply,
  onFocusTitle,
  sub,
  setSub,
  shareKind,
  setShareKind,
  onPrintFlyer,
}: {
  job: DemoJob;
  s: State;
  open: Opener;
  onOpenFact: (k: FactKey) => void;
  onOpenApply: () => void;
  onFocusTitle: () => void;
  sub: PublishSubTab;
  setSub: (v: PublishSubTab) => void;
  shareKind: ShareKind;
  setShareKind: (v: ShareKind) => void;
  onPrintFlyer: () => void;
}) {
  const missing = essentials(job, s.org);
  const unlocked = reachOpen(job, s);
  const amp = amplifying(job);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3.5 py-2 aj-hair">
        <div className="aj-switch" role="radiogroup" aria-label="Publish section" onKeyDown={radioKeys}>
          <button type="button" role="radio" aria-checked={sub === 'publish'} data-active={sub === 'publish'} onClick={() => setSub('publish')}>
            Publish
          </button>
          <button type="button" role="radio" aria-checked={sub === 'share'} data-active={sub === 'share'} onClick={() => setSub('share')}>
            Share &amp; Reach
          </button>
        </div>
      </div>

      <div className="aj-scroll flex min-h-0 flex-1 flex-col gap-3 p-3.5">
        {sub === 'publish' ? (
          <>
            {missing.length > 0 && !isPublished(job) && (
              <section className="flex flex-col gap-2 rounded-xl p-3" style={{ background: 'var(--amber-bg)' }} aria-label="Missing before publishing">
                <div className="flex items-center gap-1.5" style={{ fontSize: 13, fontWeight: 650, color: 'var(--amber)' }}>
                  <AlertCircle size={14} strokeWidth={2} /> Complete {missing.length} {missing.length === 1 ? 'essential' : 'essentials'} before publishing
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {missing.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="aj-pill"
                      style={{ height: 30, fontSize: 12.5, background: 'var(--surface)' }}
                      onClick={() => {
                        if (k === 'title') onFocusTitle();
                        else if (k === 'method') onOpenApply();
                        else if (FACT_FOR_ESSENTIAL[k]) onOpenFact(FACT_FOR_ESSENTIAL[k]!);
                      }}
                    >
                      + Add {ESSENTIAL_WORDS[k]}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {!isPublished(job) && <PlanChoice job={job} s={s} />}
            <PublishCard job={job} s={s} open={open} />
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Share and Reach tools" onKeyDown={radioKeys}>
              <button type="button" role="radio" aria-checked={shareKind === 'flyer'} className="aj-pill" data-active={shareKind === 'flyer'} onClick={() => setShareKind('flyer')}>
                <Printer size={13} strokeWidth={1.8} /> Field-post notice
              </button>
              <button type="button" role="radio" aria-checked={shareKind === 'reach'} className="aj-pill" data-active={shareKind === 'reach'} onClick={() => setShareKind('reach')}>
                <Send size={13} strokeWidth={1.8} /> Reach invitations
              </button>
            </div>

            {!unlocked ? (
              <div className="aj-card flex flex-col gap-2 p-3.5" role="status">
                <span className="aj-chip self-start" data-tone="amber">
                  {amp ? 'Ready after Review' : 'Included with Amplify'}
                </span>
                <p className="aj-muted m-0" style={{ fontSize: 13 }}>
                  {amp
                    ? 'Your field-post notice and Reach invitations unlock as soon as review is complete. Any invitations you prepare are kept.'
                    : 'Choose Amplify in the Publish tab to unlock printable one-page field-post notices and targeted Reach email invitations.'}
                </p>
                {!amp && (
                  <button type="button" className="aj-pill self-start" onClick={() => setSub('publish')}>
                    Choose Amplify
                  </button>
                )}
              </div>
            ) : shareKind === 'flyer' ? (
              <div className="aj-card flex flex-col gap-2.5 p-3.5">
                <div style={{ fontSize: 13.5, fontWeight: 650 }}>One-page field-post notice</div>
                <p className="aj-muted m-0" style={{ fontSize: 12.5 }}>
                  Previewed live on the right. Print it directly or choose &ldquo;Save as PDF&rdquo; in your browser&apos;s print window for community boards and field offices.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="aj-ink-btn" onClick={onPrintFlyer}>
                    <Printer size={14} strokeWidth={1.8} /> Print / Save PDF
                  </button>
                </div>
              </div>
            ) : (
              <ReachEditor
                key={job.id}
                job={job}
                s={s}
                mode={isPublished(job) && job.plan === 'amplify' && job.status === 'live' ? 'send' : 'plan'}
                sendsOn={job.publishOn ?? null}
                live={job.status === 'live'}
                onDone={() => setSub('publish')}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
