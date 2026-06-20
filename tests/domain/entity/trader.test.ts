import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { Position } from '@/domain/entity/position';
import { Trader } from '@/domain/entity/trader';
import type { PositionLifecycleEvent } from '@/domain/vo/positionLifecycleEvent';
import type { PositionSnapshot } from '@/domain/vo/positionSnapshot';
import type { TraderMetrics } from '@/domain/vo/traderMetrics';

const event = (
  type: PositionLifecycleEvent['type'],
  price: number,
  size: number,
): PositionLifecycleEvent => ({ type, price: new Decimal(price), size: new Decimal(size) });

const snapshot = (unrealized: number, leverage: number): PositionSnapshot => ({
  unrealizedProfitAndLossPercentage: new Decimal(unrealized),
  leverage: new Decimal(leverage),
});

describe('Trader.reconstruct', () => {
  it('flags insufficient data and withholds the risk score below the minimum', () => {
    const position = new Position({
      coin: 'ETH',
      side: 'long',
      events: [event('open', 100, 1)],
      snapshots: [snapshot(-5, 10)],
      realizedProfitAndLoss: new Decimal(5),
      closed: true,
    });
    const trader = Trader.reconstruct('0xA', [position]); // default minimum 20

    expect(trader.isInsufficientData()).toBe(true);
    expect(trader.riskScore()).toBeNull();
    expect(trader.toRiskDto().closedPositionCount).toBe(1);
  });

  it('computes the full risk score (entity behaviour) when data is sufficient', () => {
    // one closed long position; minimum lowered to 1:
    //   open@100 + add@90 -> averaging down (ratio 1)
    //   snapshots -20/-40 -> MAE -40 -> p90 abs 40 -> normalized 0.8
    //   leverage 10 -> normalized 0.5; realized 19 / entryCost 190 = 10% -> a win, downside 0
    //   trap = 1 * 0.8 = 0.8
    //   risk = 100*(0.8*0.30 + 1*0.25 + 0.8*0.15 + 0*0.15 + 0.5*0.15) = 68.5
    const position = new Position({
      coin: 'ETH',
      side: 'long',
      events: [event('open', 100, 1), event('add', 90, 1)],
      snapshots: [snapshot(-20, 10), snapshot(-40, 10)],
      realizedProfitAndLoss: new Decimal(19),
      closed: true,
    });
    const trader = Trader.reconstruct('0xA', [position], { minimumClosedPositions: 1 });
    const dto = trader.toRiskDto();

    expect(trader.isInsufficientData()).toBe(false);
    expect(trader.riskScore()?.toString()).toBe('68.5');
    expect(dto.riskScore).toBe('68.5');
    expect(dto.maxAdverseExcursionPercentile90).toBe('40');
    expect(dto.averagingDownRatio).toBe('1');
    expect(dto.winRate).toBe('1');
  });

  it('excludes positions without snapshots', () => {
    const withSnapshot = new Position({
      coin: 'ETH',
      side: 'long',
      events: [event('open', 100, 1)],
      snapshots: [snapshot(-10, 10)],
      realizedProfitAndLoss: new Decimal(10),
      closed: true,
    });
    const withoutSnapshot = new Position({
      coin: 'BTC',
      side: 'long',
      events: [event('open', 100, 1)],
      snapshots: [],
      realizedProfitAndLoss: new Decimal(10),
      closed: true,
    });
    const trader = Trader.reconstruct('0xA', [withSnapshot, withoutSnapshot], {
      minimumClosedPositions: 1,
    });
    expect(trader.toRiskDto().closedPositionCount).toBe(1);
  });

  it('excludes closed positions outside the 90-day window from p&l and win-rate metrics', () => {
    const asOf = 1_700_000_000_000;
    const day = 86_400_000;
    const recentWin = new Position({
      coin: 'ETH',
      side: 'long',
      events: [event('open', 100, 1)],
      snapshots: [snapshot(-10, 10)],
      realizedProfitAndLoss: new Decimal(10),
      closed: true,
      openedAt: asOf - 2 * day,
      closedAt: asOf - day,
    });
    const staleLoss = new Position({
      coin: 'BTC',
      side: 'long',
      events: [event('open', 100, 1)],
      snapshots: [snapshot(-10, 10)],
      realizedProfitAndLoss: new Decimal(-50),
      closed: true,
      openedAt: asOf - 201 * day,
      closedAt: asOf - 200 * day,
    });
    const trader = Trader.reconstruct('0xA', [recentWin, staleLoss], {
      minimumClosedPositions: 1,
      asOf,
    });
    const dto = trader.toRiskDto();

    expect(dto.closedPositionCount).toBe(1); // only the in-window position contributes
    expect(dto.winRate).toBe('1'); // the stale loss is excluded from the win rate
  });

  it('flags insufficient data when every closed position is outside the window', () => {
    const asOf = 1_700_000_000_000;
    const day = 86_400_000;
    const staleClosed = (coin: string): Position =>
      new Position({
        coin,
        side: 'long',
        events: [event('open', 100, 1)],
        snapshots: [snapshot(-10, 10)],
        realizedProfitAndLoss: new Decimal(5),
        closed: true,
        openedAt: asOf - 201 * day,
        closedAt: asOf - 200 * day,
      });
    const trader = Trader.reconstruct('0xA', [staleClosed('ETH'), staleClosed('BTC')], {
      minimumClosedPositions: 1,
      asOf,
    });

    expect(trader.isInsufficientData()).toBe(true);
    expect(trader.toRiskDto().closedPositionCount).toBe(0);
  });
});

describe('Trader.fromStoredMetrics', () => {
  it('hydrates from stored metrics and serializes to DTO', () => {
    const metrics: TraderMetrics = {
      maxAdverseExcursionPercentile90: new Decimal(40),
      averagingDownRatio: new Decimal(1),
      winRate: new Decimal(1),
      realizedProfitAndLoss: new Decimal(19),
      returnDownsideDeviation: new Decimal(0),
      averageLeverage: new Decimal(10),
      trapSignal: new Decimal('0.8'),
      riskScore: new Decimal('68.5'),
      closedPositionCount: 30,
      insufficientData: false,
    };
    const trader = Trader.fromStoredMetrics('0xB', metrics);

    expect(trader.riskScore()?.toString()).toBe('68.5');
    expect(trader.toRiskDto().traderAddress).toBe('0xB');
    expect(trader.toRiskDto().winRate).toBe('1');
  });
});
