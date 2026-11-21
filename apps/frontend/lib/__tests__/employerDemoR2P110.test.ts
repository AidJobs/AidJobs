/**
 * R2-P1-10 (21 November 2026): phone writing chrome uses a 44px touch token
 * and full-opacity section tools under (hover: none).
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, '../../components/employer-demo/employer-demo.css'), 'utf8');

describe('R2-P1-10: mobile 44px writing chrome', () => {
  it('defines --ej-touch: 44px for the employer demo under 1023px', () => {
    expect(css).toMatch(/@media \(max-width: 1023px\)[\s\S]*--ej-touch:\s*44px/);
  });

  it('sizes section icons, Chat/Job switch, Send, and parts button with the touch token', () => {
    expect(css).toMatch(/\.ej-sec-icon[\s\S]*width:\s*var\(--ej-touch\)/);
    expect(css).toMatch(/\.ej-switch-btn[\s\S]*height:\s*var\(--ej-touch\)/);
    expect(css).toMatch(/\.ej-send[\s\S]*width:\s*var\(--ej-touch\)/);
    expect(css).toMatch(/\.ej-parts-btn[\s\S]*flex:\s*1 1 0/);
  });

  it('makes section tools fully opaque under 1023px and sticks the edit actions bar', () => {
    expect(css).toMatch(/@media \(max-width: 1023px\)[\s\S]*\.ej-sec-tools\s*\{\s*opacity:\s*1/);
    expect(css).toMatch(/\.ej-edit-actions[\s\S]*position:\s*sticky/);
  });
});
