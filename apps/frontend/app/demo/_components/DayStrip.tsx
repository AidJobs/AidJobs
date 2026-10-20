'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import Tip from './Tip';
import { formatLongDate } from '../_lib/jobs';

export type DayGroup = { date: string; count: number; daysLeft: number };

function dayLabel(d: number): string {
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return `In ${d} days`;
}

/** Calendar-style day picker. Tap a day again to clear it. Scrolls with swipe, mouse wheel, or the edge arrows. */
export default function DayStrip({
  groups,
  value,
  onChange,
}: {
  groups: DayGroup[];
  value: string | null;
  onChange: (date: string | null) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, [measure, groups.length]);

  const nudge = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      <div ref={scroller} className="dj-no-scrollbar flex gap-1.5 overflow-x-auto pb-2" role="tablist" aria-label="Filter by closing day" style={{ scrollSnapType: 'x proximity' }}>
        {groups.map((g) => {
          const dt = new Date(`${g.date}T00:00:00Z`);
          return (
            <Tip key={g.date} label={`${dayLabel(g.daysLeft)}: ${g.count} ${g.count === 1 ? 'role closes' : 'roles close'} on ${formatLongDate(g.date)}`} side="bottom">
              <button
                type="button"
                className="dj-day"
                data-active={value === g.date}
                data-urgent={g.daysLeft <= 3}
                onClick={() => onChange(value === g.date ? null : g.date)}
                role="tab"
                aria-selected={value === g.date}
                style={{ scrollSnapAlign: 'start' }}
              >
                <span className="dj-day-top">{g.daysLeft === 0 ? 'Today' : g.daysLeft === 1 ? 'Tmrw' : formatLongDate(g.date).split(' ')[0]}</span>
                <span className="dj-day-num">{dt.getUTCDate()}</span>
                <span className="dj-day-count">{g.count}</span>
              </button>
            </Tip>
          );
        })}
      </div>
      {edges.left && (
        <button type="button" className="dj-icon-btn dj-strip-arrow" style={{ left: -4 }} onClick={() => nudge(-1)} aria-label="Earlier days">
          <ChevronLeft size={15} strokeWidth={2} />
        </button>
      )}
      {edges.right && (
        <button type="button" className="dj-icon-btn dj-strip-arrow" style={{ right: -4 }} onClick={() => nudge(1)} aria-label="Later days">
          <ChevronRight size={15} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
