import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import type { ITraderFill } from '@/application/ports/hyperliquidProxy';
import { reconstructPositions } from '@/domain/reconstruction/reconstructPositions';

interface IFillSpec {
  side: 'buy' | 'sell';
  price: number;
  size: number;
  startPosition: number;
  time: number;
  closedPnl?: number;
  coin?: string;
}

const fill = (spec: IFillSpec): ITraderFill => ({
  coin: spec.coin ?? 'ETH',
  price: new Decimal(spec.price),
  size: new Decimal(spec.size),
  side: spec.side,
  timestamp: spec.time,
  startPosition: new Decimal(spec.startPosition),
  direction: '',
  closedProfitAndLoss: new Decimal(spec.closedPnl ?? 0),
  tradeId: spec.time,
  hash: '',
});

const eventTypes = (events: { type: string }[]): string[] => events.map((event) => event.type);

describe('reconstructPositions', () => {
  it('reconstructs a simple long open then close with ROI return', () => {
    const positions = reconstructPositions([
      fill({ side: 'buy', price: 100, size: 1, startPosition: 0, time: 1 }),
      fill({ side: 'sell', price: 110, size: 1, startPosition: 1, time: 2, closedPnl: 10 }),
    ]);

    expect(positions).toHaveLength(1);
    expect(positions[0]?.side).toBe('long');
    expect(eventTypes(positions[0]?.events ?? [])).toEqual(['open', 'close']);
    expect(positions[0]?.realizedProfitAndLoss.toString()).toBe('10');
    expect(positions[0]?.realizedReturnPercentage.toString()).toBe('10');
    expect(positions[0]?.isClosed).toBe(true);
  });

  it('classifies an add and uses total entry cost as the ROI basis', () => {
    const positions = reconstructPositions([
      fill({ side: 'buy', price: 100, size: 1, startPosition: 0, time: 1 }),
      fill({ side: 'buy', price: 200, size: 1, startPosition: 1, time: 2 }),
      fill({ side: 'sell', price: 180, size: 2, startPosition: 2, time: 3, closedPnl: 60 }),
    ]);

    expect(eventTypes(positions[0]?.events ?? [])).toEqual(['open', 'add', 'close']);
    expect(positions[0]?.realizedReturnPercentage.toString()).toBe('20');
  });

  it('classifies a partial reduce before closing', () => {
    const positions = reconstructPositions([
      fill({ side: 'buy', price: 100, size: 2, startPosition: 0, time: 1 }),
      fill({ side: 'sell', price: 110, size: 1, startPosition: 2, time: 2, closedPnl: 10 }),
      fill({ side: 'sell', price: 120, size: 1, startPosition: 1, time: 3, closedPnl: 20 }),
    ]);

    expect(eventTypes(positions[0]?.events ?? [])).toEqual(['open', 'reduce', 'close']);
    expect(positions[0]?.realizedProfitAndLoss.toString()).toBe('30');
    expect(positions[0]?.realizedReturnPercentage.toString()).toBe('15');
  });

  it('reconstructs a short position', () => {
    const positions = reconstructPositions([
      fill({ side: 'sell', price: 100, size: 1, startPosition: 0, time: 1 }),
      fill({ side: 'buy', price: 90, size: 1, startPosition: -1, time: 2, closedPnl: 10 }),
    ]);

    expect(positions[0]?.side).toBe('short');
    expect(positions[0]?.realizedReturnPercentage.toString()).toBe('10');
    expect(positions[0]?.isClosed).toBe(true);
  });

  it('marks a still-open position as not closed', () => {
    const positions = reconstructPositions([
      fill({ side: 'buy', price: 100, size: 1, startPosition: 0, time: 1 }),
    ]);

    expect(positions).toHaveLength(1);
    expect(positions[0]?.isClosed).toBe(false);
    expect(eventTypes(positions[0]?.events ?? [])).toEqual(['open']);
  });

  it('separates positions by coin', () => {
    const positions = reconstructPositions([
      fill({ coin: 'ETH', side: 'buy', price: 100, size: 1, startPosition: 0, time: 1 }),
      fill({ coin: 'ETH', side: 'sell', price: 110, size: 1, startPosition: 1, time: 2, closedPnl: 10 }),
      fill({ coin: 'BTC', side: 'buy', price: 2000, size: 1, startPosition: 0, time: 3 }),
    ]);

    expect(positions).toHaveLength(2);
    expect(positions.map((position) => position.coin).sort()).toEqual(['BTC', 'ETH']);
  });

  it('splits a sign flip into a closed position and a new opposite one', () => {
    const positions = reconstructPositions([
      fill({ side: 'buy', price: 100, size: 1, startPosition: 0, time: 1 }),
      fill({ side: 'sell', price: 120, size: 3, startPosition: 1, time: 2, closedPnl: 20 }),
    ]);

    expect(positions).toHaveLength(2);
    expect(positions[0]?.side).toBe('long');
    expect(positions[0]?.isClosed).toBe(true);
    expect(eventTypes(positions[0]?.events ?? [])).toEqual(['open', 'close']);
    expect(positions[0]?.realizedReturnPercentage.toString()).toBe('20');
    expect(positions[1]?.side).toBe('short');
    expect(positions[1]?.isClosed).toBe(false);
    expect(eventTypes(positions[1]?.events ?? [])).toEqual(['open']);
  });
});
