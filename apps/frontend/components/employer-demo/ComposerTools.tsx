'use client';

import { ChevronDown, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Tip from '@/components/site/Tip';
import { hireAgain } from './actions';
import { FAMILIES_ORDER } from './engine';
import { statusLine } from './Home';
import { go } from './store';
import type { State } from './types';

/**
 * A tool in the chat box. A click opens its menu below the box, or above it when there is more room there, never
 * taller than the room, so the page itself never scrolls. Escape, a click outside, or choosing an option closes it.
 */
function ClickMenu({ label, trigger, icon, children }: { label: string; trigger: ReactNode; icon?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ up: false, max: 360 });
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const toggle = () => {
    if (open) return setOpen(false);
    const box = (wrap.current?.closest('.ej-composer') ?? wrap.current)?.getBoundingClientRect();
    const area = wrap.current?.closest('.aj-scroll')?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    if (box) {
      const below = area.bottom - box.bottom - 12;
      const above = box.top - area.top - 12;
      const up = below < 240 && above > below;
      setPlace({ up, max: Math.max(96, Math.min(360, up ? above : below)) });
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
    <div ref={wrap} className="flex min-w-0">
      <button ref={button} type="button" className="ej-tool" data-icon={icon ? 'true' : undefined} aria-label={label} aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={toggle}>
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

/** One option: its name only; the details show on hover or keyboard focus. */
function MenuItem({ title, tip, current, onClick }: { title: string; tip: string; current?: boolean; onClick: () => void }) {
  return (
    <Tip label={tip} side="right">
      <button type="button" className="ej-menu-item" aria-current={current ? 'true' : undefined} onClick={onClick}>
        {title}
      </button>
    </Tip>
  );
}

/** "+": start from what the organisation already has. */
export function PlusMenu({ s, onFormat, onPaste, onLink }: { s: State; onFormat: () => void; onPaste: () => void; onLink: () => void }) {
  const past = s.jobs.filter((j) => j.status === 'closed').slice(0, 3);
  return (
    <ClickMenu label="Start from what you have" icon trigger={<Plus size={16} strokeWidth={2} />}>
      <MenuItem title="Upload your format" tip={`Paste or upload one of your past adverts, or give your careers-page link. AidJobs learns your headings and their order, and new jobs start from them (now: ${s.formats.find((f) => f.key === 'house')?.label ?? 'none yet'}).`} onClick={onFormat} />
      <MenuItem title="Upload or paste a job description" tip="A job description or terms of reference you already have. Your wording and headings are kept." onClick={onPaste} />
      <MenuItem title="Use a job description from a link" tip="The web address of a job description online. AidJobs reads that one page and keeps its wording." onClick={onLink} />
      {past.length > 0 && <span className="ej-menu-label">Hire again</span>}
      {past.map((j) => (
        <MenuItem
          key={j.id}
          title={j.facts.title}
          tip={`${j.facts.location ? `${j.facts.location}. ` : ''}Starts from last time's text, with new dates.`}
          onClick={() => {
            const id = hireAgain(j.id);
            if (id) go('create', id);
          }}
        />
      ))}
    </ClickMenu>
  );
}

/** The format the new job is written in; choosing one applies its headings, order, and tone. */
export function FormatMenu({ s, value, onChange, onCreate }: { s: State; value: string | null; onChange: (key: string) => void; onCreate: () => void }) {
  const formats = s.formats.filter((f) => !f.key.startsWith('pasted-'));
  const current = formats.find((f) => f.key === value);
  return (
    <ClickMenu
      label={current ? `Format: ${current.label}` : 'Select a format'}
      trigger={
        <>
          <span className="ej-tool-text max-w-[110px] sm:max-w-[200px]">{current ? current.label : 'Select a format'}</span>
          <ChevronDown size={13} strokeWidth={2} className="shrink-0" />
        </>
      }
    >
      <MenuItem title="Create your own format" tip="Name it, choose its sections and headings, and save it for reuse." onClick={onCreate} />
      <div className="ej-menu-sep" />
      {FAMILIES_ORDER.map((fam) => {
        const list = formats.filter((f) => f.family === fam);
        if (!list.length) return null;
        return (
          <div key={fam}>
            <span className="ej-menu-label">{fam}</span>
            {list.map((f) => (
              <MenuItem key={f.key} title={f.label} tip={`${f.usedBy}. Headings: ${f.order.map((o) => o.heading).join(', ')}.`} current={f.key === current?.key} onClick={() => onChange(f.key)} />
            ))}
          </div>
        );
      })}
    </ClickMenu>
  );
}

/** Drafts and jobs in review, to pick up where they were left. */
export function DraftsMenu({ s }: { s: State }) {
  const waiting = s.jobs.filter((j) => j.status === 'draft' || j.status === 'review' || j.status === 'approved');
  if (!waiting.length) return null;
  return (
    <ClickMenu
      label={`Continue a draft: ${waiting.length}`}
      trigger={
        <>
          <span className="hidden sm:inline">Continue</span>
          <span className="aj-faint">{waiting.length}</span>
          <ChevronDown size={13} strokeWidth={2} className="shrink-0" />
        </>
      }
    >
      {waiting.map((j) => (
        <MenuItem key={j.id} title={j.facts.title || 'Untitled draft'} tip={statusLine(s, j)} onClick={() => go('create', j.id)} />
      ))}
    </ClickMenu>
  );
}
