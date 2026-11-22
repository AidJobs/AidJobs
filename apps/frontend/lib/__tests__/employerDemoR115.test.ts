/**
 * R1-15 (22 November 2026): Hide must not leave a fields card shut after ask / walk / change retarget.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const win = readFileSync(join(__dirname, '../../components/employer-demo/Window.tsx'), 'utf8');

describe('R1-15: Hide card + later ask', () => {
  it('clears hidden when a later ask opens Details', () => {
    expect(win).toMatch(/if \(askId\) \{\s*setHidden\(null\);\s*setPart\(job\.id, 'details'\);/);
  });

  it('clears hidden when walk or a section change auto-opens a part', () => {
    expect(win).toMatch(/setHidden\(null\);\s*setPart\(job\.id, `s:\$\{job\.lastChange\.keys\[0\]\}`/);
    expect(win).toMatch(/setHidden\(null\);\s*setPart\(job\.id, p\);/);
  });
});
