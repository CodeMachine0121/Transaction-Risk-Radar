import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  computeAveragingDownRatio,
  detectAveragingDown,
  type PositionLifecycleEvent,
} from '@/domain/metrics/averagingDown';

const event = (
  type: PositionLifecycleEvent['type'],
  price: number,
  size: number,
): PositionLifecycleEvent => ({ type, price: new Decimal(price), size: new Decimal(size) });

describe('detectAveragingDown', () => {
  it('flags a long that adds at a price below its average entry (adding into a loss)', () => {
    const events = [event('open', 100, 1), event('add', 90, 1)];
    expect(detectAveragingDown('long', events)).toBe(true);
  });

  it('does not flag a long that adds at a price above its average entry (scaling into a winner)', () => {
    const events = [event('open', 100, 1), event('add', 110, 1)];
    expect(detectAveragingDown('long', events)).toBe(false);
  });

  it('flags a short that adds at a price above its average entry', () => {
    const events = [event('open', 100, 1), event('add', 110, 1)];
    expect(detectAveragingDown('short', events)).toBe(true);
  });

  it('does not flag a short that adds at a price below its average entry', () => {
    const events = [event('open', 100, 1), event('add', 90, 1)];
    expect(detectAveragingDown('short', events)).toBe(false);
  });

  it('does not flag a position with no add events', () => {
    const events = [event('open', 100, 1), event('close', 120, 1)];
    expect(detectAveragingDown('long', events)).toBe(false);
  });

  it('flags when any one of several adds is adverse', () => {
    const events = [event('open', 100, 1), event('add', 110, 1), event('add', 95, 1)];
    expect(detectAveragingDown('long', events)).toBe(true);
  });
});

describe('computeAveragingDownRatio', () => {
  it('returns the fraction of positions flagged as averaging down', () => {
    expect(computeAveragingDownRatio([true, false, false, false]).toString()).toBe('0.25');
  });

  it('returns 1 when every position averages down', () => {
    expect(computeAveragingDownRatio([true, true]).toString()).toBe('1');
  });

  it('returns 0 when no position averages down', () => {
    expect(computeAveragingDownRatio([false, false, false]).toString()).toBe('0');
  });

  it('throws when there are no positions', () => {
    expect(() => computeAveragingDownRatio([])).toThrow(RangeError);
  });
});
