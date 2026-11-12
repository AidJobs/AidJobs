'use client';

import { Copy, Sparkles, Undo2, X } from 'lucide-react';
import { createContext, useContext, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import BottomSheet, { useIsPhone } from '@/components/site/BottomSheet';
import Tip from '@/components/site/Tip';
import { forgetProfile, restoreDeleted } from './actions';
import { jobUrl } from './links';
import { dismissNotice, notify, undo, useDemo } from './store';
import type { DemoJob, JobStatus } from './types';

/** Arrow keys move between the options of a radio group and choose the one they land on; nested groups keep their own options. */
export function radioKeys(e: ReactKeyboardEvent<HTMLElement>) {
  const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
  if (!forward && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp') return;
  const group = e.currentTarget;
  const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])')].filter((r) => r.closest('[role="radiogroup"]') === group);
  const at = radios.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  e.preventDefault();
  const next = radios[(at + (forward ? 1 : -1) + radios.length) % radios.length];
  next.focus();
  next.click();
}

/** A job's public address as a link, opening in a new tab; with `copy`, a small button to copy it. */
export function JobLink({ job, copy = false, className = '' }: { job: DemoJob; copy?: boolean; className?: string }) {
  const url = jobUrl(job);
  const copyIt = async () => {
    try {
      await navigator.clipboard.writeText(url);
      notify('Link copied');
    } catch {
      notify('Copy failed: select the link and copy it yourself');
    }
  };
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <a href={url} target="_blank" rel="noopener noreferrer" className="ej-link min-w-0 truncate">
        {url}
      </a>
      {copy && (
        <button type="button" className="ej-link-copy" onClick={copyIt} aria-label="Copy the link">
          <Copy size={12} strokeWidth={2} />
        </button>
      )}
    </span>
  );
}

const LEGAL: Record<'terms' | 'privacy' | 'about', { title: string; lines: string[] }> = {
  terms: { title: 'Terms', lines: ['The terms of use for employers and candidates.', 'A placeholder in the demo: the final text comes with the launch pages.'] },
  privacy: { title: 'Privacy', lines: ['What AidJobs collects and why; candidates apply on the employer’s own site; recruiters’ contact details are not stored.', 'A placeholder in the demo: the final text comes with the launch pages.'] },
  about: { title: 'About', lines: ['AidJobs lists jobs in humanitarian and development work, from the organisations themselves; how employers opt out or ask for a job to be taken down.', 'A placeholder in the demo: the final text comes with the launch pages.'] },
};

/** "© 2026 AidJobs. All rights reserved." with Terms, Privacy, and About. */
export function LegalLine({ year, className = '' }: { year: number; className?: string }) {
  const [open, setOpen] = useState<keyof typeof LEGAL | null>(null);
  return (
    <div className={`aj-faint flex flex-wrap items-center gap-x-2 gap-y-0.5 ${className}`} style={{ fontSize: 11 }}>
      <span>© {year} AidJobs. All rights reserved.</span>
      {(Object.keys(LEGAL) as Array<keyof typeof LEGAL>).map((k) => (
        <button key={k} type="button" className="ej-legal-link" onClick={() => setOpen(k)}>
          {LEGAL[k].title}
        </button>
      ))}
      {open && (
        <Dialog title={LEGAL[open].title} subtitle="AidJobs" onClose={() => setOpen(null)} half>
          <div className="flex flex-col gap-2">
            {LEGAL[open].lines.map((l) => (
              <p key={l} className="aj-muted" style={{ margin: 0 }}>
                {l}
              </p>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
}

const STEP_HINTS = ['back to the job description', 'open the checks', 'open the publishing choices'];

/**
 * Where the user is between writing and publishing, 1 Write · 2 Check · 3 Publish. With `onStep`, the other steps open their screen;
 * with `all`, the current one is a button too (on the publish page, where Check and Publish are parts of the same screen).
 */
export function Steps({ current, onStep, badge = 0, all = false }: { current: 1 | 2 | 3; onStep?: (n: 1 | 2 | 3) => void; badge?: number; all?: boolean }) {
  return (
    <ol className="ej-steps" aria-label="Steps to publish">
      {(['Write', 'Check', 'Publish'] as const).map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const name = `${label}${n === 2 && badge > 0 ? `, ${badge} to look at` : ''}: ${STEP_HINTS[i]}`;
        const inner = (
          <>
            <span className="ej-step-n" aria-hidden>
              {n}
            </span>
            {label}
            {n === 2 && badge > 0 && (
              <span className="ej-count-badge">
                {badge}
                <span className="sr-only"> to look at</span>
              </span>
            )}
          </>
        );
        return (
          <li key={label}>
            {onStep && (all || n !== current) ? (
              <button type="button" className="ej-step" aria-label={name} aria-current={n === current ? 'step' : undefined} data-done={n < current || undefined} onClick={() => onStep(n)}>
                {inner}
              </button>
            ) : (
              <span className="ej-step" aria-current={n === current ? 'step' : undefined} data-done={n < current || undefined}>
                {inner}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The place in the top bar, beside the organisation's name, where a screen can put its own tools. */
export const HeaderSlotContext = createContext<HTMLElement | null>(null);

/** Puts a screen's own tools in the top bar (Manage jobs: its group shortcuts and search). */
export function HeaderSlot({ children }: { children: ReactNode }) {
  const el = useContext(HeaderSlotContext);
  return el ? createPortal(children, el) : null;
}

export function DemoMark({ label = 'Demo · sample data' }: { label?: string }) {
  return (
    <Tip label="Everything here is simulated. Nothing is published, paid for, or sent." side="bottom">
      <span className="aj-chip" data-tone="amber" tabIndex={0}>
        <Sparkles size={11} strokeWidth={2} />
        {label}
      </span>
    </Tip>
  );
}

export function OrgMark({ name, size = 22 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return (
    <span className="aj-mark" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden>
      {initials}
    </span>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, the last one on top: Escape and the focus trap belong to the top one only (a checkout opened inside Reopen). */
const openDialogs: object[] = [];

/** A dialog on wide screens and a bottom sheet on phones. */
export function Dialog({ title, subtitle, onClose, footer, children, wide, half }: { title: string; subtitle?: ReactNode; onClose: () => void; footer?: ReactNode; children: ReactNode; wide?: boolean; half?: boolean }) {
  const phone = useIsPhone();
  const card = useRef<HTMLDivElement>(null);
  const [self] = useState(() => ({}));
  useEffect(() => {
    openDialogs.push(self);
    return () => {
      openDialogs.splice(openDialogs.indexOf(self), 1);
    };
  }, [self]);
  // Read before the dialog's own fields can take focus.
  const [opener] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)));
  useEffect(() => {
    if (phone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openDialogs[openDialogs.length - 1] === self) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phone, onClose, self]);
  // Focus moves into the dialog, stays there while it is open, and goes back to where it was when it closes.
  useEffect(() => {
    const box = card.current;
    if (phone || !box) return;
    const focusable = () => [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[hidden]') && el.getClientRects().length > 0);
    if (!box.contains(document.activeElement)) {
      const list = focusable();
      (list.find((el) => el.matches('input, textarea, select')) ?? list.find((el) => el.getAttribute('aria-label') !== 'Close') ?? box).focus();
    }
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || openDialogs[openDialogs.length - 1] !== self) return;
      const list = focusable();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      if (opener?.isConnected && opener !== document.body) opener.focus();
    };
  }, [phone, opener, self]);
  if (phone) {
    return (
      <BottomSheet title={title} subtitle={subtitle} onClose={onClose} footer={footer} tall={!half}>
        <div className="aj-scroll flex-1 px-1 pb-4" style={half ? { maxHeight: '46dvh' } : undefined}>
          {children}
        </div>
      </BottomSheet>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="aj-scrim absolute inset-0" onClick={onClose} aria-hidden />
      <div ref={card} tabIndex={-1} className="aj-card relative flex max-h-[86vh] w-full flex-col" style={{ maxWidth: wide ? 820 : 560, outline: 'none' }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center gap-2 px-5 pb-2 pt-4">
          <span className="aj-title" style={{ fontSize: 15 }}>
            {title}
          </span>
          {subtitle && <span className="aj-faint min-w-0 truncate">{subtitle}</span>}
          <button type="button" className="aj-icon-btn ml-auto" onClick={onClose} aria-label="Close">
            <X size={15} strokeWidth={1.8} />
          </button>
        </div>
        <div className="aj-scroll min-h-0 flex-1 px-5 pb-4">{children}</div>
        {footer && <div className="border-t px-5 py-3 aj-hair">{footer}</div>}
      </div>
    </div>
  );
}

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;

export function isEmail(s: string): boolean {
  return EMAIL.test(s.trim());
}

/** Email addresses as chips: type or paste several, separated by commas, spaces, or new lines. */
export function RecipientInput({
  label,
  value,
  onChange,
  max,
  domain,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  max: number;
  domain?: string;
  placeholder: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const commit = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    const problems: string[] = [];
    for (const p of parts) {
      if (!isEmail(p)) problems.push(`${p} is not an email address`);
      else if (domain && !p.endsWith(`@${domain}`)) problems.push(`${p}: team emails go only to @${domain} addresses`);
      else if (next.includes(p)) problems.push(`${p} is already added`);
      else if (next.length >= max) problems.push(`Up to ${max} recipients`);
      else next.push(p);
    }
    onChange(next);
    setError(problems.join(' · '));
    setDraft('');
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="aj-muted flex items-center justify-between">
        <span>{label}</span>
        <span className="aj-faint" aria-live="polite">
          {value.length} of {max}
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border p-2 aj-hair" style={{ background: 'var(--surface)' }}>
        {value.map((v) => (
          <span key={v} className="aj-chip" data-tone="sage" style={{ height: 26 }}>
            {v}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'inline-flex' }}>
              <X size={11} strokeWidth={2.2} />
            </button>
          </span>
        ))}
        <input
          id={id}
          className="min-w-[160px] flex-1"
          style={{ border: 'none', outline: 'none', background: 'transparent', font: 'inherit', fontSize: 13, color: 'var(--text)', height: 28 }}
          value={draft}
          placeholder={value.length ? 'Add another' : placeholder}
          inputMode="email"
          autoComplete="off"
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;\s]$/.test(v)) commit(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(draft);
            } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onPaste={(e) => {
            e.preventDefault();
            commit(e.clipboardData.getData('text'));
          }}
          onBlur={() => commit(draft)}
        />
      </div>
      {error && (
        <span role="alert" style={{ color: 'var(--red)', fontSize: 11.5 }}>
          {error}
        </span>
      )}
    </div>
  );
}

export const STAGES: Array<{ key: string; label: string }> = [
  { key: 'draft', label: 'Draft' },
  { key: 'review', label: 'Review' },
  { key: 'live', label: 'Live' },
  { key: 'closing', label: 'Closing' },
  { key: 'closed', label: 'Closed' },
];

export function stageOf(job: DemoJob, daysLeft: number | null): string {
  const s: JobStatus = job.status;
  if (s === 'draft') return 'draft';
  if (s === 'review' || s === 'approved') return 'review';
  if (s === 'scheduled') return 'live';
  if (s === 'live') return daysLeft !== null && daysLeft <= 3 ? 'closing' : 'live';
  return 'closed';
}

/** One line from draft to closed, with a pulse where the job needs attention. */
export function Lifeline({ stage, attention }: { stage: string; attention: boolean }) {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return (
    <div className="flex items-center gap-1" aria-label={`Stage: ${STAGES[idx]?.label ?? stage}${attention ? ', needs you' : ''}`} role="img">
      {STAGES.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1" style={{ flex: i < STAGES.length - 1 ? 1 : 'none' }}>
          <span
            className={i === idx && attention ? 'ej-pulse' : undefined}
            style={{
              width: i === idx ? 10 : 7,
              height: i === idx ? 10 : 7,
              borderRadius: 999,
              flexShrink: 0,
              background: i < idx ? 'var(--sage-5)' : i === idx ? (attention ? 'var(--amber)' : 'var(--sage-7)') : 'var(--hair)',
            }}
          />
          {i < STAGES.length - 1 && <span style={{ flex: 1, height: 2, borderRadius: 2, background: i < idx ? 'var(--sage-3)' : 'var(--hair)' }} />}
        </span>
      ))}
    </div>
  );
}

export function PlanBadge({ plan }: { plan: DemoJob['plan'] }) {
  if (plan === 'amplify')
    return (
      <span className="aj-chip" data-tone="sage">
        Amplified
      </span>
    );
  if (plan === 'free') return <span className="aj-chip">Free</span>;
  return null;
}

/** The single notice at the bottom of the screen. It stays until it is dismissed or replaced; it never times out. */
export function NoticeBar() {
  const { notice, deleted } = useDemo();
  if (!notice) return null;
  const restorable = Boolean(notice.restore && (deleted ?? []).some((d) => d.job.id === notice.restore));
  return (
    <div className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3" style={{ bottom: 'max(16px, env(safe-area-inset-bottom))' }}>
      <div className="pointer-events-auto flex max-w-[560px] items-center gap-2 rounded-full px-4 py-2" style={{ background: 'var(--ink)', color: 'var(--on-ink)' }} role="status" aria-live="polite">
        <span className="min-w-0 flex-1">{notice.text}</span>
        {notice.undo && (
          <button type="button" className="inline-flex items-center gap-1" style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 700, cursor: 'pointer' }} onClick={undo}>
            <Undo2 size={13} strokeWidth={2} /> Undo
          </button>
        )}
        {notice.unprofile && (
          <button type="button" className="inline-flex items-center gap-1" style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 700, cursor: 'pointer' }} onClick={() => notice.unprofile && forgetProfile(notice.unprofile)}>
            <Undo2 size={13} strokeWidth={2} /> Undo
          </button>
        )}
        {restorable && notice.restore && (
          <button type="button" className="inline-flex items-center gap-1" style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 700, cursor: 'pointer' }} onClick={() => notice.restore && restoreDeleted(notice.restore)}>
            <Undo2 size={13} strokeWidth={2} /> Restore
          </button>
        )}
        <Tip label="Dismiss">
          <button type="button" style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'inline-flex' }} onClick={dismissNotice} aria-label="Dismiss">
            <X size={14} strokeWidth={2} />
          </button>
        </Tip>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="aj-muted">{label}</span>
      {children}
      {hint && <span className="aj-faint" style={{ fontSize: 11 }}>{hint}</span>}
    </label>
  );
}

export const inputStyle = {
  width: '100%',
  minHeight: 38,
  padding: '8px 12px',
  borderRadius: 12,
  border: '1px solid var(--hair)',
  background: 'var(--surface)',
  color: 'var(--text)',
  font: 'inherit',
  fontSize: 13,
  outline: 'none',
} as const;

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="aj-section-label" style={{ padding: 0, margin: 0 }}>
          {title}
        </h2>
        <span className="ml-auto">{action}</span>
      </div>
      {children}
    </section>
  );
}
