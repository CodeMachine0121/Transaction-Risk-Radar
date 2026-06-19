import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { normalize } from './normalize';

describe('normalize', () => {
  it('returns value/cap when within [0, 1]', () => {
    expect(normalize(new Decimal(25), new Decimal(50)).toString()).toBe('0.5');
  });

  it('clamps to 1 when value exceeds cap', () => {
    expect(normalize(new Decimal(60), new Decimal(50)).toString()).toBe('1');
  });

  it('returns 0 when value is 0', () => {
    expect(normalize(new Decimal(0), new Decimal(50)).toString()).toBe('0');
  });

  it('clamps to 0 when value is negative', () => {
    expect(normalize(new Decimal(-10), new Decimal(50)).toString()).toBe('0');
  });

  it('throws when cap is not greater than zero', () => {
    expect(() => normalize(new Decimal(10), new Decimal(0))).toThrow(RangeError);
  });
});
