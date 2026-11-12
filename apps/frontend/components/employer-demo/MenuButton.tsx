'use client';

import { Fragment, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Tip from '@/components/site/Tip';

export type MenuAction = { label: string; danger?: boolean; current?: boolean; separator?: boolean; run: () => void };

/** After an option is chosen, focus goes back to the menu's button, unless the option moved it somewhere on purpose. */
export function refocus(wrap: HTMLElement | null, button: HTMLElement | null) {
  const at = document.activeElement;
  if (!at || at === document.body || !at.isConnected || wrap?.contains(at)) button?.focus();
}

/**
 * Where the list opens: fixed to the screen beside its button, so no scrolling or clipped box around it cuts it; it opens upwards when
 * there is more room above, is never wider than the screen, and scrolls only up and down.
 */
function placeFor(el: HTMLElement, align: 'left' | 'right', up: boolean): CSSProperties {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const below = vh - r.bottom - 12;
  const above = r.top - 12;
  const goUp = up ? above > 160 || above > below : below < 200 && above > below;
  const maxWidth = Math.min(360, vw - 16);
  const right = align === 'right' && r.right >= Math.min(maxWidth, 220) + 8;
  const side: CSSProperties = right ? { right: Math.max(8, vw - r.right) } : { left: Math.min(Math.max(8, r.left), Math.max(8, vw - maxWidth - 8)) };
  return { ...side, ...(goUp ? { bottom: vh - r.top + 6 } : { top: r.bottom + 6 }), maxWidth, maxHeight: Math.max(120, goUp ? above : below) };
}

/** A button that opens a short list of actions on click; Escape, a click outside, or scrolling the page around it closes it. */
export default function MenuButton({ label, tip, trigger, actions, align = 'right', up = false, className = 'aj-icon-btn' }: { label: string; tip?: string; trigger: ReactNode; actions: MenuAction[]; align?: 'left' | 'right'; up?: boolean; className?: string }) {
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const open = place !== null;
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setPlace(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPlace(null);
      button.current?.focus();
    };
    const away = (e: Event) => {
      if (!document.getElementById(id)?.contains(e.target as Node)) setPlace(null);
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    document.addEventListener('scroll', away, true);
    window.addEventListener('resize', away);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
      document.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', away);
    };
  }, [open, id]);

  return (
    <div ref={wrap} className="relative flex">
      <Tip label={tip ?? label} side={up ? 'bottom' : 'top'}>
        <button ref={button} type="button" className={className} aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} onClick={(e) => setPlace(open ? null : placeFor(e.currentTarget, align, up))}>
          {trigger}
        </button>
      </Tip>
      {place && (
        <div id={id} className="ej-menu" data-fixed style={place} role="group" aria-label={label} onClick={() => {
          setPlace(null);
          refocus(wrap.current, button.current);
        }}>
          {actions.map((a) => (
            <Fragment key={a.label}>
              {a.separator && <div className="ej-menu-sep" role="separator" />}
              <button type="button" className="ej-menu-item" data-danger={a.danger ? 'true' : undefined} aria-current={a.current ? 'true' : undefined} onClick={a.run}>
                {a.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
