'use client';

import { AlertCircle, BarChart3, CheckCircle2, ChevronDown, FileCheck2, Languages, Lock, Printer, UserCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { addTranslation, applyFix, approvalRequired, editTranslation, isApproved, isReviewable, keepTranslation, openWindowAt, refreshTranslation, remindReviewers, removeTranslation, reviewTranslation } from './actions';
import { ReviewDialog } from './Review';
import { shortDate } from './engine';
import { FlyerDialog } from './Flyer';
import { basicAdvertCheck, fullAdvertCheck, marketCheck, MIN_SIMILAR, type Point } from './market';
import { jobLang, langOf, stale, totalLines, untranslated, versionChoices, versionsOf } from './translate';
import type { DemoJob, JobLang, State } from './types';
import { Dialog, inputStyle } from './ui';

export type RowKey = 'advert' | 'market' | 'languages' | 'notice' | 'review';

function PointRow({ p, job, owner }: { p: Point; job: DemoJob; owner: boolean }) {
  return (
    <li className="flex gap-2.5 py-2">
      <span className="mt-0.5 shrink-0">{p.ok ? <CheckCircle2 size={15} strokeWidth={2} style={{ color: 'var(--sage-7)' }} /> : <AlertCircle size={15} strokeWidth={2} style={{ color: 'var(--amber)' }} />}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span style={{ fontWeight: p.ok ? 500 : 600 }}>{p.title}</span>
        {p.detail && <span className="aj-faint">{p.detail}</span>}
        {owner && (p.fix || (!p.ok && p.section)) && (
          <div className="flex flex-wrap gap-1.5">
            {p.fix && (
              <button type="button" className="aj-pill" style={{ height: 30 }} onClick={() => p.fix && applyFix(job.id, p.fix.fix, p.fix.label)}>
                {p.fix.label}
              </button>
            )}
            {!p.fix && p.section && (
              <button type="button" className="aj-text-btn ej-tap" style={{ height: 'auto', padding: 0 }} onClick={() => openWindowAt(job.id, `s:${p.section}`)}>
                Look at it in the job description
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Points({ points, job, owner }: { points: Point[]; job: DemoJob; owner: boolean }) {
  return (
    <ul className="ej-divide flex flex-col" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {points.map((p) => (
        <PointRow key={p.key} p={p} job={job} owner={owner} />
      ))}
    </ul>
  );
}

function Locked({ text, onChooseAmplify }: { text: string; onChooseAmplify: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="aj-muted">{text}</span>
      <button type="button" className="aj-pill" onClick={onChooseAmplify}>
        Choose Amplify
      </button>
    </div>
  );
}

/** Line by line: the job's own text above, the version below. Lines still in the job's language are marked; any edit needs a new review. */
function LanguageReview({ job, lang, onClose }: { job: DemoJob; lang: JobLang; onClose: () => void }) {
  const t = job.translations?.[lang];
  const info = langOf(lang);
  const own = langOf(jobLang(job));
  if (!t) return null;
  const left = untranslated(job, t);
  const isStale = stale(job, t);
  return (
    <Dialog
      title={`${info.label} version`}
      subtitle={t.reviewed && !isStale ? 'Reviewed' : 'Draft · review each line'}
      onClose={onClose}
      wide
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="aj-faint mr-auto">{left ? `${left} of ${totalLines(t)} lines are still in ${own.label}.` : 'Every line is in the language.'}</span>
          <button type="button" className="aj-pill" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="aj-ink-btn"
            disabled={t.reviewed && !isStale}
            onClick={() => {
              if (isStale) return refreshTranslation(job.id, lang);
              reviewTranslation(job.id, lang);
              onClose();
            }}
          >
            {isStale ? 'Update the changed lines' : t.reviewed ? 'Reviewed' : 'Mark as reviewed'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="aj-faint" style={{ margin: 0 }}>
          Demo: AidJobs would draft the whole text. Here the headings, standard sentences, dates, and places are translated; other lines stay in {own.label}, marked, for you to translate. Your organisation&apos;s fixed texts (commitments) appear as you wrote them.
        </p>
        {isStale && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl p-3" style={{ background: 'var(--amber-bg)' }}>
            <span className="min-w-0 flex-1">The {own.label} changed after this version was made. It is not copied here unless you say so.</span>
            <button type="button" className="aj-pill" onClick={() => refreshTranslation(job.id, lang)}>
              Update the changed lines
            </button>
            <button type="button" className="aj-text-btn" onClick={() => keepTranslation(job.id, lang)}>
              Keep it as it is
            </button>
          </div>
        )}
        {t.sections.map((sec) => {
          const en = job.sections.find((x) => x.key === sec.key);
          return (
            <section key={sec.key} className="flex flex-col gap-2">
              <input style={{ ...inputStyle, fontWeight: 650 }} value={sec.title} onChange={(e) => editTranslation(job.id, lang, sec.key, 'title', e.target.value)} dir={info.dir} lang={lang} aria-label={`Heading: ${en?.title ?? sec.key}`} />
              {sec.lines.map((line, i) => {
                const source = en?.lines[i] ?? '';
                const english = source === line && /\p{L}{3}/u.test(line);
                return (
                  <div key={i} className="flex flex-col gap-1">
                    <span className="aj-faint" style={{ fontSize: 11.5 }} lang={own.key}>
                      {english && (
                        <span className="aj-chip" data-tone="amber" style={{ height: 18, marginRight: 6 }} lang="en">
                          {own.label}
                        </span>
                      )}
                      {source}
                    </span>
                    <textarea style={{ ...inputStyle, minHeight: 40 }} rows={line.length > 90 ? 3 : 1} value={line} onChange={(e) => editTranslation(job.id, lang, sec.key, i, e.target.value)} dir={info.dir} lang={lang} aria-label={`${sec.title}, line ${i + 1}`} />
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}

/**
 * Before publishing: the advert check for every job; for Amplify, the market check, the full advert check, language versions, and the
 * field-post notice (employer-side plan, section 16, decision 6). Each point offers a one-tap fix where there is one.
 */
/** The advert check's points still to look at, as the publish page lists them; with Amplify, the full check's too. */
export function openPoints(job: DemoJob, s: State, amplify: boolean): string[] {
  return [...basicAdvertCheck(job, s), ...(amplify ? fullAdvertCheck(job, s).points : [])].filter((p) => !p.ok).map((p) => p.title);
}

export function checksToLook(job: DemoJob, s: State, amplify: boolean): number {
  return openPoints(job, s, amplify).length;
}

/** Where the job stands before publishing, in a few words each: for the summary above the main button. */
export function checkSummary(job: DemoJob, s: State, amplify: boolean): Array<{ key: RowKey; text: string }> {
  const toLook = checksToLook(job, s, amplify);
  const versions = versionsOf(job);
  return [
    { key: 'advert', text: toLook ? `${toLook} ${toLook === 1 ? 'check' : 'checks'} to look at` : 'checks all clear' },
    ...(isReviewable(job) ? [{ key: 'review' as const, text: reviewText(job, s) }] : []),
    { key: 'languages', text: !amplify ? 'language versions with Amplify' : versions.length ? `${versions.length} language ${versions.length === 1 ? 'version' : 'versions'}` : 'no language versions' },
  ];
}

function reviewText(job: DemoJob, s: State): string {
  const needed = approvalRequired(s, job);
  const r = job.review;
  if (r.state === 'none') return needed ? 'review required, not sent' : 'review optional, not sent';
  if (r.state === 'changes') return 'changes requested';
  if (isApproved(job)) return 'approved';
  return `in review: ${r.reviewers.filter((x) => x.decision === 'approved').length} of ${r.reviewers.length} approved`;
}

export default function BeforePublish({
  job,
  s,
  amplify,
  schedule,
  url,
  onChooseAmplify,
  label = 'Before you publish',
  open: openProp,
  onOpen,
  tabbed = false,
}: {
  job: DemoJob;
  s: State;
  amplify: boolean;
  schedule: string | null;
  url: string;
  onChooseAmplify: () => void;
  label?: string | null;
  open?: RowKey | null;
  onOpen?: (k: RowKey | null) => void;
  /** Inside the publish page's tabbed card: the tab is its heading. */
  tabbed?: boolean;
}) {
  const [openOwn, setOpenOwn] = useState<RowKey | null>('advert');
  const open = openProp === undefined ? openOwn : openProp;
  const setOpen = onOpen ?? setOpenOwn;
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<JobLang | null>(null);
  const [flyer, setFlyer] = useState(false);
  const [similarOpen, setSimilarOpen] = useState(false);
  const owner = !s.reviewerAs;
  const basic = basicAdvertCheck(job, s);
  const full = amplify ? fullAdvertCheck(job, s) : null;
  const market = amplify ? marketCheck(job, s, schedule) : null;
  const toLook = basic.filter((p) => !p.ok).length + (full?.points.filter((p) => !p.ok).length ?? 0);
  const tips = market?.points.filter((p) => !p.ok).length ?? 0;
  const versions = versionsOf(job).map((k) => langOf(k));

  const status = (k: JobLang) => {
    const t = job.translations?.[k];
    if (!t) return '';
    if (stale(job, t)) return `${langOf(jobLang(job)).label} changed since`;
    if (t.reviewed) return 'reviewed';
    const left = untranslated(job, t);
    return left ? `draft · ${left} ${left === 1 ? 'line' : 'lines'} in English` : 'draft';
  };

  const rows: Array<{ key: RowKey; icon: ReactNode; title: string; summary: string; tone: 'ok' | 'tip' | 'locked'; body: ReactNode }> = [
    {
      key: 'advert',
      icon: <FileCheck2 size={16} strokeWidth={1.8} />,
      title: 'Advert check',
      summary: toLook ? `${toLook} to look at` : 'All clear',
      tone: toLook ? 'tip' : 'ok',
      body: (
        <div className="flex flex-col gap-3">
          <div>
            <span className="ej-panel-label">Clarity and inclusion</span>
            <Points points={basic} job={job} owner={owner} />
          </div>
          <div>
            <span className="ej-panel-label">Compared with similar jobs</span>
            {!full ? (
              <Locked text="Amplify adds requirements that put people off and missing pay, compared with similar open jobs." onChooseAmplify={onChooseAmplify} />
            ) : full.thin ? (
              <p className="aj-muted" style={{ margin: '4px 0 0' }}>
                Too few similar open jobs to compare requirements and pay; the check says more once there are at least {MIN_SIMILAR}.
              </p>
            ) : (
              <Points points={full.points} job={job} owner={owner} />
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'market',
      icon: <BarChart3 size={16} strokeWidth={1.8} />,
      title: 'How does your job compare?',
      summary: !market ? 'With Amplify' : market.thin ? 'Too few similar jobs' : tips ? `${tips} ${tips === 1 ? 'tip' : 'tips'} from ${market.count} similar jobs` : `In line with ${market.count} similar jobs`,
      tone: !market ? 'locked' : tips ? 'tip' : 'ok',
      body: !market ? (
        <Locked text="Amplify compares your job with similar open jobs on AidJobs: how long they stay open, the languages they ask for, and deadlines that clash with yours." onChooseAmplify={onChooseAmplify} />
      ) : market.thin ? (
        <p className="aj-muted" style={{ margin: 0 }}>
          Only {market.count} similar open {market.count === 1 ? 'job' : 'jobs'} on AidJobs ({market.scope}): too few to compare. The check says more once there are at least {MIN_SIMILAR}. <span className="aj-faint">Sample figures in the demo.</span>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="aj-muted">
            Compared with {market.count} similar open jobs: {market.scope}. <span className="aj-chip" data-tone="amber">Sample figures in the demo</span>
          </span>
          <Points points={market.points} job={job} owner={owner} />
          <button type="button" className="aj-text-btn self-start" aria-expanded={similarOpen} onClick={() => setSimilarOpen(!similarOpen)}>
            {similarOpen ? 'Hide' : 'See'} the {market.count} similar jobs
          </button>
          {similarOpen && (
            <ul className="flex flex-col gap-1" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Similar open jobs (sample)">
              {market.similar.map((x, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-1" style={{ background: 'var(--surface-2)' }}>
                  <span style={{ fontWeight: 600 }}>{x.title}</span>
                  <span className="aj-faint">
                    {x.org} · {x.city} · closes {shortDate(x.closes)} · {x.languages.join(', ')}
                    {x.showsPay ? ' · shows pay' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    },
    {
      key: 'languages',
      icon: <Languages size={16} strokeWidth={1.8} />,
      title: 'Language versions',
      summary: !amplify ? 'With Amplify' : versions.length ? versions.map((v) => `${v.label}${status(v.key) === 'reviewed' ? ' ✓' : ' (draft)'}`).join(' · ') : 'None yet',
      tone: !amplify ? 'locked' : versions.some((v) => status(v.key) !== 'reviewed') ? 'tip' : 'ok',
      body: !amplify ? (
        <Locked text="Amplify adds versions of the job page in French, Arabic, Spanish, and Portuguese, which you review before they appear." onChooseAmplify={onChooseAmplify} />
      ) : (
        <div className="flex flex-col gap-2">
          <span className="aj-muted">AidJobs drafts each version; you review it before it appears. Each is its own version of the job page, for people reading and searching in that language.</span>
          {versions.length > 0 && job.status !== 'live' && owner && (
            <span className="aj-faint">
              You can also edit each version in its tab of the job&apos;s window, like the job&apos;s own language.{' '}
              <button type="button" className="aj-text-btn ej-tap" style={{ height: 'auto', padding: 0 }} onClick={() => openWindowAt(job.id, 'langs')}>
                Open the window
              </button>
            </span>
          )}
          <ul className="ej-divide flex flex-col" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {versionChoices(job).map((l) => {
              const t = job.translations?.[l.key];
              return (
                <li key={l.key} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-[96px]" style={{ fontWeight: 600 }} lang={l.key}>
                    {l.native}
                  </span>
                  <span className="aj-faint min-w-0 flex-1">{t ? status(l.key) : l.label}</span>
                  {owner && !t && (
                    <button type="button" className="aj-pill" style={{ height: 30 }} onClick={() => addTranslation(job.id, l.key)}>
                      Add {l.label}
                    </button>
                  )}
                  {owner && t && (
                    <>
                      <button type="button" className="aj-pill" style={{ height: 30 }} onClick={() => setReview(l.key)}>
                        {t.reviewed && !stale(job, t) ? 'Open' : 'Review'}
                      </button>
                      <button type="button" className="aj-text-btn" style={{ height: 30 }} onClick={() => removeTranslation(job.id, l.key)}>
                        Remove
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ),
    },
    {
      key: 'notice',
      icon: <Printer size={16} strokeWidth={1.8} />,
      title: 'Field-post notice',
      summary: !amplify ? 'With Amplify' : 'One page, with a QR code',
      tone: !amplify ? 'locked' : 'ok',
      body: !amplify ? (
        <Locked text="Amplify adds a printable one-page notice with a QR code to the job, for notice boards in field offices, clinics, and community centres." onChooseAmplify={onChooseAmplify} />
      ) : (
        <div className="flex flex-col items-start gap-2">
          <span className="aj-muted">A one-page notice with a QR code to the job, for notice boards in field offices, clinics, and community centres; in English or a reviewed language version.</span>
          <button type="button" className="aj-pill" onClick={() => setFlyer(true)}>
            <Printer size={13} strokeWidth={1.8} /> Open the notice
          </button>
        </div>
      ),
    },
    ...(isReviewable(job) ? [reviewRow()] : []),
  ];

  function reviewRow(): (typeof rows)[number] {
    const needed = approvalRequired(s, job);
    const r = job.review;
    const sent = r.state !== 'none';
    const waiting = r.reviewers.some((x) => !x.decision);
    return {
      key: 'review',
      icon: <UserCheck size={16} strokeWidth={1.8} />,
      title: 'Review',
      summary: reviewText(job, s).replace(/^./, (c) => c.toUpperCase()),
      tone: (needed && !isApproved(job)) || r.state === 'changes' ? 'tip' : 'ok',
      body: (
        <div className="flex flex-col items-start gap-2">
          <span className="aj-muted">
            {needed ? 'Your organisation asks for approval before publishing.' : 'Optional: ask colleagues to read it and approve before you publish.'}
            {sent ? '' : ' They get a private link; they can comment and approve, not change it.'}
          </span>
          {sent && (
            <ul className="aj-muted" style={{ margin: 0, paddingLeft: 18, listStyle: 'disc' }}>
              {r.reviewers.map((x) => (
                <li key={x.email}>
                  {x.name}: {x.decision === 'approved' ? 'approved' : x.decision === 'changes' ? 'asked for changes' : 'not answered yet'}
                </li>
              ))}
            </ul>
          )}
          {owner && (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={isApproved(job) ? 'aj-text-btn' : 'aj-pill'} onClick={() => setReviewing(true)}>
                <UserCheck size={13} strokeWidth={1.8} /> {sent ? 'Review again' : 'Send for review'}
              </button>
              {sent && waiting && (
                <button type="button" className="aj-text-btn" onClick={() => remindReviewers(job.id)}>
                  Remind
                </button>
              )}
            </div>
          )}
        </div>
      ),
    };
  }

  return (
    <section className={tabbed ? 'flex flex-col p-1.5 pt-2' : label ? 'aj-card flex flex-col p-1.5' : 'flex flex-col'} aria-label={label ?? 'Improve this job'}>
      {label && !tabbed && <span className="ej-panel-label px-2.5 pb-1 pt-2">{label}</span>}
      {job.status === 'live' && <span className="aj-faint px-2.5 pb-1">The job is live: a fix changes it at once, and its page says &ldquo;Updated&rdquo;. A reviewed language version appears on its page at once.</span>}
      {job.status !== 'live' && owner && approvalRequired(s, job) && isApproved(job) && <span className="aj-faint px-2.5 pb-1">This job is approved: a fix here changes it, so it goes back to its reviewers, as an edit in the job description does.</span>}
      {rows.map((r) => {
        const isOpen = open === r.key;
        return (
          <div key={r.key} className="rounded-xl" style={{ background: isOpen ? 'var(--surface-2)' : undefined }}>
            <button
              type="button"
              id={label ? `ej-row-${r.key}` : undefined}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left"
              style={{ border: 'none', background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', scrollMarginTop: 72 }}
              aria-expanded={isOpen}
              onClick={(e) => {
                const head = e.currentTarget;
                setOpen(isOpen ? null : r.key);
                // Opening a row closes the one above it, which can carry this row off the top of the screen: bring its heading back.
                if (!isOpen) requestAnimationFrame(() => head.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
              }}
            >
              <span className="shrink-0" style={{ color: r.tone === 'locked' ? 'var(--text-3)' : 'var(--sage-7)' }}>
                {r.icon}
              </span>
              <span className="min-w-0 flex-1" style={{ fontWeight: 650 }}>
                {r.title}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-right" style={{ fontSize: 12, color: r.tone === 'tip' ? 'var(--amber)' : r.tone === 'ok' ? 'var(--sage-7)' : 'var(--text-3)' }}>
                {r.tone === 'locked' && <Lock size={11} strokeWidth={2} />}
                {r.summary}
              </span>
              <ChevronDown size={15} strokeWidth={1.8} className="aj-faint shrink-0" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} />
            </button>
            {isOpen && <div className="px-3 pb-3">{r.body}</div>}
          </div>
        );
      })}
      {review && <LanguageReview job={job} lang={review} onClose={() => setReview(null)} />}
      {reviewing && <ReviewDialog job={job} s={s} onClose={() => setReviewing(false)} />}
      {flyer && <FlyerDialog job={job} s={s} url={url} onClose={() => setFlyer(false)} />}
    </section>
  );
}
