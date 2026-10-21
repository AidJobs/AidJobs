'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
export type TextSize = 'm' | 'l' | 'xl';

type SiteSettings = {
  theme: Theme;
  textSize: TextSize;
  highContrast: boolean;
  reduceMotion: boolean;
  setTheme: (t: Theme) => void;
  setTextSize: (s: TextSize) => void;
  setHighContrast: (v: boolean) => void;
  setReduceMotion: (v: boolean) => void;
};

const SiteContext = createContext<SiteSettings | null>(null);

export function useSiteSettings(): SiteSettings {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSiteSettings outside SiteRoot');
  return ctx;
}

/** State kept in this browser's storage; starts at `initial` and loads the stored value after mount. */
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
const THEME_KEY = 'aidjobs.theme';

export default function SiteRoot({ fontClasses, children }: { fontClasses: string; children: ReactNode }) {
  const [theme, setTheme] = usePersistentState<Theme>(THEME_KEY, 'light');
  const [textSize, setTextSize] = usePersistentState<TextSize>('aidjobs.textSize', 'm');
  const [highContrast, setHighContrast] = usePersistentState<boolean>('aidjobs.contrast', false);
  const [reduceMotion, setReduceMotion] = usePersistentState<boolean>('aidjobs.motion', false);

  useEffect(() => {
    try {
      if (localStorage.getItem(THEME_KEY) === null && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark');
      }
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SiteContext.Provider value={{ theme, textSize, highContrast, reduceMotion, setTheme, setTextSize, setHighContrast, setReduceMotion }}>
      <div
        className={`aj-root ${fontClasses}`}
        data-theme={theme}
        data-contrast={highContrast ? 'high' : 'normal'}
        data-motion={reduceMotion ? 'reduce' : 'full'}
      >
        <div className="aj-zoom" style={{ zoom: ZOOM[textSize] }}>
          {children}
        </div>
      </div>
    </SiteContext.Provider>
  );
}
