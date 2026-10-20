'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
export type TextSize = 'm' | 'l' | 'xl';

type DemoSettings = {
  theme: Theme;
  textSize: TextSize;
  highContrast: boolean;
  reduceMotion: boolean;
  setTheme: (t: Theme) => void;
  setTextSize: (s: TextSize) => void;
  setHighContrast: (v: boolean) => void;
  setReduceMotion: (v: boolean) => void;
};

const DemoContext = createContext<DemoSettings | null>(null);

export function useDemoSettings(): DemoSettings {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemoSettings outside DemoRoot');
  return ctx;
}

export function usePersistentState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* storage unavailable */
    }
  }, [key]);
  const update = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  };
  return [value, update];
}

const ZOOM: Record<TextSize, number> = { m: 1, l: 1.12, xl: 1.25 };

export default function DemoRoot({ fontClasses, children }: { fontClasses: string; children: ReactNode }) {
  const [theme, setTheme] = usePersistentState<Theme>('aidjobs.demo.theme', 'light');
  const [textSize, setTextSize] = usePersistentState<TextSize>('aidjobs.demo.textSize', 'm');
  const [highContrast, setHighContrast] = usePersistentState<boolean>('aidjobs.demo.contrast', false);
  const [reduceMotion, setReduceMotion] = usePersistentState<boolean>('aidjobs.demo.motion', false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    try {
      if (localStorage.getItem('aidjobs.demo.theme') === null && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark');
      }
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DemoContext.Provider value={{ theme, textSize, highContrast, reduceMotion, setTheme, setTextSize, setHighContrast, setReduceMotion }}>
      <div
        className={`dj-root ${fontClasses}`}
        data-theme={theme}
        data-contrast={highContrast ? 'high' : 'normal'}
        data-motion={reduceMotion ? 'reduce' : 'full'}
      >
        {/* Browser-only: Node and browsers name some countries differently, which breaks hydration. */}
        {mounted ? (
          <div className="dj-zoom" style={{ zoom: ZOOM[textSize] }}>
            {children}
          </div>
        ) : null}
      </div>
    </DemoContext.Provider>
  );
}
