'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type MenuAction = { label: string; danger?: boolean; current?: boolean; run: () => void };

/** After an option is chosen, focus goes back to the menu's button, unless the option moved it somewhere on purpose. */
export function refocus(wrap: HTMLElement | null, button: HTMLElement | null) {
  const at = document.activeElement;
  if (!at || at === document.body || !at.isConnected || wrap?.contains(at)) button?.focus();
}

/** A button that opens a short list of actions on click; Escape or a click outside closes it. */
export default function MenuButton({ label, trigger, actions, align = 'right', up = false }: { label: string; trigger: ReactNode; actions: MenuAction[]; align?: 'left' | 'right'; up?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

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
    <div ref={wrap} className="relative flex">
      <button ref={button} type="button" className="aj-icon-btn" aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
        {trigger}
      </button>
      {open && (
        <div id={id} className="ej-menu" data-align={align} data-up={up} role="group" aria-label={label} onClick={() => {
          setOpen(false);
          refocus(wrap.current, button.current);
        }}>
          {actions.map((a) => (
            <button key={a.label} type="button" className="ej-menu-item" data-danger={a.danger ? 'true' : undefined} aria-current={a.current ? 'true' : undefined} onClick={a.run}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
