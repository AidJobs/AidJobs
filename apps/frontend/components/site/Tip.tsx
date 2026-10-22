'use client';

import { useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Side = 'top' | 'right' | 'bottom';

const GAP = 8;
const EDGE = 8;

/**
 * Label on hover, keyboard focus, or long-press. Drawn in a layer above the page,
 * so scrolling containers can neither clip it nor scroll sideways because of it.
 */
export default function Tip({ label, side = 'top', children }: { label: string; side?: Side; children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !bubble.current) return;
    const a = anchor.current.getBoundingClientRect();
    const b = bubble.current.getBoundingClientRect();
    let left: number;
    let top: number;
    if (side === 'right') {
      left = a.right + GAP;
      top = a.top + a.height / 2 - b.height / 2;
    } else {
      left = a.left + a.width / 2 - b.width / 2;
      top = side === 'bottom' ? a.bottom + GAP : a.top - b.height - GAP;
      if (top < EDGE) top = a.bottom + GAP;
    }
    left = Math.max(EDGE, Math.min(left, window.innerWidth - b.width - EDGE));
    top = Math.max(EDGE, Math.min(top, window.innerHeight - b.height - EDGE));
    setPos({ left, top });
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
      className="aj-tip"
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
