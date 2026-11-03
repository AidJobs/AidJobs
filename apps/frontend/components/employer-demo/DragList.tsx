'use client';

import { GripVertical } from 'lucide-react';
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * A list reordered by dragging its handle, with a mouse or a finger. Rows keep their place in the page while dragging
 * and only slide, so the pointer is never lost; the order changes on release. The handle also takes the arrow keys.
 */
export default function DragList({ ids, label, onMove, children, gap = 4 }: { ids: string[]; label: (id: string) => string; onMove: (from: number, to: number) => void; children: (id: string) => ReactNode; gap?: number }) {
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number; h: number } | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const geo = useRef({ mids: [] as number[], startY: 0 });

  const start = (e: PointerEvent<HTMLButtonElement>, from: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Without capture the handle still gets the moves while the pointer stays over it.
    }
    const rects = ids.map((id) => rows.current.get(id)?.getBoundingClientRect());
    geo.current = { mids: rects.map((r) => (r ? r.top + r.height / 2 : 0)), startY: e.clientY };
    setDrag({ from, to: from, dy: 0, h: (rects[from]?.height ?? 0) + gap });
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const dy = e.clientY - geo.current.startY;
    const y = geo.current.mids[drag.from] + dy;
    const to = geo.current.mids.filter((m, i) => i !== drag.from && m < y).length;
    setDrag({ ...drag, to, dy });
  };
  const end = () => {
    if (drag && drag.to !== drag.from) onMove(drag.from, drag.to);
    setDrag(null);
  };
  const key = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
    if (to < 0 || to >= ids.length) return;
    e.preventDefault();
    onMove(i, to);
  };
  const shift = (i: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (i === drag.from) return { transform: `translateY(${drag.dy}px)`, zIndex: 2 };
    const h = drag.h;
    if (drag.from < i && i <= drag.to) return { transform: `translateY(${-h}px)` };
    if (drag.to <= i && i < drag.from) return { transform: `translateY(${h}px)` };
    return { transform: 'none' };
  };

  return (
    <ul className="flex flex-col" style={{ gap, listStyle: 'none', margin: 0, padding: 0 }}>
      {ids.map((id, i) => (
        <li
          key={id}
          ref={(el) => {
            if (el) rows.current.set(id, el);
            else rows.current.delete(id);
          }}
          className="ej-drag-row"
          data-dragging={drag?.from === i}
          data-sliding={Boolean(drag) && drag?.from !== i}
          style={shift(i)}
        >
          <button
            type="button"
            className="ej-drag-handle"
            aria-label={`Drag to move ${label(id)}, or use the up and down arrow keys`}
            onPointerDown={(e) => start(e, i)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={() => setDrag(null)}
            onKeyDown={(e) => key(e, i)}
          >
            <GripVertical size={14} strokeWidth={1.8} />
          </button>
          {children(id)}
        </li>
      ))}
    </ul>
  );
}
