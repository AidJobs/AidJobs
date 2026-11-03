'use client';

import { Check, ChevronDown, ClipboardPaste, FileText, History, Link2, Plus, Repeat2, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { hireAgain } from './actions';
import { FAMILIES_ORDER } from './engine';
import { statusLine } from './Home';
import { go } from './store';
import type { Format, State } from './types';

/**
 * A tool in the chat box whose menu opens on hover with a mouse, or on tap or Enter: below the box, or above it
 * when there is more room there, never taller than the room so the page itself never scrolls.
 * Escape, a click outside, or moving the mouse away closes it.
 */
function HoverMenu({ label, trigger, icon, children }: { label: string; trigger: ReactNode; icon?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ up: false, max: 360 });
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  const show = () => {
    cancel();
    const box = (wrap.current?.closest('.ej-composer') ?? wrap.current)?.getBoundingClientRect();
    const area = wrap.current?.closest('.aj-scroll')?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    if (box) {
      const below = area.bottom - box.bottom - 12;
      const above = box.top - area.top - 12;
      const up = below < 240 && above > below;
      setPlace({ up, max: Math.max(160, Math.min(360, up ? above : below)) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div
      ref={wrap}
      className="flex min-w-0"
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse' && !open) show();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return;
        cancel();
        timer.current = setTimeout(() => setOpen(false), 250);
      }}
    >
      <button
        ref={button}
        type="button"
        className="ej-tool"
        data-icon={icon ? 'true' : undefined}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => !open && show()}
      >
        {trigger}
      </button>
      {open && (
        <div id={menuId} className="ej-menu" data-up={place.up} style={{ maxHeight: place.max }} role="group" aria-label={label} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, title, meta, text, current, onClick }: { icon: LucideIcon; title: string; meta?: string; text?: string; current?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="ej-menu-item" aria-current={current ? 'true' : undefined} onClick={onClick}>
      <Icon size={15} strokeWidth={1.8} className="mt-0.5 shrink-0" style={{ color: current ? 'var(--sage-7)' : 'var(--text-2)' }} />
      <span className="min-w-0 flex-1">
        <span style={{ fontWeight: 650 }}>{title}</span>
        {meta && <span className="aj-faint"> · {meta}</span>}
        {text && <small>{text}</small>}
      </span>
      {current && <Check size={14} strokeWidth={2.2} className="mt-0.5 shrink-0" style={{ color: 'var(--sage-7)' }} />}
    </button>
  );
}

/** "+": start from what the organisation already has. */
export function PlusMenu({ s, format, onSources, onPaste, onLink }: { s: State; format: Format; onSources: () => void; onPaste: () => void; onLink: () => void }) {
  const past = s.jobs.filter((j) => j.status === 'closed').slice(0, 3);
  const learned = s.org.learned
    ? `${format.label}, learned from ${s.org.learned.adverts} of your adverts${s.org.learned.confirmed ? '' : ', not yet confirmed'}. Choose where AidJobs learns it.`
    : 'No adverts read yet. Give AidJobs your careers page or past adverts.';
  return (
    <HoverMenu label="Start from what you have" icon trigger={<Plus size={16} strokeWidth={2} />}>
      <>
        <MenuItem icon={FileText} title="Your format" text={learned} onClick={onSources} />
        <MenuItem icon={ClipboardPaste} title="Upload or paste a job description" text="A job description or terms of reference. Your wording and headings are kept." onClick={onPaste} />
        <MenuItem icon={Link2} title="Use a job description from a link" text="Paste the web address of a job description. AidJobs reads that one page and keeps its wording." onClick={onLink} />
        {past.length > 0 && <span className="ej-menu-label">Hire again, starting from last time&rsquo;s text</span>}
        {past.map((j) => (
          <MenuItem
            key={j.id}
            icon={Repeat2}
            title={j.facts.title}
            meta={j.facts.location.split(',')[0]}
            onClick={() => {
              const id = hireAgain(j.id);
              if (id) go('create', id);
            }}
          />
        ))}
      </>
    </HoverMenu>
  );
}

/** The format the new job is written in; choosing one applies its headings, order, and tone. */
export function FormatMenu({ s, value, onChange }: { s: State; value: string; onChange: (key: string) => void }) {
  const formats = s.formats.filter((f) => !f.key.startsWith('pasted-'));
  const current = formats.find((f) => f.key === value) ?? formats[0];
  return (
    <HoverMenu
      label={`Format: ${current.label}`}
      trigger={
        <>
          <FileText size={14} strokeWidth={1.8} className="shrink-0" />
          <span className="ej-tool-text max-w-[96px] sm:max-w-[180px]">{current.label}</span>
          <ChevronDown size={13} strokeWidth={2} className="shrink-0" />
        </>
      }
    >
      {FAMILIES_ORDER.map((fam) => {
        const list = formats.filter((f) => f.family === fam);
        if (!list.length) return null;
        return (
          <div key={fam}>
            <span className="ej-menu-label">{fam}</span>
            {list.map((f) => (
              <MenuItem
                key={f.key}
                icon={FileText}
                title={f.label}
                text={f.usedBy}
                current={f.key === current.key}
                onClick={() => {
                  onChange(f.key);
                }}
              />
            ))}
          </div>
        );
      })}
    </HoverMenu>
  );
}

/** Drafts and jobs in review, to pick up where they were left. */
export function DraftsMenu({ s }: { s: State }) {
  const waiting = s.jobs.filter((j) => j.status === 'draft' || j.status === 'review' || j.status === 'approved');
  if (!waiting.length) return null;
  return (
    <HoverMenu
      label={`Continue a draft: ${waiting.length}`}
      trigger={
        <>
          <History size={14} strokeWidth={1.8} className="shrink-0" />
          <span className="hidden sm:inline">Continue</span>
          <span className="aj-faint">{waiting.length}</span>
        </>
      }
    >
      <>
        <span className="ej-menu-label">Continue</span>
        {waiting.map((j) => (
          <MenuItem
            key={j.id}
            icon={FileText}
            title={j.facts.title || 'Untitled draft'}
            text={statusLine(s, j)}
            onClick={() => {
              go('create', j.id);
            }}
          />
        ))}
      </>
    </HoverMenu>
  );
}
