'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** Text already shown in full, by its key, so a message or section is revealed once and never again on a re-render. */
const done = new Set<string>();

const TICK_MS = 16;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/**
 * Text revealed as it is written (section 19, phase 5, E). It starts only once the whole text is there: the AI's answer is checked and
 * its actions carried out before anything shows. With reduced motion it appears at once; when `active` turns false (a new message came)
 * it finishes at once; nothing it reveals is undone. Returns the part to show while revealing, or null once the whole text shows.
 */
export function useReveal(key: string, text: string, active: boolean): string | null {
  const instant = !active || done.has(key) || reducedMotion() || !text;
  const [shown, setShown] = useState(() => (instant ? text.length : 0));
  const finished = instant || shown >= text.length;
  useEffect(() => {
    if (finished) {
      done.add(key);
      return;
    }
    const step = Math.max(3, Math.ceil(text.length / 60));
    const timer = setInterval(() => setShown((n) => Math.min(text.length, n + step)), TICK_MS);
    return () => clearInterval(timer);
  }, [finished, key, text.length]);
  return finished ? null : text.slice(0, shown);
}

/**
 * A text revealed as it is written. While it reveals, the partial text is hidden from screen readers and the finished text is there
 * for them at once, so they hear the finished message.
 */
export function Reveal({ id, text, active, render }: { id: string; text: string; active: boolean; render: (t: string) => ReactNode }) {
  const part = useReveal(id, text, active);
  if (part === null) return <>{render(text)}</>;
  return (
    <>
      <span aria-hidden="true" data-revealing="true">
        {render(part)}
      </span>
      <span className="sr-only">{render(text)}</span>
    </>
  );
}

/**
 * A block (a section of the job description) revealed as it is written: its whole content is there at once, links and placeholders
 * included, and screen readers have it all; on screen it is wiped in from the top, once. Reduced motion shows it at once (in the CSS).
 */
export function RevealBlock({ id, active, children }: { id: string; active: boolean; children: ReactNode }) {
  const [first] = useState(() => active && !done.has(id));
  if (!first) return <>{children}</>;
  return (
    <div className="ej-reveal" data-revealing="true" onAnimationEnd={() => done.add(id)}>
      {children}
    </div>
  );
}
