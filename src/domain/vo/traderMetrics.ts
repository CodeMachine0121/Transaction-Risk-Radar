import type Decimal from 'decimal.js';
import type { RiskScoreTier } from './riskScoreTier';

/** 交易員彙總指標（Trader entity 的計算結果，亦對應持久化的 trader_metrics）。 */
export type TraderMetrics = {
  riskScoreTier: RiskScoreTier;
  maxAdverseExcursionPercentile90: Decimal | null;
  averagingDownRatio: Decimal | null;
  winRate: Decimal | null;
  realizedProfitAndLoss: Decimal | null;
  returnDownsideDeviation: Decimal | null;
  averageLeverage: Decimal | null;
  trapSignal: Decimal | null;
  riskScore: Decimal | null;
  closedPositionCount: number;
  insufficientData: boolean;
};
