'use client';

import { Receipt as ReceiptIcon } from 'lucide-react';
import { useState } from 'react';
import { buy, cancelSubscription, resumeSubscription } from './actions';
import { allowance, allowanceText, EXTRA_JOB, ONE_JOB, packageOf, PACKAGES, SUBSCRIPTION_JOBS, usd, type FreeKind, type PackageKey } from './plans';
import { daysUntil, longDate } from './engine';
import { Checkout, FreeAmplifyTerms, FreeTerms } from './Pricing';
import { notify, useDemo } from './store';
import { DemoMark, Section } from './ui';

/** The two free listings, each used or available, the package or subscription balance, receipts, and the refund policy. */
export default function Billing() {
  const s = useDemo();
  const [checkout, setCheckout] = useState<PackageKey | null>(null);
  const line = (kind: FreeKind, label: string) => {
    const a = allowance(s, kind);
    return (
      <div className="flex flex-wrap items-baseline gap-x-2" data-allowance={kind} data-state={a.state}>
        <span style={{ fontWeight: 650, fontSize: 15 }}>
          {label}: {a.state === 'available' ? 'available' : a.state === 'held' ? 'held' : 'used'}
        </span>
        {a.state !== 'available' && <span className="aj-muted">{allowanceText(s, kind).replace(/^(used|held) by /, '')}</span>}
      </div>
    );
  };
  const sub = s.subscription;
  const packs = s.packs.filter((p) => p.left > 0);
  const soon = (ends: string) => {
    const d = daysUntil(s.today, ends);
    return d <= 14 ? `Ends ${d <= 0 ? 'today' : `in ${d} ${d === 1 ? 'day' : 'days'}`}: unused jobs lapse then.` : null;
  };
  const buying = PACKAGES.find((p) => p.key === checkout);

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-4 py-5 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="aj-display aj-h1" style={{ margin: 0 }}>
          Billing
        </h1>
        <DemoMark label="Demo · simulated payments, placeholder prices" />
      </div>

      <Section title="Free listings">
        <div className="aj-card flex flex-col gap-2 p-4">
          {line('standard', 'Free standard')}
          <FreeTerms s={s} />
        </div>
        <div className="aj-card flex flex-col gap-2 p-4">
          {line('amplify', 'Free Amplify')}
          <FreeAmplifyTerms />
          {!s.org.verified && <span style={{ color: 'var(--amber)' }}>Amplify, free or paid, is for verified organisations.</span>}
        </div>
        <span className="aj-faint" style={{ fontSize: 11.5 }}>
          Each is used on the day its job goes live, never renewed. Scheduled, the job holds it; taken back to a draft, withdrawn, or deleted first, it is given back.
        </span>
      </Section>

      <Section title="Package">
        <div className="flex flex-col gap-2">
          {sub && (
            <div className="aj-card flex flex-col gap-1 p-4">
              <div style={{ fontWeight: 650 }}>&ldquo;Always hiring&rdquo; · {usd(packageOf('always').price)} a month</div>
              <span className="aj-muted">
                {sub.left} of {SUBSCRIPTION_JOBS} jobs left this month · {sub.cancelled ? `cancelled: it ends on ${longDate(sub.renews)}` : `renews on ${longDate(sub.renews)}`}
              </span>
              <span className="aj-faint">Unused jobs lapse at renewal. Extra jobs {usd(EXTRA_JOB)} each.</span>
              {sub.cancelled ? (
                <button type="button" className="aj-pill mt-1 self-start" onClick={resumeSubscription}>
                  Resume the subscription
                </button>
              ) : (
                <button type="button" className="aj-pill mt-1 self-start" onClick={cancelSubscription}>
                  Cancel the subscription
                </button>
              )}
            </div>
          )}
          {packs.map((p) => (
            <div key={p.id} className="aj-card flex flex-col gap-1 p-4">
              <div style={{ fontWeight: 650 }}>{p.jobs} jobs</div>
              <span className="aj-muted">
                {p.left} of {p.jobs} left · use by {longDate(p.ends)}
              </span>
              {soon(p.ends) && <span style={{ color: 'var(--amber)' }}>{soon(p.ends)}</span>}
            </div>
          ))}
          {!sub && !packs.length && (
            <div className="aj-card aj-muted p-4">No package. Beyond the two free listings, jobs are amplified one at a time, {usd(ONE_JOB)} each, when they are published.</div>
          )}
          <div className="aj-card flex flex-col p-1.5" role="list" aria-label="Packages">
            {PACKAGES.map((p) => (
              <div key={p.key} role="listitem" className="flex items-center gap-3 rounded-xl p-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span style={{ fontWeight: 650 }}>{p.label}</span>
                  <span className="aj-faint">{p.rule}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <strong>
                    {usd(p.price)}
                    {p.key === 'always' ? ' a month' : ''}
                  </strong>
                  {p.key !== 'one' && <span className="aj-faint">{usd(p.perJob)} a job</span>}
                </span>
                <span className="flex w-[64px] shrink-0 justify-end">
                  {p.key === 'one' ? null : p.key === 'always' && sub ? (
                    <span className="aj-faint">Yours</span>
                  ) : (
                    <button type="button" className="aj-pill" onClick={() => setCheckout(p.key)}>
                      Buy
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
          <span className="aj-faint" style={{ fontSize: 11.5 }}>
            Placeholder prices, the same for every type of organisation. A package job can also amplify a live free job; a free listing once used stays used. Paying uses neither free listing.
          </span>
        </div>
      </Section>

      <Section title="Receipts">
        {s.receipts.length === 0 ? (
          <div className="aj-card aj-muted p-4">No receipts yet.</div>
        ) : (
          <ul className="aj-card flex flex-col p-1.5" style={{ listStyle: 'none', margin: 0 }}>
            {s.receipts.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl p-2.5">
                <ReceiptIcon size={15} strokeWidth={1.8} className="aj-faint shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{r.item}</span>
                  <span className="aj-faint">{new Date(r.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · simulated</span>
                </span>
                <strong className="shrink-0">{r.amount}</strong>
              </li>
            ))}
          </ul>
        )}
        <span className="aj-faint" style={{ fontSize: 11.5 }}>
          In the product, Paddle is the merchant of record: it emails each receipt and invoice, with sales tax or VAT where it applies.
        </span>
      </Section>

      <Section title="Refund policy">
        <p className="aj-muted" style={{ margin: 0 }}>
          Payments are not refunded, except where the law requires it. Unused package jobs lapse at the end of their period, after reminders 2 weeks and 3 days before.
        </p>
      </Section>

      {buying && (
        <Checkout
          item={buying.key === 'always' ? `“Always hiring” subscription, first month (${SUBSCRIPTION_JOBS} jobs)` : `${buying.jobs} jobs, ${buying.rule.toLowerCase()}`}
          amount={usd(buying.price)}
          onPaid={() => {
            buy(buying.key);
            setCheckout(null);
            notify('Paid (simulated). The jobs are used when you amplify and publish.');
          }}
          onDeclined={() => {
            setCheckout(null);
            notify('The card was declined (simulated). Nothing was charged.');
          }}
          onClose={() => setCheckout(null)}
        />
      )}
    </div>
  );
}
