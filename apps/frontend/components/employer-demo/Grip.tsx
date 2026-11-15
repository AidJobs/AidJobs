'use client';

import { GripVertical } from 'lucide-react';
import { Fragment, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import Tip from '@/components/site/Tip';
import { placeFor } from './MenuButton';

/** One entry of a grip's menu; `items` opens a short list in its place ("Move to group…"); `off`: shown, with why it cannot be used. */
export type GripAction = { label: string; run?: () => void; items?: GripAction[]; danger?: boolean; off?: string; current?: boolean };

const DRAG = 3;

/**
 * The grip (section 19, phase 6, B and C): one meaning in the outline and in the draft. Dragged, it moves its row or section; pressed
 * without moving (a click or a tap, or Enter or Space), it opens its menu. With it focused, the arrow keys move it one place.
 * `onDrag` gets the pointer's height while dragging, and `onDrop` once it is let go.
 */
export default function Grip({ label, tip, actions, onKey, onDrag, onDrop, className = 'ej-grip', size = 14, gripKey }: { label: string; tip?: string; actions: GripAction[]; onKey?: (by: -1 | 1) => void; onDrag?: (y: number) => void; onDrop?: (y: number | null) => void; className?: string; size?: number; gripKey?: string }) {
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const [sub, setSub] = useState<GripAction | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; dragging: boolean; id: number } | null>(null);
  const id = useId();
  const open = place !== null;
  const close = (refocus = true) => {
    setPlace(null);
    setSub(null);
    if (refocus) requestAnimationFrame(() => button.current?.isConnected && button.current.focus({ preventScroll: true }));
  };
  const show = () => {
    if (!button.current) return;
    setSub(null);
    setPlace(placeFor(button.current, 'right', false));
  };

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true }));
    const down = (e: globalThis.PointerEvent) => {
      if (!list.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close(false);
    };
    const away = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('scroll', away, true);
    window.addEventListener('resize', away);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', away);
    };
  }, [open, sub]);

  const lastY = useRef(0);
  const raf = useRef(0);
  const pointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    press.current = { x: e.clientX, y: e.clientY, dragging: false, id: e.pointerId };
    lastY.current = e.clientY;
  };
  const pointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || !onDrag) return;
    if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG) return;
    if (!p.dragging) {
      p.dragging = true;
      try {
        e.currentTarget.setPointerCapture(p.id);
      } catch {
        // Without capture the grip still gets the moves while the pointer stays over it.
      }
      e.currentTarget.dataset.dragging = 'true';
    }
    e.preventDefault();
    lastY.current = e.clientY;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      onDrag(lastY.current);
    });
  };
  const dragged = useRef(false);
  const pointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    press.current = null;
    e.currentTarget.removeAttribute('data-dragging');
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
    if (p?.dragging) {
      e.preventDefault();
      dragged.current = true;
      onDrop?.(e.clientY);
    }
  };
  const click = () => {
    // A drag ends without opening the menu; a press that did not move opens it.
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (open) close();
    else show();
  };
  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && onKey) {
      e.preventDefault();
      onKey(e.key === 'ArrowUp' ? -1 : 1);
    }
  };
  const menuKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (sub) setSub(null);
      else close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (e.key === 'Tab') close(false);
  };
  const shown = sub?.items ?? actions;
  return (
    <>
      <Tip label={tip ?? label}>
        <button
          ref={button}
          type="button"
          className={className}
          data-grip-key={gripKey}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={() => {
            if (press.current?.dragging) onDrop?.(null);
            press.current = null;
          }}
          onClick={click}
          onKeyDown={key}
        >
          <GripVertical size={size} strokeWidth={1.8} aria-hidden />
        </button>
      </Tip>
      {place && (
        <div ref={list} id={id} className="ej-menu" data-fixed style={place} role="menu" aria-label={sub ? sub.label : label} onKeyDown={menuKeys}>
          {sub && (
            <button type="button" role="menuitem" className="ej-menu-item ej-menu-back" onClick={() => setSub(null)}>
              ‹ Back
            </button>
          )}
          {shown.map((a) => (
            <Fragment key={a.label}>
              {a.off ? (
                <Tip label={a.off}>
                  <button type="button" role="menuitem" className="ej-menu-item" aria-label={`${a.label}, ${a.off}`} aria-disabled="true" data-off="true" onClick={(e) => e.preventDefault()}>
                    {a.label}
                  </button>
                </Tip>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className="ej-menu-item"
                  data-danger={a.danger ? 'true' : undefined}
                  aria-current={a.current ? 'true' : undefined}
                  aria-haspopup={a.items ? 'menu' : undefined}
                  onClick={() => {
                    if (a.items) return setSub(a);
                    close();
                    a.run?.();
                  }}
                >
                  {a.label}
                </button>
              )}
            </Fragment>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Where a dragged row would land, from the rows and group titles in `root`, in the order they show: after the last row whose middle is
 * above the pointer (joining its group), first in a group when the last thing above is its title, and first in the first group at the
 * top. Rows carry `data-drop-key` and `data-drop-group`; titles carry only `data-drop-group`.
 */
export function dropAt(root: HTMLElement | null, y: number, dragged: string): { after: string | null; group: string | null } {
  if (!root) return { after: null, group: null };
  const marks = Array.from(root.querySelectorAll<HTMLElement>('[data-drop-group]')).filter((el) => el.dataset.dropKey !== dragged);
  let hit: HTMLElement | null = null;
  for (const el of marks) {
    const r = el.getBoundingClientRect();
    // Upper third of a mark: land before it (after the previous mark); else after it once the pointer is past that band.
    const edge = r.top + Math.min(14, r.height * 0.35);
    if (y < edge) break;
    hit = el;
  }
  if (!hit) return { after: null, group: marks[0]?.dataset.dropGroup ?? null };
  return { after: hit.dataset.dropKey ?? null, group: hit.dataset.dropGroup ?? null };
}

/** Where a dragged group would land: before the first group whose middle is below the pointer, or at the end. */
export function groupDropAt(root: HTMLElement | null, y: number, dragged: string): string | null {
  const groups = Array.from(root?.querySelectorAll<HTMLElement>('[data-group-block]') ?? []).filter((el) => el.dataset.groupBlock !== dragged);
  for (const el of groups) {
    const r = el.getBoundingClientRect();
    if (y < r.top + Math.min(24, r.height * 0.35)) return el.dataset.groupBlock ?? null;
  }
  return null;
}
