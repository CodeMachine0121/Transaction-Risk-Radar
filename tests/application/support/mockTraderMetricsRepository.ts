import Decimal from 'decimal.js';
import { vi } from 'vitest';
import { Trader } from '@/domain/entity/trader';
import type { ITraderMetricsRepository } from '@/domain/interface/iTraderMetricsRepository';

/** 測試資料工廠：以 stored metrics hydrate 出一個 Trader（給定 riskScore）。 */
export const buildTrader = (traderAddress: string, riskScore: number | null): Trader =>
  Trader.fromStoredMetrics(traderAddress, {
    maxAdverseExcursionPercentile90: null,
    averagingDownRatio: null,
    winRate: null,
    realizedProfitAndLoss: null,
    returnDownsideDeviation: null,
    averageLeverage: null,
    trapSignal: null,
    riskScore: riskScore === null ? null : new Decimal(riskScore),
    closedPositionCount: riskScore === null ? 0 : 25,
    insufficientData: riskScore === null,
  });

export const createMockTraderMetricsRepository = (): ITraderMetricsRepository => ({
  findRankableTraders: vi.fn<() => Promise<Trader[]>>().mockResolvedValue([]),
  findTraderByAddress: vi
    .fn<(traderAddress: string) => Promise<Trader | null>>()
    .mockResolvedValue(null),
});
