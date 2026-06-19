import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { computeTrapSignal } from './trapSignal';

describe('computeTrapSignal', () => {
  it('multiplies win rate by the normalized MAE', () => {
    expect(computeTrapSignal(new Decimal('0.9'), new Decimal('0.8')).toString()).toBe('0.72');
  });

  it('is 0 when win rate is 0', () => {
    expect(computeTrapSignal(new Decimal(0), new Decimal('0.8')).toString()).toBe('0');
  });

  it('equals the normalized MAE when win rate is 1', () => {
    expect(computeTrapSignal(new Decimal(1), new Decimal('0.5')).toString()).toBe('0.5');
  });
});
