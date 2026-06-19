import type { TraderRiskSummary } from '../../domain/ranking/traderRiskSummary';

/**
 * Repository port（由 infrastructure 實作，application 只依賴此介面 → DIP）。
 * 提供已計算好的交易員風險指標摘要的讀取。
 */
export interface TraderMetricsRepository {
  /** 取得所有可排行（已有 riskScore、非 insufficientData）的交易員摘要。 */
  findRankableSummaries(): Promise<TraderRiskSummary[]>;
  /** 依地址取得單一交易員摘要；不存在回傳 null。 */
  findSummaryByAddress(traderAddress: string): Promise<TraderRiskSummary | null>;
}
