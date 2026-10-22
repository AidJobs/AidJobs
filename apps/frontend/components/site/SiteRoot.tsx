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

const THEME_KEY = 'aidjobs.theme';

/**
 * Runs while the HTML is parsed, before the first paint: applies the stored settings to the root so a visitor never
 * sees the defaults first. React then loads the same values from storage after hydration. Keys match the
 * `usePersistentState` calls here and in PublicSite.
 */
const SETTINGS_SCRIPT = `(function(){try{
var r=document.currentScript.parentElement;
var g=function(k){var v=localStorage.getItem(k);return v===null?null:JSON.parse(v)};
var t=g('${THEME_KEY}');
if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
r.setAttribute('data-theme',t);
if(g('aidjobs.contrast')===true)r.setAttribute('data-contrast','high');
if(g('aidjobs.motion')===true)r.setAttribute('data-motion','reduce');
var s=g('aidjobs.textSize');if(s==='l'||s==='xl')r.setAttribute('data-text',s);
if(g('aidjobs.menuCollapsed')===true)r.setAttribute('data-menu','collapsed');
var p=g('aidjobs.split');if(typeof p==='number'&&p>=42&&p<=68)r.style.setProperty('--split',p+'%');
}catch(e){}})();`;

export default function SiteRoot({ fontClasses, children }: { fontClasses: string; children: ReactNode }) {
  const [theme, setTheme] = usePersistentState<Theme>(THEME_KEY, 'light');
  const [textSize, setTextSize] = usePersistentState<TextSize>('aidjobs.textSize', 'm');
  const [highContrast, setHighContrast] = usePersistentState<boolean>('aidjobs.contrast', false);
  const [reduceMotion, setReduceMotion] = usePersistentState<boolean>('aidjobs.motion', false);
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

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
        data-text={textSize}
        data-ready={ready ? '' : undefined}
        suppressHydrationWarning
      >
        <script dangerouslySetInnerHTML={{ __html: SETTINGS_SCRIPT }} />
        <div className="aj-zoom">{children}</div>
      </div>
    </SiteContext.Provider>
  );
}
