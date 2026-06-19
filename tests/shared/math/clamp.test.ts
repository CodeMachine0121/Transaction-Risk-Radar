import { describe, expect, it } from 'vitest';
import { clamp } from '@/shared/math/clamp';

describe('clamp', () => {
  it('returns the value when within range', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('clamps to the minimum when below range', () => {
    expect(clamp(-2, 0, 1)).toBe(0);
  });

  it('clamps to the maximum when above range', () => {
    expect(clamp(5, 0, 1)).toBe(1);
  });
});
