'use client';

import { ShieldCheck } from 'lucide-react';
import Tip from '@/components/site/Tip';
import { BADGE, BADGE_TIP, LANGS_INCLUDED, LANGUAGE_PRICE, LISTED_DAYS, ONE_JOB, usd } from './plans';
import type { State } from './types';
import { Dialog } from './ui';

/** The free terms (section 19, phase 5, D), shown on the Free choice, in the one-time "I understand", and on the Billing page. */
export function FreeTerms({ s }: { s: State }) {
  return (
    <ul className="aj-muted flex flex-col gap-0.5" style={{ margin: 0, paddingLeft: 18 }}>
      <li>One standard listing free for {s.org.name}, once, never renewed; separate from the one free Amplify</li>
      <li>Used only when the job goes live; scheduled, it holds the place, given back if the date is taken back; writing and review are free</li>
      <li>Listed {LISTED_DAYS.free} days, or until its closing date if that is sooner; standard placement</li>
      <li>One language, the one it is written in; a copy can be downloaded once it is live</li>
      <li>After it, a job goes out with Amplify ({usd(ONE_JOB)} a job), a package job, or the subscription</li>
    </ul>
  );
}

/** The free Amplify's terms: everything a paid Amplify job has, once per organisation. */
export function FreeAmplifyTerms() {
  return <span className="aj-muted">Free once for your organisation · after this, {usd(ONE_JOB)} a job or part of a package. Everything a paid Amplify job has, Reach included. The free standard listing is separate.</span>;
}

/** What Amplify adds to a job. */
export function AmplifyIncludes() {
  return (
    <ul className="aj-muted flex flex-col gap-0.5" style={{ margin: 0, paddingLeft: 18 }}>
      <li>
        Listed {LISTED_DAYS.amplify} days, featured placement, and the{' '}
        <Tip label={BADGE_TIP}>
          <span tabIndex={0} style={{ textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>
            &ldquo;{BADGE}&rdquo; badge
          </span>
        </Tip>
      </li>
      <li>Reach: invite candidates and your team by email when it goes live</li>
      <li>Market check: how your job compares with similar open jobs</li>
      <li>Full advert check and a field-post notice</li>
      <li>
        {LANGS_INCLUDED.single} language version besides its own, paid on its own or with the free Amplify ({LANGS_INCLUDED.package} with a package or subscription job); each further language {usd(LANGUAGE_PRICE)}
      </li>
      <li>A copy to download as soon as it is paid</li>
    </ul>
  );
}

/** A labelled, simulated checkout. A real payment provider's checkout replaces it later without changing the screens around it. */
export function Checkout({ item, amount, onPaid, onDeclined, onClose }: { item: string; amount: string; onPaid: () => void; onDeclined: () => void; onClose: () => void }) {
  return (
    <Dialog
      title="Checkout"
      subtitle="Simulated · no card is charged"
      onClose={onClose}
      half
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="aj-text-btn mr-auto" onClick={onDeclined}>
            Simulate a declined card
          </button>
          <button type="button" className="aj-pill" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="aj-ink-btn" onClick={onPaid}>
            Pay {amount}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="aj-card flex items-center justify-between gap-3 p-3">
          <span className="min-w-0">{item}</span>
          <strong className="shrink-0">{amount}</strong>
        </div>
        <p className="aj-muted" style={{ margin: 0 }}>
          In the product, Paddle&apos;s checkout opens here. Paddle is the merchant of record: it charges the card, adds sales tax or VAT where it applies, and emails the receipt and invoice.
        </p>
        <span className="aj-faint inline-flex items-center gap-1">
          <ShieldCheck size={12} strokeWidth={2} /> Prices are placeholders. Payments are not refunded, except where the law requires it.
        </span>
      </div>
    </Dialog>
  );
}
