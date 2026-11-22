/**
 * R1-09 (22 November 2026): +N window ends at the current part so Publish does not sit alone ahead of Review/Languages.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { onLine, type Part } from '../../components/employer-demo/parts';

const partsSrc = readFileSync(join(__dirname, '../../components/employer-demo/parts.ts'), 'utf8');

const stub = (keys: string[]): Part[] => keys.map((key) => ({ key, label: key, done: false }));

describe('R1-09: progress line +N ordering', () => {
  it('documents the sliding-window rule in onLine', () => {
    expect(partsSrc).toMatch(/R1-09:[\s\S]*?parts\.slice\(at - n \+ 1, at \+ 1\)/);
  });

  it('when current is past the fit, shows a window ending at current (not first slots + current)', () => {
    const parts = stub(['outline', 's:a', 's:b', 'details', 'fixed', 'check', 'plan', 'langs', 'review', 'publish']);
    const { shown, more } = onLine(parts, 4, 'publish');
    expect(shown.map((p) => p.key)).toEqual(['plan', 'langs', 'review', 'publish']);
    expect(more.map((p) => p.key)).toEqual(['outline', 's:a', 's:b', 'details', 'fixed', 'check']);
  });

  it('when current fits in the first slots, still shows the start of the line', () => {
    const parts = stub(['outline', 's:a', 'details', 'fixed', 'check', 'publish']);
    const { shown } = onLine(parts, 4, 'details');
    expect(shown.map((p) => p.key)).toEqual(['outline', 's:a', 'details', 'fixed']);
  });
});
