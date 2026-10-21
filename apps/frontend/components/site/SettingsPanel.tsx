'use client';

import { Moon, PersonStanding, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Tip from './Tip';
import { useSiteSettings, type TextSize } from './SiteRoot';

type Side = 'top' | 'right';

export function ThemeToggle({ side = 'top' }: { side?: Side }) {
  const { theme, setTheme } = useSiteSettings();
  const label = theme === 'light' ? 'Dark mode' : 'Light mode';
  return (
    <Tip label={label} side={side}>
      <button type="button" className="aj-icon-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={label}>
        {theme === 'light' ? <Moon size={15} strokeWidth={1.7} /> : <Sun size={15} strokeWidth={1.7} />}
      </button>
    </Tip>
  );
}

const SIZES: Array<{ key: TextSize; label: string }> = [
  { key: 'm', label: 'A' },
  { key: 'l', label: 'A+' },
  { key: 'xl', label: 'A++' },
];

export function AccessibilityPanel({ side = 'top' }: { side?: Side }) {
  const { textSize, setTextSize, highContrast, setHighContrast, reduceMotion, setReduceMotion } = useSiteSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Tip label="Accessibility: text size, contrast, motion" side={side}>
        <button type="button" className="aj-icon-btn" data-active={open} onClick={() => setOpen(!open)} aria-label="Accessibility settings" aria-expanded={open}>
          <PersonStanding size={15} strokeWidth={1.7} />
        </button>
      </Tip>
      {open && (
        <div className="aj-popover absolute bottom-[calc(100%+8px)] left-0 flex flex-col gap-3 p-3" style={{ width: 240 }} role="dialog" aria-label="Accessibility settings">
          <div className="aj-title">Accessibility</div>
          <div className="flex flex-col gap-1.5">
            <span className="aj-muted">Text size</span>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Text size">
              {SIZES.map((s) => (
                <button key={s.key} type="button" className="aj-pill" data-active={textSize === s.key} onClick={() => setTextSize(s.key)} role="radio" aria-checked={textSize === s.key}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between gap-2">
            <span>Higher contrast</span>
            <input type="checkbox" checked={highContrast} onChange={(e) => setHighContrast(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Reduce motion</span>
            <input type="checkbox" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} />
          </label>
          <span className="aj-faint">Saved on this device.</span>
        </div>
      )}
    </div>
  );
}
