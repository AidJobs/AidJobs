'use client';

import { Moon, Sun } from 'lucide-react';
import { useThemeContext } from './ThemeProvider';

export function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useThemeContext();

  if (!mounted) {
    return (
      <button
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-surface text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        aria-label="Toggle theme"
        disabled
      >
        <Sun className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-surface text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </button>
  );
}
