import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { computeTraderMetrics, type ITraderPositionInput } from '@/domain/metrics/traderMetrics';

const longPosition = (overrides: Partial<ITraderPositionInput> = {}): ITraderPositionInput => ({
  side: 'long',
  events: [{ type: 'open', price: new Decimal(100), size: new Decimal(1) }],
  unrealizedProfitAndLossPercentages: [new Decimal(-5)],
  averageLeverage: new Decimal(10),
  closed: { realizedReturnPercentage: new Decimal(5), realizedProfitAndLoss: new Decimal(5) },
  ...overrides,
});

describe('computeTraderMetrics', () => {
  it('flags insufficient data and withholds the risk score below the minimum closed positions', () => {
    const result = computeTraderMetrics({
      positions: [longPosition(), longPosition(), longPosition()],
    });
    expect(result.insufficientData).toBe(true);
    expect(result.closedPositionCount).toBe(3);
    expect(result.riskScore).toBeNull();
  });

  it('wires every metric together into a risk score when data is sufficient', () => {
    // single closed long position, minimum lowered to 1:
    //   events open@100 then add@90 (long) -> averaging down -> ratio 1
    //   snapshots [-20, -40] -> MAE -40 -> p90 abs = 40 -> normalized 40/50 = 0.8
    //   leverage 10 -> normalized 10/20 = 0.5
    //   closed return +5 (a win) -> winRate 1, downside deviation 0
    //   trapSignal = 1 * 0.8 = 0.8
    //   riskScore = 100*(0.8*0.30 + 1*0.25 + 0.8*0.15 + 0*0.15 + 0.5*0.15) = 68.5
    const result = computeTraderMetrics({
      minimumClosedPositions: 1,
      positions: [
        longPosition({
          events: [
            { type: 'open', price: new Decimal(100), size: new Decimal(1) },
            { type: 'add', price: new Decimal(90), size: new Decimal(1) },
          ],
          unrealizedProfitAndLossPercentages: [new Decimal(-20), new Decimal(-40)],
        }),
      ],
    });

    expect(result.insufficientData).toBe(false);
    expect(result.closedPositionCount).toBe(1);
    expect(result.maxAdverseExcursionPercentile90?.toString()).toBe('40');
    expect(result.averagingDownRatio?.toString()).toBe('1');
    expect(result.winRate?.toString()).toBe('1');
    expect(result.returnDownsideDeviation?.toString()).toBe('0');
    expect(result.trapSignal?.toString()).toBe('0.8');
    expect(result.riskScore?.toString()).toBe('68.5');
  });
});
