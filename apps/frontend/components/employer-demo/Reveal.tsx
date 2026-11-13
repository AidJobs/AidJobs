'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** Text already shown in full, by its key, so a message or section is revealed once and never again on a re-render. */
const done = new Set<string>();

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/**
 * A message revealed as it is written (section 19, phase 5, E). It starts only once the whole text is there: the AI's answer is checked
 * and its actions carried out before anything shows. The whole text is in the page from the start, in one element that never changes,
 * so a screen reader in the live conversation hears it once; on screen it is wiped in, the longer the text the slower. With reduced
 * motion it appears at once (in the CSS); when `active` turns false (a new message came) it finishes at once; never revealed again.
 */
export function Reveal({ id, text, active, render }: { id: string; text: string; active: boolean; render: (t: string) => ReactNode }) {
  const [started, setStarted] = useState(() => active && Boolean(text) && !done.has(id) && !reducedMotion());
  useEffect(() => {
    done.add(id);
  }, [id]);
  const revealing = started && active;
  return (
    <span
      className={revealing ? 'ej-reveal ej-reveal-text' : 'ej-reveal-text'}
      style={revealing ? { animationDuration: `${Math.min(1800, 300 + text.length * 6)}ms` } : undefined}
      data-revealing={revealing ? 'true' : undefined}
      onAnimationEnd={() => setStarted(false)}
    >
      {render(text)}
    </span>
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
