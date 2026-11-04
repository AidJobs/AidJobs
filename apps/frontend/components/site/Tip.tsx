'use client';

import { useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Side = 'top' | 'right' | 'bottom' | 'left';

const GAP = 8;
const EDGE = 8;
const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/** Where the bubble goes on one side of the anchor, kept inside the window along that side. */
function place(side: Side, a: Box, w: number, h: number): { left: number; top: number; fits: boolean } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.max(EDGE, Math.min(x, vw - w - EDGE));
  const clampY = (y: number) => Math.max(EDGE, Math.min(y, vh - h - EDGE));
  if (side === 'top' || side === 'bottom') {
    const top = side === 'top' ? a.top - h - GAP : a.bottom + GAP;
    return { left: clampX(a.left + a.width / 2 - w / 2), top, fits: top >= EDGE && top + h <= vh - EDGE };
  }
  const left = side === 'left' ? a.left - w - GAP : a.right + GAP;
  return { left, top: clampY(a.top + a.height / 2 - h / 2), fits: left >= EDGE && left + w <= vw - EDGE };
}

/**
 * Label on hover, keyboard focus, or long-press. Drawn in a layer above the page,
 * so scrolling containers can neither clip it nor scroll sideways because of it.
 * It takes the preferred side, else the opposite side, else the others, and never covers what it describes.
 */
export default function Tip({ label, side = 'top', className, children }: { label: string; side?: Side; className?: string; children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !bubble.current) return;
    const a = anchor.current.getBoundingClientRect();
    const b = bubble.current.getBoundingClientRect();
    const order: Side[] = [side, OPPOSITE[side], ...(['top', 'bottom', 'right', 'left'] as Side[]).filter((x) => x !== side && x !== OPPOSITE[side])];
    const room: Record<Side, number> = { top: a.top, bottom: window.innerHeight - a.bottom, left: a.left, right: window.innerWidth - a.right };
    const roomiest = order.reduce((best, s) => (room[s] > room[best] ? s : best), order[0]);
    const chosen = order.map((s) => place(s, a, b.width, b.height)).find((p) => p.fits) ?? place(roomiest, a, b.width, b.height);
    setPos({ left: chosen.left, top: Math.max(EDGE, Math.min(chosen.top, window.innerHeight - b.height - EDGE)) });
  }, [open, side, label]);

  const show = () => {
    setPos(null);
    setOpen(true);
  };
  const hide = () => setOpen(false);
  const touchStart = () => {
    timer.current = setTimeout(show, 450);
  };
  const cancelPress = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  const touchEnd = () => {
    cancelPress();
    if (open) setTimeout(hide, 1200);
  };
  // A tap also sends mouse and focus events; only a real mouse or keyboard focus shows the label, so a tap never leaves one open.
  const focusShow = (e: FocusEvent<HTMLSpanElement>) => {
    try {
      if ((e.target as Element).matches(':focus-visible')) show();
    } catch {
      show();
    }
  };

  const layer = typeof document !== 'undefined' ? document.querySelector('.aj-root') : null;

  return (
    <span
      ref={anchor}
      className={className ? `aj-tip ${className}` : 'aj-tip'}
      onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && hide()}
      onFocus={focusShow}
      onBlur={hide}
      onTouchStart={touchStart}
      onTouchMove={cancelPress}
      onTouchEnd={touchEnd}
      onTouchCancel={touchEnd}
    >
      {children}
      {open &&
        layer &&
        createPortal(
          <div
            ref={bubble}
            role="tooltip"
            className="aj-tooltip"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
          >
            {label}
          </div>,
          layer,
        )}
    </span>
  );
}
