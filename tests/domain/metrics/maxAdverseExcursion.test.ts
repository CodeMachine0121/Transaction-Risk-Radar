import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  computeMaxAdverseExcursionPercentile90,
  computeMaxAdverseExcursionPerPosition,
} from '@/domain/metrics/maxAdverseExcursion';

const toDecimals = (values: number[]): Decimal[] => values.map((value) => new Decimal(value));

describe('computeMaxAdverseExcursionPerPosition', () => {
  it('returns the minimum (deepest) unrealized PnL percentage across snapshots', () => {
    const result = computeMaxAdverseExcursionPerPosition(toDecimals([-5, -35, -10]));
    expect(result.toString()).toBe('-35');
  });

  it('returns the smallest value even when the position never went underwater', () => {
    const result = computeMaxAdverseExcursionPerPosition(toDecimals([2, 1, 3]));
    expect(result.toString()).toBe('1');
  });

  it('returns the single value for a single snapshot', () => {
    const result = computeMaxAdverseExcursionPerPosition(toDecimals([-12]));
    expect(result.toString()).toBe('-12');
  });

  it('throws when there are no snapshots', () => {
    expect(() => computeMaxAdverseExcursionPerPosition([])).toThrow(RangeError);
  });
});

describe('computeMaxAdverseExcursionPercentile90', () => {
  it('returns the absolute MAE for a single position', () => {
    const result = computeMaxAdverseExcursionPercentile90(toDecimals([-30]));
    expect(result.toString()).toBe('30');
  });

  it('computes the 90th percentile of absolute MAE values with linear interpolation', () => {
    const result = computeMaxAdverseExcursionPercentile90(toDecimals([-10, -20, -30, -40, -50]));
    expect(result.toString()).toBe('46');
  });

  it('uses absolute values regardless of input ordering or sign', () => {
    const result = computeMaxAdverseExcursionPercentile90(toDecimals([-50, 10]));
    expect(result.toString()).toBe('46');
  });

  it('throws when there are no positions', () => {
    expect(() => computeMaxAdverseExcursionPercentile90([])).toThrow(RangeError);
  });
});
