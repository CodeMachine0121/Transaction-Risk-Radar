import type { TraderRiskSummary } from '../ranking/traderRiskSummary';

/** 讀取已計算好的交易員風險指標摘要。 */
export interface ITraderMetricsRepository {
  /** 取得所有可排行（已有 riskScore、非 insufficientData）的交易員摘要。 */
  findRankableSummaries(): Promise<TraderRiskSummary[]>;
  /** 依地址取得單一交易員摘要；不存在回傳 null。 */
  findSummaryByAddress(traderAddress: string): Promise<TraderRiskSummary | null>;
}
