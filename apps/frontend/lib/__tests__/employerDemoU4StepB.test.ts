/**
 * U-4 Step B (20 November 2026): grip click vs drag — a small wobble must not start a drag (menu still opens on click).
 * Naming / Add was Step A. Fake “Moved” at ends closed in R1-10 leftover (`employerDemoR1_10Ends.test.ts`); group drops stay open.
 */
import { describe, expect, it } from '@jest/globals';
import { GRIP_DRAG_PX, gripMovedEnough } from '../../components/employer-demo/Grip';

describe('U-4 Step B: grip drag threshold', () => {
  it('uses 12px so a normal press wobble stays a click', () => {
    expect(GRIP_DRAG_PX).toBe(12);
  });

  it('movements under the threshold are not drags (menu click still wins)', () => {
    expect(gripMovedEnough(0, 0)).toBe(false);
    expect(gripMovedEnough(3, 0)).toBe(false);
    expect(gripMovedEnough(0, 3)).toBe(false);
    expect(gripMovedEnough(8, 8)).toBe(false); // hypot ≈ 11.3
  });

  it('movements at or past the threshold start a drag', () => {
    expect(gripMovedEnough(12, 0)).toBe(true);
    expect(gripMovedEnough(0, 12)).toBe(true);
    expect(gripMovedEnough(9, 9)).toBe(true); // hypot ≈ 12.7
  });
});
