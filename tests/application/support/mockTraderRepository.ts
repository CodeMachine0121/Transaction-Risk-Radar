import Decimal from 'decimal.js';
import { vi } from 'vitest';
import { Trader } from '@/domain/entity/trader';
import type { ITraderRepository } from '@/domain/interface/iTraderRepository';
import { Provider } from '@/domain/vo/provider';
import type { TraderKey } from '@/domain/vo/traderKey';

/** 測試資料工廠：以 stored metrics hydrate 出一個 Trader（給定 riskScore）。 */
export const buildTrader = (
  traderAddress: string,
  riskScore: number | null,
  provider: Provider = Provider.Hyperliquid,
): Trader =>
  Trader.fromStoredMetrics(provider, traderAddress, {
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

export const createMockTraderRepository = (): ITraderRepository => ({
  saveTraders: vi
    .fn<(provider: Provider, traderAddresses: string[]) => Promise<void>>()
    .mockResolvedValue(undefined),
  findAllTraderKeys: vi.fn<() => Promise<TraderKey[]>>().mockResolvedValue([]),
  findRankableTraders: vi.fn<(provider?: Provider) => Promise<Trader[]>>().mockResolvedValue([]),
  findTrader: vi
    .fn<(provider: Provider, traderAddress: string) => Promise<Trader | null>>()
    .mockResolvedValue(null),
  saveTraderMetrics: vi.fn<(trader: Trader) => Promise<void>>().mockResolvedValue(undefined),
});
