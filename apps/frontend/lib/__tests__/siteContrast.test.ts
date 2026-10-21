import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, '../../components/site/site.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const base = block('.aj-root');
const dark = block(".aj-root[data-theme='dark']");
const high = block(".aj-root[data-contrast='high']");
const darkHigh = block(".aj-root[data-theme='dark'][data-contrast='high']");

const MODES: Record<string, Record<string, string>> = {
  light: base,
  dark: { ...base, ...dark },
  'light, high contrast': { ...base, ...high },
  'dark, high contrast': { ...base, ...dark, ...high, ...darkHigh },
};

function resolve(vars: Record<string, string>, value: string): string {
  const ref = value.match(/^var\(--([a-z0-9-]+)\)$/);
  return ref ? resolve(vars, vars[ref[1]]) : value;
}

function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Text colour on the backgrounds the site draws it on (WCAG AA: 4.5 to 1). */
const TEXT_PAIRS: Array<[string, string, string]> = [
  ['text', 'page', 'body text'],
  ['text', 'surface', 'body text on cards'],
  ['text', 'surface-2', 'body text on hover and the switch'],
  ['text-2', 'page', 'secondary text'],
  ['text-2', 'surface', 'secondary text on cards'],
  ['text-2', 'surface-2', 'chips'],
  ['text-3', 'page', 'faint text'],
  ['text-3', 'surface', 'faint text on cards, placeholders, labels'],
  ['on-ink', 'ink', 'active pills, menu entry, tooltips, buttons'],
  ['amber', 'amber-bg', 'deadline chips, 10-day count'],
  ['amber', 'surface', 'day-strip counts'],
  ['red', 'red-bg', 'urgent deadline chips'],
  ['red', 'surface', 'urgent day-strip counts'],
  ['sage-8', 'sage-2', 'sage chips, organisation marks'],
  ['sage-8', 'surface', 'Clear links'],
];

/** Badges change colour with the theme: white on dark green, dark text on light green. */
const BADGE: Record<string, [string, string]> = {
  light: ['#ffffff', 'sage-8'],
  'light, high contrast': ['#ffffff', 'sage-8'],
  dark: ['on-ink', 'sage-7'],
  'dark, high contrast': ['on-ink', 'sage-7'],
};

/** Icons and focus rings (WCAG AA for non-text: 3 to 1). */
const UI_PAIRS: Array<[string, string, string]> = [
  ['sage-7', 'surface', 'focus ring, ticks'],
  ['sage-7', 'sage-1', 'ticks on chosen rows, active icon buttons'],
];

function measure(pairs: Array<[string, string, string]>, minimum: number, badges = false): string[] {
  const failures: string[] = [];
  for (const [mode, vars] of Object.entries(MODES)) {
    const all = badges ? [...pairs, [...BADGE[mode], 'badges'] as [string, string, string]] : pairs;
    for (const [fg, bg, use] of all) {
      const f = fg.startsWith('#') ? fg : resolve(vars, vars[fg]);
      const b = resolve(vars, vars[bg]);
      const r = ratio(f, b);
      if (r < minimum) failures.push(`${mode}: ${fg} on ${bg} (${use}) is ${r.toFixed(2)}`);
    }
  }
  return failures;
}

describe('site colours meet WCAG AA', () => {
  it('text is at least 4.5 to 1 in every mode', () => {
    expect(measure(TEXT_PAIRS, 4.5, true)).toEqual([]);
  });

  it('icons and focus rings are at least 3 to 1 in every mode', () => {
    expect(measure(UI_PAIRS, 3)).toEqual([]);
  });
});
