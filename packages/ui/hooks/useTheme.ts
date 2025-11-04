'use client';

import { useEffect, useState } from 'react';
import { type PaletteKey, getPaletteColors } from '../tokens/palettes';

type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');
  const [palette, setPaletteState] = useState<PaletteKey>('mint');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    const storedTheme = localStorage.getItem('aidjobs-theme') as Theme | null;
    const storedPalette = localStorage.getItem('aidjobs.theme.palette') as PaletteKey | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = storedTheme || (prefersDark ? 'dark' : 'light');
    const initialPalette = storedPalette || 'mint';
    
    setThemeState(initialTheme);
    setPaletteState(initialPalette);
    applyTheme(initialTheme);
    applyPalette(initialPalette, initialTheme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('aidjobs-theme')) {
        const newTheme = e.matches ? 'dark' : 'light';
        const currentPalette = localStorage.getItem('aidjobs.theme.palette') as PaletteKey || 'mint';
        setThemeState(newTheme);
        applyTheme(newTheme);
        applyPalette(currentPalette, newTheme);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    applyPalette(palette, newTheme);
    localStorage.setItem('aidjobs-theme', newTheme);
  };

  const setPalette = (newPalette: PaletteKey) => {
    setPaletteState(newPalette);
    applyPalette(newPalette, theme);
    localStorage.setItem('aidjobs.theme.palette', newPalette);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  return { theme, setTheme, toggleTheme, palette, setPalette, mounted };
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
}

function applyPalette(palette: PaletteKey, theme: Theme) {
  const colors = getPaletteColors(palette, theme);
  const root = document.documentElement;
  
  let styleEl = document.getElementById('theme-vars') as HTMLStyleElement;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'theme-vars';
    document.head.appendChild(styleEl);
  }

  const cssVars = Object.entries(colors)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join('\n');

  styleEl.textContent = `:root {\n${cssVars}\n}`;
  
  root.setAttribute('data-palette', palette);
}
