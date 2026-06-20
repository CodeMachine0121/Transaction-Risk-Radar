import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { Position } from '@/domain/entity/position';
import type { PositionLifecycleEvent } from '@/domain/vo/positionLifecycleEvent';
import type { PositionSnapshot } from '@/domain/vo/positionSnapshot';
import type { PositionSide } from '@/domain/vo/positionSide';
import type { TraderFill } from '@/domain/vo/traderFill';

const fill = (spec: {
  side: 'buy' | 'sell';
  price: number;
  size: number;
  time: number;
  closedPnl?: number;
  coin?: string;
}): TraderFill => ({
  coin: spec.coin ?? 'ETH',
  price: new Decimal(spec.price),
  size: new Decimal(spec.size),
  side: spec.side,
  timestamp: spec.time,
  startPosition: new Decimal(0),
  direction: '',
  closedProfitAndLoss: new Decimal(spec.closedPnl ?? 0),
  tradeId: spec.time,
  hash: '',
});

const event = (
  type: PositionLifecycleEvent['type'],
  price: number,
  size: number,
): PositionLifecycleEvent => ({ type, price: new Decimal(price), size: new Decimal(size) });

const snapshot = (unrealized: number, leverage: number): PositionSnapshot => ({
  unrealizedProfitAndLossPercentage: new Decimal(unrealized),
  leverage: new Decimal(leverage),
});

const buildPosition = (overrides: {
  side?: PositionSide;
  events?: PositionLifecycleEvent[];
  snapshots?: PositionSnapshot[];
  realizedProfitAndLoss?: number;
  closed?: boolean;
}): Position =>
  new Position({
    coin: 'ETH',
    side: overrides.side ?? 'long',
    events: overrides.events ?? [event('open', 100, 1)],
    snapshots: overrides.snapshots ?? [],
    realizedProfitAndLoss: new Decimal(overrides.realizedProfitAndLoss ?? 0),
    closed: overrides.closed ?? false,
  });

describe('Position.reconstruct', () => {
  it('reconstructs a simple long open then close (ROI 10%)', () => {
    const positions = Position.reconstruct([
      fill({ side: 'buy', price: 100, size: 1, time: 1 }),
      fill({ side: 'sell', price: 110, size: 1, time: 2, closedPnl: 10 }),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0]?.side()).toBe('long');
    expect(positions[0]?.isClosed()).toBe(true);
    expect(positions[0]?.realizedReturnPercentage().toString()).toBe('10');
  });

  it('uses total entry cost as ROI basis after an add (20%)', () => {
    const positions = Position.reconstruct([
      fill({ side: 'buy', price: 100, size: 1, time: 1 }),
      fill({ side: 'buy', price: 200, size: 1, time: 2 }),
      fill({ side: 'sell', price: 180, size: 2, time: 3, closedPnl: 60 }),
    ]);
    expect(positions[0]?.realizedReturnPercentage().toString()).toBe('20');
  });

  it('handles a partial reduce then close (15%)', () => {
    const positions = Position.reconstruct([
      fill({ side: 'buy', price: 100, size: 2, time: 1 }),
      fill({ side: 'sell', price: 110, size: 1, time: 2, closedPnl: 10 }),
      fill({ side: 'sell', price: 120, size: 1, time: 3, closedPnl: 20 }),
    ]);
    expect(positions[0]?.realizedProfitAndLoss().toString()).toBe('30');
    expect(positions[0]?.realizedReturnPercentage().toString()).toBe('15');
  });

  it('reconstructs a short position', () => {
    const positions = Position.reconstruct([
      fill({ side: 'sell', price: 100, size: 1, time: 1 }),
      fill({ side: 'buy', price: 90, size: 1, time: 2, closedPnl: 10 }),
    ]);
    expect(positions[0]?.side()).toBe('short');
    expect(positions[0]?.realizedReturnPercentage().toString()).toBe('10');
  });

  it('marks a still-open position as not closed', () => {
    const positions = Position.reconstruct([fill({ side: 'buy', price: 100, size: 1, time: 1 })]);
    expect(positions).toHaveLength(1);
    expect(positions[0]?.isClosed()).toBe(false);
  });

  it('separates positions by coin', () => {
    const positions = Position.reconstruct([
      fill({ coin: 'ETH', side: 'buy', price: 100, size: 1, time: 1 }),
      fill({ coin: 'ETH', side: 'sell', price: 110, size: 1, time: 2, closedPnl: 10 }),
      fill({ coin: 'BTC', side: 'buy', price: 2000, size: 1, time: 3 }),
    ]);
    expect(positions).toHaveLength(2);
    expect(positions.map((position) => position.coin()).sort()).toEqual(['BTC', 'ETH']);
  });

  it('splits a sign flip into a closed position and a new opposite one', () => {
    const positions = Position.reconstruct([
      fill({ side: 'buy', price: 100, size: 1, time: 1 }),
      fill({ side: 'sell', price: 120, size: 3, time: 2, closedPnl: 20 }),
    ]);
    expect(positions).toHaveLength(2);
    expect(positions[0]?.side()).toBe('long');
    expect(positions[0]?.isClosed()).toBe(true);
    expect(positions[0]?.realizedReturnPercentage().toString()).toBe('20');
    expect(positions[1]?.side()).toBe('short');
    expect(positions[1]?.isClosed()).toBe(false);
  });
});

describe('Position behaviour', () => {
  it('maxAdverseExcursion returns the deepest snapshot drawdown', () => {
    const position = buildPosition({ snapshots: [snapshot(-5, 10), snapshot(-35, 10)] });
    expect(position.maxAdverseExcursion().toString()).toBe('-35');
  });

  it('averageLeverage is the mean snapshot leverage', () => {
    const position = buildPosition({ snapshots: [snapshot(-5, 10), snapshot(-5, 20)] });
    expect(position.averageLeverage().toString()).toBe('15');
  });

  it('flags averaging down when a long adds below its average entry', () => {
    const position = buildPosition({ events: [event('open', 100, 1), event('add', 90, 1)] });
    expect(position.isAveragingDown()).toBe(true);
  });

  it('does not flag scaling into a winner', () => {
    const position = buildPosition({ events: [event('open', 100, 1), event('add', 110, 1)] });
    expect(position.isAveragingDown()).toBe(false);
  });

  it('flags averaging down when a short adds above its average entry', () => {
    const position = buildPosition({
      side: 'short',
      events: [event('open', 100, 1), event('add', 110, 1)],
    });
    expect(position.isAveragingDown()).toBe(true);
  });

  it('does not flag a short scaling into a winner (adds below average entry)', () => {
    const position = buildPosition({
      side: 'short',
      events: [event('open', 100, 1), event('add', 90, 1)],
    });
    expect(position.isAveragingDown()).toBe(false);
  });

  it('throws on maxAdverseExcursion without snapshots', () => {
    expect(() => buildPosition({ snapshots: [] }).maxAdverseExcursion()).toThrow(RangeError);
  });
});
