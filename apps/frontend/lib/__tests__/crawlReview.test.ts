import { completenessBadge, foundVsExpectedLabel } from '@/lib/admin/crawlReview';

describe('crawlReview helpers', () => {
  test('foundVsExpectedLabel formats known and unknown expected counts', () => {
    expect(foundVsExpectedLabel(209, 209)).toBe('209 / 209 expected');
    expect(foundVsExpectedLabel(120, 286)).toBe('120 / 286 expected');
    expect(foundVsExpectedLabel(32, null)).toBe('32 found (expected unknown)');
    expect(foundVsExpectedLabel(3, undefined)).toBe('3 found (expected unknown)');
  });

  test('completenessBadge maps true, false, and null/undefined', () => {
    expect(completenessBadge(true)).toEqual({ text: 'Complete', tone: 'ok' });
    expect(completenessBadge(false)).toEqual({ text: 'Partial', tone: 'warn' });
    expect(completenessBadge(null)).toEqual({ text: 'Unknown', tone: 'neutral' });
    expect(completenessBadge(undefined)).toEqual({ text: 'Unknown', tone: 'neutral' });
  });
});
