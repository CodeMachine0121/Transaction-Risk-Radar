import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { computeMaxAdverseExcursionPerPosition } from './maxAdverseExcursion';

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
