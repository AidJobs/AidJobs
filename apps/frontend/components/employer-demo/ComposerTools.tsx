'use client';

import { Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { inputStyle } from './ui';
import Tip from '@/components/site/Tip';
import { hireAgain } from './actions';
import { refocus } from './MenuButton';
import { contractPicks, deadlinePicks, memoryPick, pickPhrase, placePatch, placePicks } from './answers';
import { addDays, longDate, PLACES } from './engine';
import { statusLine } from './Home';
import { go } from './store';
import type { Facts, State } from './types';

/**
 * A tool in the chat box. A click opens its menu below the box, or above it when there is more room there, never
 * taller than the room, so the page itself never scrolls. Escape, a click outside, or choosing an option closes it.
 */
/** Closes the click menu that holds this element, as choosing an option does. */
function closeMenu(el: HTMLElement) {
  el.dispatchEvent(new CustomEvent('ej-close-menu', { bubbles: true }));
}

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
    const chosen = () => {
      setOpen(false);
      refocus(wrap.current, button.current);
    };
    const el = wrap.current;
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    el?.addEventListener('ej-close-menu', chosen);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
      el?.removeEventListener('ej-close-menu', chosen);
    };
  }, [open]);

  return (
    <div ref={wrap} className="flex min-w-0">
      <Tip label={label} className="min-w-0">
        <button ref={button} type="button" className="ej-tool" data-icon={icon ? 'true' : undefined} aria-label={label} aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={toggle}>
          {trigger}
        </button>
      </Tip>
      {open && (
        <div
          id={menuId}
          className="ej-menu"
          data-up={place.up}
          style={{ maxHeight: place.max }}
          role="group"
          aria-label={label}
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('.ej-menu-item')) return;
            setOpen(false);
            refocus(wrap.current, button.current);
          }}
        >
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
export function PlusMenu({ s, onUpload }: { s: State; onUpload: () => void }) {
  const past = s.jobs.filter((j) => j.status === 'closed').slice(0, 3);
  const drafts = s.jobs.filter((j) => j.status === 'draft' || j.status === 'review' || j.status === 'approved');
  return (
    <ClickMenu label="Upload a job description, hire again, or continue a job draft" icon trigger={<Plus size={16} strokeWidth={2} />}>
      <MenuItem title="Upload a job description" tip="Paste text, or choose a file (text, Word, or PDF). Use its headings, or its wording too." onClick={onUpload} />
      {past.length > 0 && <span className="ej-menu-label">Hire again</span>}
      {past.map((j) => (
        <MenuItem
          key={j.id}
          title={j.facts.title}
          tip={`${j.facts.location ? `${j.facts.location}. ` : ''}Starts from last time's job description, with new dates.`}
          onClick={() => {
            const id = hireAgain(j.id);
            if (id) go('create', id);
          }}
        />
      ))}
      {drafts.length > 0 && <span className="ej-menu-label">Continue a job draft</span>}
      {drafts.slice(0, 5).map((j) => (
        <MenuItem key={j.id} title={j.facts.title || 'Untitled job draft'} tip={statusLine(s, j)} onClick={() => go('create', j.id)} />
      ))}
      {drafts.length > 5 && <MenuItem title={`All ${drafts.length} job drafts`} tip="Opens Manage jobs, where every job draft is listed." onClick={() => go('jobs')} />}
    </ClickMenu>
  );
}
const SLOT_NAME = { place: 'Duty station', deadline: 'Closing date', contract: 'Contract' } as const;

/**
 * The first screen's fact slot: the single most important fact still missing ("+ Closing date"), with relevant picks and their reasons, and
 * reusing a similar past job's facts in one click when there is one. A choice is added to the text, so everything stays in the box.
 */
export function FactSlot({ s, facts, family, onAdd }: { s: State; facts: Facts; family: string; onAdd: (phrase: string) => void }) {
  const [q, setQ] = useState('');
  const [date, setDate] = useState('');
  const missing = !facts.location && facts.arrangement !== 'remote' ? 'place' : !facts.deadline ? 'deadline' : !(facts.contract || facts.duration) ? 'contract' : null;
  const subject = { id: '', family, facts };
  const memory = memoryPick(s, subject);
  if (!missing && !memory) return null;
  const picks = missing === 'place' ? placePicks(s, subject) : missing === 'deadline' ? deadlinePicks(s, subject) : missing === 'contract' ? contractPicks(s, subject) : [];
  const matches = missing === 'place' && q.trim().length >= 2 ? PLACES.filter((p) => `${p.city} ${p.country}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 4) : [];
  const min = addDays(s.today, 1);
  const dateOk = /^20\d\d-\d\d-\d\d$/.test(date) && date >= min;
  return (
    <ClickMenu label={missing ? `Add the ${SLOT_NAME[missing].toLowerCase()}` : "Reuse a past job's facts"} trigger={<span className="ej-tool-text">{missing ? `+ ${SLOT_NAME[missing]}` : "Reuse a past job's facts"}</span>}>
      {memory && <MenuItem title={memory.label} tip={memory.why} onClick={() => onAdd(memory.text)} />}
      {missing && <span className="ej-menu-label">{SLOT_NAME[missing]}</span>}
      {missing && picks.map((p) => <MenuItem key={p.label} title={p.label} tip={p.why} onClick={() => onAdd(pickPhrase(missing, p))} />)}
      {missing === 'place' && (
        <div className="flex flex-col gap-1 px-1 pt-1">
          <input
            style={{ ...inputStyle, minHeight: 32 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || q.trim().length < 2) return;
              e.preventDefault();
              onAdd(matches[0] ? ` in ${placePatch(matches[0].city).location}` : `, based in ${q.trim()}`);
              closeMenu(e.currentTarget);
            }}
            placeholder="Search a place, or type any town and country"
            aria-label="Search a duty station"
          />
          {matches.map((m) => (
            <MenuItem key={m.city} title={`${m.city}, ${m.country}`} tip="From AidJobs' list of duty stations" onClick={() => onAdd(` in ${placePatch(m.city).location}`)} />
          ))}
          {q.trim().length >= 2 && !matches.some((m) => m.city.toLowerCase() === q.trim().toLowerCase()) && <MenuItem title={`Use "${q.trim()}"`} tip="Added as you typed it" onClick={() => onAdd(`, based in ${q.trim()}`)} />}
        </div>
      )}
      {missing === 'deadline' && (
        <div className="flex gap-1.5 px-1 pt-1">
          <input type="date" style={{ ...inputStyle, minHeight: 32, flex: 1 }} min={min} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Pick a closing date" />
          <button type="button" className="ej-menu-item" style={{ width: 'auto' }} disabled={!dateOk} onClick={() => onAdd(`, closing ${longDate(date)}`)}>
            Set date
          </button>
        </div>
      )}
    </ClickMenu>
  );
}