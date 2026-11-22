'use client';

import { AlertCircle, Check, CheckCircle2, Copy, ExternalLink, Languages, Send } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import Tip from '@/components/site/Tip';
import {
  acceptFreeTerms,
  addTranslation,
  amplifyLive,
  applyFix,
  buy,
  buyLanguages,
  cancelPayRequest,
  canSkipApproval,
  changesAfterApproval,
  chooseBlock,
  downloadCopy,
  goOn,
  leaveAmplifyPoint,
  publish,
  publishBlock,
  remindPayer,
  remindReviewers,
  removeTranslation,
  scheduleBlock,
  setChoice,
  setPayWith,
  setPublishOn,
  type Paid,
} from './actions';
import { approvalRequired, approvedFor } from './approval';
import { addDays, longDate, shortDate } from './engine';
import { essentials, ESSENTIAL_WORDS, fullPoints, marketPoints, reviewDone, sectionPublishBlock } from './flow';
import { deliveryText, planCount } from './invites';
import { isPublished } from './lifecycle';
import { jobUrl } from './links';
import { fullAdvertCheck, marketCheck, MIN_SIMILAR, type Point } from './market';
import {
  allowance,
  allowanceText,
  canAmplifyFree,
  canGoFree,
  LANGS_INCLUDED,
  LANGUAGE_PRICE,
  langSlots,
  langsToPay,
  LISTED_DAYS,
  listedUntil,
  nextPaidJob,
  ONE_JOB,
  packageOf,
  PACKAGES,
  paidJobsLeft,
  priceLabel,
  singlePrice,
  usd,
  usesFreeAmplify,
  viaFor,
  type PackageKey,
} from './plans';
import { AmplifyIncludes, Checkout, FreeAmplifyTerms, FreeTerms } from './Pricing';
import { AskToPayDialog, ChangesNote, Choice, OverruleDialog, PayerDialog, SkipDialog, TermsDialog } from './Publish';
import { ReviewPanel } from './Review';
import { getState, go, notify } from './store';
import { jobLang, langOf, publicLangs, stale, versionChoices, versionsOf } from './translate';
import type { DemoJob, JobLang, Plan, State } from './types';
import { inputStyle, JobLink, radioKeys } from './ui';

/** What the window's publishing parts can bring into view: a tab, the review, the preview. */
export type Opener = { tab: (k: string) => void; part: (k: string) => void; preview: () => void };

const first = (name: string) => name.split(' ')[0];

/**
 * Free or Amplify (section 19, step 8; section 16's rules and phase 5's free listings): what each includes, whether the free standard
 * listing and the free Amplify are still available, any package jobs on hand, and the packages. In the chat's card and in its part on the
 * line; the choice is the job's, so both show the same.
 */
export function PlanChoice({ job, s }: { job: DemoJob; s: State }) {
  const [plansOpen, setPlansOpen] = useState(false);
  // R1-18: Amplify detail starts collapsed so Free stays primary; open when Amplify is already chosen.
  const [amplifyDetailOpen, setAmplifyDetailOpen] = useState(job.choice === 'amplify');
  const owner = !s.reviewerAs;
  const standard = allowance(s, 'standard');
  const freeOk = canGoFree(s, job.id);
  const freeAmp = usesFreeAmplify(s, job);
  const onHand = nextPaidJob(s);
  const onHandCount = paidJobsLeft(s);
  const single = singlePrice(s);
  const pkg = job.payWith === 'free' || !job.payWith ? 'one' : job.payWith;
  const chosen = job.choice;
  const pick = (p: Plan) => {
    const no = chooseBlock(getState(), job, p);
    if (no) return notify(`${no}.`);
    setChoice(job.id, p);
    if (p === 'amplify') setAmplifyDetailOpen(true);
  };
  return (
    <div className="flex flex-col gap-2" role="radiogroup" onKeyDown={radioKeys} aria-label="Free or Amplify">
      {!job.paidFor && (
        <Choice on={chosen === 'free'} title="Free" price={freeOk ? 'US$0' : 'Used'} onSelect={() => pick('free')} disabled={!owner}>
          <span className="aj-muted" style={{ fontWeight: 600 }}>
            {standard.state === 'held' && standard.jobId === job.id
              ? 'This job holds your free standard listing; it is used when the job goes live.'
              : freeOk
                ? `Free once for your organisation · after this, a job goes out with Amplify (${usd(ONE_JOB)} a job) or a package. Used only when it goes live.`
                : `Your free standard listing is ${allowanceText(s, 'standard')}: once per organisation.`}
          </span>
          <FreeTerms s={s} />
        </Choice>
      )}
      <Choice on={chosen === 'amplify'} title="Amplify" price={job.paidFor ? 'Paid' : freeAmp ? 'Free once' : onHand ? 'Package job' : `${usd(pkg === 'one' ? single.amount : packageOf(pkg).price)}${pkg === 'always' ? ' a month' : ''}`} onSelect={() => pick('amplify')} amplified disabled={!owner}>
        {job.paidFor && <span className="aj-muted" style={{ fontWeight: 600 }}>Already paid: it was scheduled, then taken back to a draft. Publishing it again costs nothing.</span>}
        {!job.paidFor && freeAmp && <FreeAmplifyTerms />}
        {!job.paidFor && !freeAmp && canAmplifyFree(s, job.id) && <span className="aj-muted">Paid for this job; your free Amplify stays available for later.</span>}
        <button type="button" className="aj-text-btn self-start" aria-expanded={amplifyDetailOpen} onClick={() => setAmplifyDetailOpen(!amplifyDetailOpen)}>
          What Amplify adds
        </button>
        {amplifyDetailOpen && <AmplifyIncludes />}
        {job.paidFor ? null : onHand && !freeAmp ? (
          <span className="aj-muted" style={{ fontWeight: 600 }}>
            Uses 1 of your {onHandCount} package {onHandCount === 1 ? 'job' : 'jobs'}
            {onHand.kind === 'pack' ? `, to use by ${longDate(onHand.pack.ends)}.` : ', for this month of “Always hiring”.'}
          </span>
        ) : (
          <>
            <button type="button" className="aj-text-btn self-start" aria-expanded={plansOpen} onClick={() => setPlansOpen(!plansOpen)}>
              {freeAmp ? 'Keep the free Amplify for later, or plan ahead' : 'Hiring more? Plan ahead and pay less per job'}
            </button>
            {plansOpen && <Packages job={job} s={s} />}
          </>
        )}
        {!s.org.verified && (
          <span style={{ color: 'var(--amber)' }}>
            Amplified jobs come from verified organisations.{' '}
            <button type="button" className="aj-text-btn" style={{ height: 'auto', padding: 0 }} onClick={() => go('org')}>
              Verify yours
            </button>
          </span>
        )}
      </Choice>
      {chosen === 'free' && versionsOf(job).length > 0 && <span className="aj-faint">Its language versions and other Amplify work are kept, hidden, in case you choose Amplify again.</span>}
    </div>
  );
}

/** The free Amplify while it is unused, then the packages, for paying less per job; a package job includes two language versions. */
export function Packages({ job, s }: { job: DemoJob; s: State }) {
  const single = singlePrice(s);
  const freeAmp = usesFreeAmplify(s, job);
  const pkg: PackageKey | 'free' = freeAmp ? 'free' : job.payWith && job.payWith !== 'free' ? job.payWith : 'one';
  return (
    <div className="flex flex-col gap-1.5" role="radiogroup" onKeyDown={radioKeys} aria-label="Packages">
      {canAmplifyFree(s, job.id) && (
        <button type="button" role="radio" aria-checked={pkg === 'free'} className="aj-option" data-active={pkg === 'free'} disabled={Boolean(s.reviewerAs)} onClick={() => setPayWith(job.id, 'free')}>
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">{pkg === 'free' && <Check size={14} strokeWidth={2.4} />}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span style={{ fontWeight: 650 }}>Your free Amplify</span>
            <span className="aj-faint">Free once for your organisation · {LANGS_INCLUDED.free} language version included</span>
          </span>
          <strong className="shrink-0">US$0</strong>
        </button>
      )}
      {PACKAGES.filter((p) => !(p.key === 'always' && s.subscription)).map((p) => {
        const extra = p.key === 'one' && single.key === 'extra';
        return (
          <button key={p.key} type="button" role="radio" aria-checked={pkg === p.key} className="aj-option" data-active={pkg === p.key} disabled={Boolean(s.reviewerAs)} onClick={() => setPayWith(job.id, p.key)}>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">{pkg === p.key && <Check size={14} strokeWidth={2.4} />}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span style={{ fontWeight: 650 }}>{extra ? 'One extra job' : p.label}</span>
              <span className="aj-faint">
                {extra ? 'On your “Always hiring” subscription' : p.rule} · {p.key === 'one' ? LANGS_INCLUDED.single : LANGS_INCLUDED.package} language {p.key === 'one' ? 'version' : 'versions'} included
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end">
              <strong>
                {usd(extra ? single.amount : p.price)}
                {p.key === 'always' ? ' a month' : ''}
              </strong>
              {p.key !== 'one' && <span className="aj-faint">{usd(p.perJob)} a job</span>}
            </span>
          </button>
        );
      })}
      <span className="aj-faint" style={{ fontSize: 11.5 }}>
        The same prices for every type of organisation; placeholders for now. Unused package jobs lapse, with reminders 2 weeks and 3 days before. A package job can also amplify a live free job; a free listing once used stays used, and paying uses neither.
      </span>
    </div>
  );
}

function PointList({ job, points, kind, owner }: { job: DemoJob; points: Point[]; kind: 'market' | 'full'; owner: boolean }) {
  if (!points.length) return <p className="aj-muted m-0">Nothing to look at.</p>;
  return (
    <ul className="ej-divide flex flex-col" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {points.map((p) => (
        <li key={p.key} className="flex gap-2.5 py-2">
          <AlertCircle size={15} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: 'var(--amber)' }} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span style={{ fontWeight: 600 }}>{p.title}</span>
            {p.detail && <span className="aj-faint">{p.detail}</span>}
            {owner && (
              <div className="flex flex-wrap gap-1.5">
                {p.fix && (
                  <button type="button" className="aj-pill" style={{ height: 30 }} onClick={() => p.fix && applyFix(job.id, p.fix.fix, p.fix.label)}>
                    {p.fix.label}
                  </button>
                )}
                {job.walk && (
                  <button type="button" className="aj-text-btn" style={{ height: 30 }} onClick={() => leaveAmplifyPoint(job.id, kind, p.key)}>
                    Leave it as it is
                  </button>
                )}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "How does your job compare?": similar open jobs from the labelled sample, each open point with its one-tap fix. */
export function MarketPart({ job, s }: { job: DemoJob; s: State }) {
  const [open, setOpen] = useState(false);
  const m = marketCheck(job, s, job.publishOn ?? null);
  if (m.thin) return <p className="aj-muted m-0">Only {m.count} similar open {m.count === 1 ? 'job' : 'jobs'} on AidJobs ({m.scope}): too few to compare. The check says more once there are at least {MIN_SIMILAR}. <span className="aj-faint">Sample figures in the demo.</span></p>;
  return (
    <div className="flex flex-col gap-2">
      <span className="aj-muted">
        Compared with {m.count} similar open jobs: {m.scope}. <span className="aj-chip" data-tone="amber">Sample figures in the demo</span>
      </span>
      <PointList job={job} points={marketPoints(job, s)} kind="market" owner={!s.reviewerAs} />
      <button type="button" className="aj-text-btn self-start" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'See'} the {m.count} similar jobs
      </button>
      {open && (
        <ul className="flex flex-col gap-1" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Similar open jobs (sample)">
          {m.similar.map((x, i) => (
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
  );
}

/** The full advert check: requirements that put people off and missing pay, against similar open jobs. */
export function FullPart({ job, s }: { job: DemoJob; s: State }) {
  const f = fullAdvertCheck(job, s);
  if (f.thin) return <p className="aj-muted m-0">Too few similar open jobs to compare requirements and pay; the check says more once there are at least {MIN_SIMILAR}.</p>;
  return <PointList job={job} points={fullPoints(job, s)} kind="full" owner={!s.reviewerAs} />;
}

/**
 * Language versions (section 19, 8 November 2026): offered in every language but the job's own; one included with a job paid on its own,
 * two with a package job; each further one US$5, in the job's payment, or bought on its own after publishing.
 */
export function LangsPart({ job, s, open }: { job: DemoJob; s: State; open: Opener }) {
  const [paying, setPaying] = useState(false);
  const owner = !s.reviewerAs;
  const own = langOf(jobLang(job));
  const via = viaFor(s, job);
  const plan: Plan = isPublished(job) ? (job.plan ?? 'free') : 'amplify';
  const slots = langSlots(job, plan, via);
  const extra = langsToPay(job, plan, via);
  const shown = publicLangs(job);
  return (
    <div className="flex flex-col gap-2">
      <span className="aj-muted">
        Written in {own.label}. Amplify includes {LANGS_INCLUDED[via]} language {LANGS_INCLUDED[via] === 1 ? 'version' : 'versions'} {via === 'package' ? 'with a package job' : via === 'free' ? 'with the free Amplify' : 'with a job paid on its own'}; each further one is {usd(LANGUAGE_PRICE)}. Each version can have its own sections; the facts are shared.
      </span>
      <ul className="ej-divide flex flex-col" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {versionChoices(job).map((l) => {
          const t = job.translations?.[l.key];
          const status = !t ? '' : stale(job, t) ? `${own.label} changed since` : t.reviewed ? (isPublished(job) && !shown.includes(l.key) ? 'reviewed · not paid for yet' : 'reviewed') : 'draft';
          return (
            <li key={l.key} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-[96px]" style={{ fontWeight: 600 }} lang={l.key}>
                {l.native}
              </span>
              <span className="aj-faint min-w-0 flex-1">{t ? status : l.label}</span>
              {owner && !t && (
                <button type="button" className="aj-pill" style={{ height: 30 }} onClick={() => addTranslation(job.id, l.key)}>
                  Add {l.label}
                </button>
              )}
              {t && (
                <button type="button" className="aj-pill" style={{ height: 30 }} onClick={() => open.tab(`lang:${l.key}`)}>
                  Open
                </button>
              )}
              {owner && t && (
                <button type="button" className="aj-text-btn" style={{ height: 30 }} onClick={() => removeTranslation(job.id, l.key)}>
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <span className="aj-faint">
        {versionsOf(job).length} of {slots} included {slots === 1 ? 'version' : 'versions'} used{extra ? `; ${extra} more at ${usd(extra * LANGUAGE_PRICE)}${isPublished(job) ? '' : ', added to the payment'}` : ''}.
      </span>
      {owner && isPublished(job) && job.plan === 'amplify' && extra > 0 && (
        <button type="button" className="aj-ink-btn self-start" onClick={() => setPaying(true)}>
          <Languages size={14} strokeWidth={1.8} /> Pay {usd(extra * LANGUAGE_PRICE)} for {extra} more {extra === 1 ? 'language' : 'languages'}
        </button>
      )}
      {paying && (
        <Checkout
          item={`${extra} more language ${extra === 1 ? 'version' : 'versions'}: ${job.facts.title}`}
          amount={usd(extra * LANGUAGE_PRICE)}
          onPaid={() => {
            buyLanguages(job.id, extra);
            setPaying(false);
            notify('Paid (simulated). The reviewed versions are on the job page now.');
          }}
          onDeclined={() => {
            setPaying(false);
            notify('The card was declined (simulated). Nothing was charged.');
          }}
          onClose={() => setPaying(false)}
        />
      )}
    </div>
  );
}

/** Review (section 19, step 9): the status, the reviewers' comments and decisions, and sending it; the email itself is in its tab. */
export function ReviewPart({ job, s, open }: { job: DemoJob; s: State; open: Opener }) {
  const required = approvalRequired(s, job);
  return (
    <div className="flex flex-col gap-2">
      <span className="aj-muted">{required ? (approvedFor(s, job) ? 'Approved: it can be published.' : 'Your organisation asks for approval on this job before it is published.') : 'Optional: colleagues comment and approve; publishing does not wait for them.'}</span>
      <div className="aj-card">
        <ReviewPanel job={job} s={s} onSend={() => open.tab('reviewmail')} />
      </div>
    </div>
  );
}

type Failure = null | 'declined' | 'closed';

/**
 * Publishing (section 19, step 9, under section 16's rules), in the chat's card, the Publish part, and the Payment tab: approval, a
 * request for changes after approval, a payment asked of someone else, publish now or on a date, and one button that says exactly what
 * happens. Nothing is published or paid but by that button.
 */
export function PublishCard({ job, s, open, payment = false, compact = false }: { job: DemoJob; s: State; open: Opener; payment?: boolean; compact?: boolean }) {
  const [checkout, setCheckout] = useState<PackageKey | 'extra' | 'langs' | null>(null);
  const [failed, setFailed] = useState<Failure>(null);
  const [terms, setTerms] = useState(false);
  const [skip, setSkip] = useState(false);
  const [overrule, setOverrule] = useState(false);
  const [asking, setAsking] = useState(false);
  const [payerOpen, setPayerOpen] = useState(false);
  const published = isPublished(job);
  // A live or scheduled free job is amplified only once Amplify is asked for; until then its part shows the link and what comes next.
  const upgrade = (job.status === 'live' || job.status === 'scheduled') && job.plan === 'free' && job.choice === 'amplify';
  if (job.status === 'closed') return <p className="aj-muted m-0">This job is closed. Hire again to publish it anew, as a new job.</p>;
  if (published && !upgrade) return <LiveCard job={job} s={s} open={open} compact={compact} />;

  const owner = !s.reviewerAs;
  const prepaid = Boolean(job.paidFor) && !upgrade;
  const free = canGoFree(s, job.id);
  const chosen: Plan = upgrade || prepaid ? 'amplify' : (job.choice ?? (free ? 'free' : 'amplify'));
  const schedule = upgrade ? null : (job.publishOn ?? null);
  const freeAmp = chosen === 'amplify' && !prepaid && usesFreeAmplify(s, job);
  const onHand = freeAmp ? null : nextPaidJob(s);
  const single = singlePrice(s);
  const pkg: PackageKey = job.payWith && job.payWith !== 'free' ? job.payWith : 'one';
  const payKey: PackageKey | 'extra' = pkg === 'one' ? single.key : pkg;
  const via = prepaid ? (job.paidVia ?? 'single') : freeAmp ? 'free' : onHand || pkg !== 'one' ? 'package' : 'single';
  const langs = chosen === 'amplify' ? langsToPay(job, 'amplify', via) : 0;
  const langCost = langs * LANGUAGE_PRICE;
  const blocked = !upgrade && approvalRequired(s, job) && !approvedFor(s, job);
  const request = job.payRequest;
  const dateBlock = upgrade ? null : scheduleBlock(s, job, schedule);
  const sectionBlock = upgrade ? null : sectionPublishBlock(job);
  // FW-1: essentials in the CTA (same wording as publishBlock), so the button is not "Publish free" when an email is missing.
  const missing = essentials(job, s.org);
  const reason = s.reviewerAs
    ? 'Reviewers cannot publish'
    : missing.length
      ? `Missing: ${missing.map((k) => ESSENTIAL_WORDS[k]).join(', ')}`
      : blocked
        ? 'Waiting for approval'
        : dateBlock
          ? dateBlock
          : sectionBlock
            ? sectionBlock
            : chosen === 'free' && !free
              ? 'Your free standard listing is used'
              : chosen === 'amplify' && !s.org.verified
                ? 'Verify your organisation to amplify'
                : null;
  const when = schedule ? ` for ${longDate(schedule)}` : '';
  const invites = chosen === 'amplify' ? planCount(job, job.reachPlan) : 0;
  const inviting = invites ? ` · invite ${invites} ${invites === 1 ? 'person' : 'people'} ${upgrade && job.status === 'live' ? 'now' : 'when live'}` : '';
  const withLangs = langs ? ` + ${usd(langCost)} for ${langs} ${langs === 1 ? 'language' : 'languages'}` : '';
  const action = upgrade ? 'Amplify this job' : schedule ? `${chosen === 'free' ? 'Schedule free' : 'Amplify and schedule'}${when}` : chosen === 'free' ? 'Publish free' : 'Amplify and publish';
  const cost = chosen === 'free' ? ' · your free standard listing' : prepaid ? ` · already paid${withLangs}` : freeAmp ? ` · your free Amplify${withLangs}` : onHand ? ` · uses 1 package job${withLangs}` : ` · ${priceLabel(payKey)}${withLangs}`;
  const label = reason ?? `${action}${inviting}${cost}`;
  const checkoutItem = (key: PackageKey | 'extra' | 'langs') =>
    key === 'langs'
      ? `${langs} more language ${langs === 1 ? 'version' : 'versions'}: ${job.facts.title}`
      : `${key === 'one' ? `Amplify: ${job.facts.title}` : key === 'extra' ? `Extra job on “Always hiring”: ${job.facts.title}` : key === 'always' ? '“Always hiring” subscription, first month (3 jobs)' : `${packageOf(key).jobs} jobs, one used for ${job.facts.title}`}${langs ? `, with ${langs} more language ${langs === 1 ? 'version' : 'versions'}` : ''}`;
  const checkoutAmount = (key: PackageKey | 'extra' | 'langs') => usd((key === 'langs' ? 0 : key === 'extra' ? single.amount : packageOf(key).price) + langCost);

  const amplifyPaid = (): Paid => (prepaid ? 'direct' : freeAmp ? 'free' : onHand ? 'onHand' : 'direct');
  const finish = (ok: boolean) => {
    if (!ok) {
      // FW-1: name the real publishBlock reason instead of a vague toast.
      const why = publishBlock(getState(), job.id, chosen === 'free' ? { plan: 'free', schedule } : { plan: 'amplify', schedule, paid: amplifyPaid(), langs });
      return notify(why ?? 'It could not be published. Check the choices and try again.');
    }
    setFailed(null);
    goOn(job.id);
  };
  const goLive = (how: Paid) => finish(upgrade ? amplifyLive(job.id, how, langs) : publish(job.id, { plan: 'amplify', schedule, paid: how, langs }));
  const proceed = () => {
    const now = getState().jobs.find((x) => x.id === job.id);
    if (!upgrade && now && changesAfterApproval(now) && now.review.overruled === undefined) return setOverrule(true);
    setFailed(null);
    if (chosen === 'free') {
      if (!getState().org.freeTermsAccepted) return setTerms(true);
      return finish(publish(job.id, { plan: 'free', schedule }));
    }
    if (prepaid || onHand || freeAmp) return langs ? setCheckout('langs') : goLive(prepaid ? 'direct' : freeAmp ? 'free' : 'onHand');
    setCheckout(payKey);
  };
  const paid = (key: PackageKey | 'extra' | 'langs') => {
    setCheckout(null);
    if (key === 'langs') {
      buyLanguages(job.id, langs, true);
      return goLive(prepaid ? 'direct' : freeAmp ? 'free' : 'onHand');
    }
    buy(key, job.facts.title, langs);
    goLive(key === 'one' || key === 'extra' ? 'direct' : 'onHand');
  };

  return (
    <div className="flex flex-col gap-3">
      {compact && (blocked || request || changesAfterApproval(job)) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="aj-muted min-w-0 flex-1">{blocked ? 'Approval is required first.' : request ? `Waiting for ${request.name} to pay ${request.amount}.` : 'Approved, with a later request for changes.'}</span>
          <button type="button" className="aj-text-btn" onClick={() => open.part(blocked || changesAfterApproval(job) ? 'review' : 'publish')}>
            See the details
          </button>
        </div>
      )}
      {!compact && blocked && (
        <div className="flex flex-col gap-1.5 rounded-xl p-3" style={{ background: 'var(--amber-bg)' }} role="status">
          <span style={{ fontWeight: 650 }}>Approval is required for this job</span>
          <span className="aj-muted">{job.review.state === 'none' ? 'Send it for review first.' : job.review.state === 'changes' || job.review.reviewers.some((r) => r.decision === 'changes') ? 'Changes were requested.' : `Waiting for ${job.review.reviewers.filter((r) => !r.decision).map((r) => first(r.name)).join(' and ') || 'your reviewers'}.`}</span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button type="button" className="aj-pill" onClick={() => open.part('review')}>
              {job.review.state === 'none' ? 'Send for review' : 'Open Review'}
            </button>
            {job.review.state !== 'none' && job.review.reviewers.some((r) => !r.decision) && owner && (
              <button type="button" className="aj-text-btn" onClick={() => remindReviewers(job.id)}>
                Remind
              </button>
            )}
            {canSkipApproval(s, job) && (
              <button type="button" className="aj-text-btn" onClick={() => setSkip(true)}>
                Publish without approval
              </button>
            )}
          </div>
        </div>
      )}
      {!compact && !blocked && !upgrade && <ChangesNote job={job} onPublishAnyway={() => setOverrule(true)} onLook={() => open.part('review')} />}
      {!compact && !blocked && !upgrade && chosen === 'amplify' && !reviewDone(job, s) && job.review.state !== 'none' && (
        <span className="aj-muted" role="status">
          Review is still open: Reach and the flyer open once it is approved, so they match what your reviewers saw.
        </span>
      )}
      {!compact && request && (
        <div className="flex flex-col gap-1.5 rounded-xl p-3" style={{ background: 'var(--sage-1)' }} role="status">
          <span style={{ fontWeight: 650 }}>
            Waiting for {request.name} to pay {request.amount}
          </span>
          <span className="aj-muted">
            Asked {new Date(request.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
            {request.reminded ? `, reminded ${new Date(request.reminded).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : ''}. The job {upgrade ? 'is amplified' : 'publishes'} as soon as they have paid
            {invites ? `, and the ${invites} invitations go out` : ''}. You can still pay yourself below.
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className="aj-pill" onClick={() => setPayerOpen(true)}>
              See their payment page (demo)
            </button>
            <button type="button" className="aj-pill" onClick={() => remindPayer(job.id)}>
              Remind
            </button>
            <button type="button" className="aj-text-btn" onClick={() => cancelPayRequest(job.id)}>
              Cancel the request
            </button>
          </div>
        </div>
      )}
      {failed && (
        <div className="flex flex-col gap-1.5 rounded-xl p-3" style={{ background: 'var(--red-bg, var(--amber-bg))' }} role="alert">
          <span className="flex items-center gap-2" style={{ fontWeight: 650 }}>
            <AlertCircle size={15} strokeWidth={2} style={{ color: 'var(--red)' }} /> {failed === 'declined' ? 'The card was declined' : 'The payment was not completed'}
          </span>
          <span className="aj-muted">{upgrade ? 'The job stays free and live. Nothing was charged.' : 'The job is still a draft. Nothing was published or charged.'} (Simulated.)</span>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="aj-ink-btn" onClick={() => setCheckout(prepaid || onHand || freeAmp ? 'langs' : payKey)}>
              Try again
            </button>
            {!upgrade && canGoFree(s, job.id) && !job.paidFor && (
              <button
                type="button"
                className="aj-pill"
                onClick={() => {
                  setFailed(null);
                  setPublishOn(job.id, null);
                  setChoice(job.id, 'free');
                }}
              >
                Publish free instead
              </button>
            )}
          </div>
        </div>
      )}
      {upgrade && !compact && (
        <span className="aj-muted">
          Free and {job.status === 'live' ? 'live' : `scheduled for ${longDate(job.scheduledFor ?? '')}`}, listed until {longDate(listedUntil(job, s.today))}. Amplified, it is listed {LISTED_DAYS.amplify} days from publishing, featured, with the market check, language versions, the flyer, and Reach.{' '}
          {job.status === 'live' ? 'The free standard listing it used stays used.' : 'The free standard listing it holds is given back.'}
          {freeAmp ? ` With your free Amplify there is nothing to pay; it is used ${job.status === 'live' ? 'at once' : `when it goes live on ${longDate(job.scheduledFor ?? '')}`}.` : ''}
        </span>
      )}
      {payment && chosen === 'amplify' && !prepaid && !onHand && <Packages job={job} s={s} />}
      {!upgrade && (
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" onKeyDown={radioKeys} aria-label="When to publish">
          <span className="aj-muted">Publish</span>
          <button type="button" role="radio" aria-checked={!schedule} className="aj-pill" data-active={!schedule} disabled={!owner} onClick={() => setPublishOn(job.id, null)}>
            Now
          </button>
          <button type="button" role="radio" aria-checked={Boolean(schedule)} className="aj-pill" data-active={Boolean(schedule)} disabled={!owner} onClick={() => setPublishOn(job.id, schedule ?? addDays(s.today, 1))}>
            On a date
          </button>
          {schedule && <input type="date" style={{ ...inputStyle, width: 170, minHeight: 34 }} value={schedule} min={addDays(s.today, 1)} onChange={(e) => setPublishOn(job.id, e.target.value || null)} aria-label="Publish on" />}
        </div>
      )}
      {!compact && chosen === 'free' && !upgrade && job.facts.deadline && job.facts.deadline > listedUntil({ ...job, plan: 'free', publishedAt: undefined, scheduledFor: schedule ?? undefined }, s.today) && (
        <span style={{ color: 'var(--amber)' }}>
          A free job is listed {LISTED_DAYS.free} days, so this one leaves AidJobs before its closing date. Amplify lists it {LISTED_DAYS.amplify} days.
        </span>
      )}
      <button type="button" className="aj-ink-btn ej-main-cta w-full justify-center" style={{ minHeight: 44 }} disabled={Boolean(reason)} onClick={proceed}>
        {label}
      </button>
      <span className="aj-faint text-center" style={{ fontSize: 11.5 }}>
        {chosen === 'free' ? 'Nothing to pay.' : prepaid || onHand || freeAmp ? (langs ? `${usd(langCost)} for the extra languages, at a simulated checkout.` : 'Nothing to pay now.') : 'Simulated checkout: no card is charged. Receipts are on the Billing page.'}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <button type="button" className="aj-text-btn" onClick={open.preview}>
          Preview it first
        </button>
        {chosen === 'amplify' && !prepaid && !onHand && !canAmplifyFree(s, job.id) && !reason && !request && owner && (
          <Tip label="For when someone else holds the card, such as finance or your director. They get a link to pay; the job publishes once they have paid, and the receipt goes to them.">
            <button type="button" className="aj-text-btn" onClick={() => setAsking(true)}>
              Ask someone else to pay
            </button>
          </Tip>
        )}
        {!payment && !compact && chosen === 'amplify' && !prepaid && !onHand && (
          <button type="button" className="aj-text-btn" onClick={() => open.tab('payment')}>
            Payment options
          </button>
        )}
      </div>

      {checkout && (
        <Checkout
          item={checkoutItem(checkout)}
          amount={checkoutAmount(checkout)}
          onPaid={() => paid(checkout)}
          onDeclined={() => {
            setCheckout(null);
            setFailed('declined');
          }}
          onClose={() => {
            setCheckout(null);
            setFailed('closed');
          }}
        />
      )}
      {asking && <AskToPayDialog job={job} s={s} request={{ key: payKey, amount: checkoutAmount(payKey), item: checkoutItem(payKey), schedule, langs }} onClose={() => setAsking(false)} />}
      {payerOpen && (
        <PayerDialog
          job={job}
          s={s}
          onClose={() => setPayerOpen(false)}
          onPaid={() => {
            setPayerOpen(false);
            setFailed(null);
            goOn(job.id);
          }}
        />
      )}
      {overrule && (
        <OverruleDialog
          job={job}
          onClose={() => setOverrule(false)}
          onDone={() => {
            setOverrule(false);
            proceed();
          }}
        />
      )}
      {skip && (
        <SkipDialog
          job={job}
          onClose={() => setSkip(false)}
          onDone={() => {
            setSkip(false);
            proceed();
          }}
        />
      )}
      {terms && (
        <TermsDialog
          s={s}
          action={schedule ? `Schedule free for ${longDate(schedule)}` : 'Publish free'}
          onClose={() => setTerms(false)}
          onAccept={() => {
            setTerms(false);
            acceptFreeTerms();
            finish(publish(job.id, { plan: 'free', schedule }));
          }}
        />
      )}
    </div>
  );
}

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    notify('Link copied');
  } catch {
    notify('Copy failed: select the link and copy it yourself');
  }
}

/** After publishing (the end of step 9): the link with Copy; for a paid job what Reach sends; for a free job "Amplify to invite people directly". */
export function LiveCard({ job, s, open, compact = false }: { job: DemoJob; s: State; open: Opener; compact?: boolean }) {
  const url = jobUrl(job);
  const scheduled = job.status === 'scheduled';
  const round = job.reach?.rounds[job.reach.rounds.length - 1];
  const langs = publicLangs(job);
  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <JobLink job={job} className="min-w-0 flex-1" />
          <button type="button" className="aj-pill shrink-0" onClick={() => copyLink(url)}>
            <Copy size={13} strokeWidth={1.8} /> Copy link
          </button>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <button type="button" className="aj-text-btn" onClick={() => open.part('publish')}>
            What happens next
          </button>
          {job.plan === 'free' && job.status !== 'closed' && !s.reviewerAs && (
            <button
              type="button"
              className="aj-text-btn"
              onClick={() => {
                setChoice(job.id, 'amplify');
                open.part('publish');
              }}
            >
              Amplify to invite people directly
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      <span className="ej-panel-label inline-flex items-center gap-1.5">
        <CheckCircle2 size={13} strokeWidth={2} style={{ color: 'var(--sage-7)' }} /> {scheduled ? `Scheduled for ${longDate(job.scheduledFor ?? '')}` : job.status === 'closed' ? 'Closed' : 'Live on AidJobs'}
      </span>
      <span className="aj-muted">
        {job.plan === 'amplify' ? `Amplified: featured, with the “Actively hiring” badge, listed until ${longDate(listedUntil(job, s.today))}.` : `Free: standard placement, listed until ${longDate(listedUntil(job, s.today))}.`}
        {langs.length ? ` In ${langOf(jobLang(job)).label} and ${langs.map((k) => langOf(k).label).join(' and ')}.` : ''} In this demo it is published only in this browser.
      </span>
      <div className="aj-card flex items-center gap-2 py-2 pl-3 pr-2">
        <JobLink job={job} className="flex-1" />
        <button type="button" className="aj-pill shrink-0" onClick={() => copyLink(url)}>
          <Copy size={13} strokeWidth={1.8} /> Copy link
        </button>
      </div>
      {job.plan === 'amplify' && (
        <div className="flex flex-col gap-0.5" aria-live="polite">
          <span style={{ fontWeight: 650 }}>
            <Send size={13} strokeWidth={1.8} className="inline" /> Reach
          </span>
          {round ? (
            <>
              <span className="aj-muted">Invitations: {deliveryText(job.reach?.candidates.filter((r) => r.round === round.n) ?? [])}</span>
              <span className="aj-muted">Team: {deliveryText(job.reach?.team.filter((r) => r.round === round.n) ?? [])}</span>
              <span className="aj-faint" style={{ fontSize: 11.5 }}>
                {round.sendsOn && scheduled ? `Sends on ${longDate(round.sendsOn)}, when the job goes live.` : 'Simulated.'} A failed email never unpublishes the job.
              </span>
            </>
          ) : (
            <span className="aj-muted">Nobody invited yet. You can invite people from the job&apos;s page while it is live.</span>
          )}
        </div>
      )}
      {job.plan !== 'amplify' && <span className="aj-faint">Visitors can share it to WhatsApp, LinkedIn, and more from the job page.</span>}
      <div className="flex flex-wrap gap-1.5">
        {!scheduled && (
          <button type="button" className="aj-ink-btn" onClick={() => go('public', job.id)}>
            View the job page <ExternalLink size={13} strokeWidth={2} />
          </button>
        )}
        <button type="button" className="aj-pill" onClick={() => go('jobs', job.id)}>
          Manage this job
        </button>
        <button type="button" className="aj-pill" onClick={() => downloadCopy(job, s.org.name, true)}>
          Download a copy
        </button>
        <button type="button" className="aj-pill" onClick={() => go('create')}>
          Create another job
        </button>
      </div>
      {job.plan === 'free' && job.status !== 'closed' && !s.reviewerAs && (
        <button
          type="button"
          className="aj-text-btn self-start"
          onClick={() => {
            setChoice(job.id, 'amplify');
            open.part('publish');
          }}
        >
          Amplify to invite people directly
        </button>
      )}
    </div>
  );
}

/** The Payment tab: how Amplify is paid, the extra languages, and the same button. */
export function PaymentPanel({ job, s, open }: { job: DemoJob; s: State; open: Opener }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="aj-muted">One job, or a package that pays less per job and includes {LANGS_INCLUDED.package} language versions. Extra languages are {usd(LANGUAGE_PRICE)} each, in the same payment.</span>
      <PublishCard job={job} s={s} open={open} payment />
    </div>
  );
}
