/**
 * R1-12 (21 November 2026): section headers wrap; change notes do not ellipsize Also-in / Undo away.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, '../../components/employer-demo/employer-demo.css'), 'utf8');
const doc = readFileSync(join(__dirname, '../../components/employer-demo/DocPane.tsx'), 'utf8');

describe('R1-12: section header clip / Also-in', () => {
  it('wraps .ej-sec-head globally (not only under 1023px)', () => {
    const block = css.match(/\/\* R1-12:[\s\S]*?\.ej-sec-head\s*\{([^}]+)\}/);
    expect(block?.[1]).toMatch(/flex-wrap:\s*wrap/);
    expect(block?.[1]).not.toMatch(/nowrap/);
  });

  it('gives the section change row full width and visible Also-in text', () => {
    expect(css).toMatch(/\.ej-sec-head\s*>\s*\.ej-sec-change\s*\{[\s\S]*?flex:\s*1 1 100%/);
    expect(css).toMatch(/\.ej-sec-change\s+\.ej-change-text\s*\{[\s\S]*?white-space:\s*normal/);
  });

  it('puts Undo in ej-change-actions inside ej-sec-change (StepNote-shaped)', () => {
    expect(doc).toMatch(/className="ej-sec-change"/);
    expect(doc).toMatch(/ej-sec-change[\s\S]*?ej-change-actions[\s\S]*?Undo/);
  });
});
