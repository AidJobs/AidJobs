'use client';

import { useRef, useState, type ReactNode } from 'react';

type Side = 'top' | 'right' | 'bottom';

/** Hover label on desktop, long-press label on touch screens. */
export default function Tip({ label, side = 'top', children }: { label: string; side?: Side; children: ReactNode }) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = () => {
    timer.current = setTimeout(() => setShow(true), 450);
  };
  const end = () => {
    if (timer.current) clearTimeout(timer.current);
    if (show) setTimeout(() => setShow(false), 1200);
  };

  return (
    <span
      className="dj-tip"
      data-tip={label}
      data-side={side}
      data-show={show}
      onTouchStart={start}
      onTouchEnd={end}
      onTouchCancel={end}
    >
      {children}
    </span>
  );
}
