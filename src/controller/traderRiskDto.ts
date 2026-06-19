import type Decimal from 'decimal.js';
import type { TraderRiskSummary } from '../domain/ranking/traderRiskSummary';

/** HTTP 回應 DTO：Decimal 一律序列化為字串，避免 JSON 浮點精度損失。 */
export interface ITraderRiskDto {
  traderAddress: string;
  insufficientData: boolean;
  closedPositionCount: number;
  riskScore: string | null;
  maxAdverseExcursionPercentile90: string | null;
  averagingDownRatio: string | null;
  winRate: string | null;
  realizedProfitAndLoss: string | null;
  returnDownsideDeviation: string | null;
  averageLeverage: string | null;
  trapSignal: string | null;
}

const toStringOrNull = (value: Decimal | null): string | null =>
  value === null ? null : value.toString();

export function toTraderRiskDto(summary: TraderRiskSummary): ITraderRiskDto {
  return {
    traderAddress: summary.traderAddress,
    insufficientData: summary.insufficientData,
    closedPositionCount: summary.closedPositionCount,
    riskScore: toStringOrNull(summary.riskScore),
    maxAdverseExcursionPercentile90: toStringOrNull(summary.maxAdverseExcursionPercentile90),
    averagingDownRatio: toStringOrNull(summary.averagingDownRatio),
    winRate: toStringOrNull(summary.winRate),
    realizedProfitAndLoss: toStringOrNull(summary.realizedProfitAndLoss),
    returnDownsideDeviation: toStringOrNull(summary.returnDownsideDeviation),
    averageLeverage: toStringOrNull(summary.averageLeverage),
    trapSignal: toStringOrNull(summary.trapSignal),
  };
}
