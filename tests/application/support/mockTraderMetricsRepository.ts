import Decimal from 'decimal.js';
import { vi } from 'vitest';
import type { ITraderMetricsRepository } from '@/application/ports/iTraderMetricsRepository';
import type { TraderRiskSummary } from '@/domain/ranking/traderRiskSummary';

/** 測試資料工廠：產生一筆交易員風險摘要。 */
export const buildSummary = (
  traderAddress: string,
  riskScore: number | null,
): TraderRiskSummary => ({
  traderAddress,
  insufficientData: riskScore === null,
  riskScore: riskScore === null ? null : new Decimal(riskScore),
  maxAdverseExcursionPercentile90: null,
  averagingDownRatio: null,
  winRate: null,
  realizedProfitAndLoss: null,
  returnDownsideDeviation: null,
  averageLeverage: null,
  trapSignal: null,
  closedPositionCount: riskScore === null ? 0 : 25,
});

/**
 * 以 vi.fn 建立 ITraderMetricsRepository 介面的 mock（預設回空/ null）。
 * 各測試再用 vi.mocked(...).mockResolvedValue(...) 設定回傳值，不寫任何實作邏輯。
 */
export const createMockTraderMetricsRepository = (): ITraderMetricsRepository => ({
  findRankableSummaries: vi.fn<() => Promise<TraderRiskSummary[]>>().mockResolvedValue([]),
  findSummaryByAddress: vi
    .fn<(traderAddress: string) => Promise<TraderRiskSummary | null>>()
    .mockResolvedValue(null),
});
