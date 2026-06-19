import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { computeReturnDownsideDeviation } from '@/domain/metrics/returnDownsideDeviation';

const toDecimals = (values: number[]): Decimal[] => values.map((value) => new Decimal(value));

describe('computeReturnDownsideDeviation', () => {
  it('computes the population standard deviation of the negative returns only', () => {
    // negatives [-10, -20] → mean -15 → variance 25 → std 5
    expect(computeReturnDownsideDeviation(toDecimals([-10, -20, 10, 30])).toString()).toBe('5');
  });

  it('ignores positive returns entirely', () => {
    // negatives [-10, -30] → mean -20 → variance 100 → std 10
    expect(computeReturnDownsideDeviation(toDecimals([-10, -30, 5, 5])).toString()).toBe('10');
  });

  it('returns 0 for a single negative return (no spread)', () => {
    expect(computeReturnDownsideDeviation(toDecimals([-10, 5])).toString()).toBe('0');
  });

  it('returns 0 when there are no negative returns', () => {
    expect(computeReturnDownsideDeviation(toDecimals([10, 20])).toString()).toBe('0');
  });

  it('returns 0 for an empty input', () => {
    expect(computeReturnDownsideDeviation([]).toString()).toBe('0');
  });
});
