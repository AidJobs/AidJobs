'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
type Font = 'inter' | 'manrope';

type DemoSettings = {
  theme: Theme;
  font: Font;
  setTheme: (t: Theme) => void;
  setFont: (f: Font) => void;
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

export default function DemoRoot({ fontClasses, children }: { fontClasses: string; children: ReactNode }) {
  const [theme, setTheme] = usePersistentState<Theme>('aidjobs.demo.theme', 'light');
  const [font, setFont] = usePersistentState<Font>('aidjobs.demo.font', 'inter');
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
    <DemoContext.Provider value={{ theme, font, setTheme, setFont }}>
      <div className={`dj-root ${fontClasses}`} data-theme={theme} data-font={font}>
        {/* Browser-only: Node and browsers name some countries differently, which breaks hydration. */}
        {mounted ? children : null}
      </div>
    </DemoContext.Provider>
  );
}
