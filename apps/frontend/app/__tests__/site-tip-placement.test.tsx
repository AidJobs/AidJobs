/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Tip from '@/components/site/Tip';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BUBBLE = { width: 120, height: 30 };
type Rect = { left: number; top: number; width: number; height: number };

let anchorRect: Rect;
let host: HTMLDivElement;
let root: Root;

function box(r: Rect) {
  return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => r } as DOMRect;
}

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('aj-tip')) return box(anchorRect);
    if (this.getAttribute('role') === 'tooltip') return box({ left: 0, top: 0, ...BUBBLE });
    return box({ left: 0, top: 0, width: 0, height: 0 });
  });
  host = document.createElement('div');
  host.className = 'aj-root';
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** Opens the tooltip with a long press and returns where it was drawn. */
function open(side: Parameters<typeof Tip>[0]['side'], at: Rect): Rect {
  anchorRect = at;
  act(() => root.render(<Tip label="Saved jobs" side={side}><button type="button">x</button></Tip>));
  const anchor = host.querySelector('.aj-tip') as HTMLElement;
  act(() => {
    anchor.dispatchEvent(new Event('touchstart', { bubbles: true }));
  });
  act(() => {
    jest.advanceTimersByTime(500);
  });
  const bubble = host.querySelector('[role="tooltip"]') as HTMLElement;
  expect(bubble).not.toBeNull();
  expect(bubble.style.visibility).toBe('visible');
  return { left: parseFloat(bubble.style.left), top: parseFloat(bubble.style.top), ...BUBBLE };
}

function overlaps(a: Rect, b: Rect) {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

function inside(b: Rect) {
  return b.left >= 8 && b.top >= 8 && b.left + b.width <= 1024 - 8 && b.top + b.height <= 768 - 8;
}

describe('Tip placement', () => {
  it('uses the preferred side when it fits', () => {
    const at = { left: 500, top: 300, width: 24, height: 24 };
    const b = open(undefined, at);
    expect(b.top + b.height).toBeLessThanOrEqual(at.top);
    expect(overlaps(b, at)).toBe(false);
  });

  it('goes below when there is no room above', () => {
    const at = { left: 500, top: 10, width: 24, height: 24 };
    const b = open('top', at);
    expect(b.top).toBeGreaterThanOrEqual(at.top + at.height);
    expect(overlaps(b, at)).toBe(false);
    expect(inside(b)).toBe(true);
  });

  it('goes above, not over the control, when there is no room below', () => {
    const at = { left: 500, top: 740, width: 24, height: 24 };
    const b = open('bottom', at);
    expect(b.top + b.height).toBeLessThanOrEqual(at.top);
    expect(overlaps(b, at)).toBe(false);
    expect(inside(b)).toBe(true);
  });

  it('goes to the left, not over the control, at the right edge', () => {
    const at = { left: 990, top: 300, width: 24, height: 24 };
    const b = open('right', at);
    expect(b.left + b.width).toBeLessThanOrEqual(at.left);
    expect(overlaps(b, at)).toBe(false);
    expect(inside(b)).toBe(true);
  });

  it('never covers the control on a narrow screen with a wide control', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    const at = { left: 8, top: 8, width: 344, height: 40 };
    const b = open('right', at);
    expect(overlaps(b, at)).toBe(false);
  });
});
