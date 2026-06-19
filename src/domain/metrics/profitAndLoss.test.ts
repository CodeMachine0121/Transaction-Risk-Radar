import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { computeRealizedProfitAndLoss, computeWinRate } from './profitAndLoss';

const toDecimals = (values: number[]): Decimal[] => values.map((value) => new Decimal(value));

describe('computeRealizedProfitAndLoss', () => {
  it('sums the realized PnL of closed positions', () => {
    expect(computeRealizedProfitAndLoss(toDecimals([100, -50, 25])).toString()).toBe('75');
  });

  it('returns 0 when there are no closed positions', () => {
    expect(computeRealizedProfitAndLoss([]).toString()).toBe('0');
  });
});

describe('computeWinRate', () => {
  it('returns the fraction of closed positions with a positive return', () => {
    expect(computeWinRate(toDecimals([10, -5, 20, -3])).toString()).toBe('0.5');
  });

  it('treats a zero return as not a win', () => {
    expect(computeWinRate(toDecimals([0, 10])).toString()).toBe('0.5');
  });

  it('returns 1 when every position is a win', () => {
    expect(computeWinRate(toDecimals([5, 5, 5])).toString()).toBe('1');
  });

  it('returns 0 when no position is a win', () => {
    expect(computeWinRate(toDecimals([-1, -2])).toString()).toBe('0');
  });

  it('throws when there are no closed positions', () => {
    expect(() => computeWinRate([])).toThrow(RangeError);
  });
});
