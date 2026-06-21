import { describe, expect, it } from 'vitest';
import { median } from '@/shared/math/median';

describe('median', () => {
  it('returns 0 for an empty series', () => {
    expect(median([])).toBe(0);
  });

  it('returns the middle value for an odd-length series', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middle values for an even-length series', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});
