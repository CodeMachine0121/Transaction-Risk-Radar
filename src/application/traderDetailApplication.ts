import type { TraderRiskSummary } from '../domain/ranking/traderRiskSummary';
import type { TraderMetricsRepository } from './ports/traderMetricsRepository';

/** 用例：查詢單一交易員的風險詳情（US-02）。不存在時回傳 null（由 controller 映射為 404）。 */
export class TraderDetailApplication {
  private readonly repository: TraderMetricsRepository;

  constructor(repository: TraderMetricsRepository) {
    this.repository = repository;
  }

  async getTraderDetail(traderAddress: string): Promise<TraderRiskSummary | null> {
    return this.repository.findSummaryByAddress(traderAddress);
  }
}
