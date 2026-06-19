import { rankTradersByRiskScore } from '../domain/ranking/rankByRiskScore';
import type { RiskRankingQuery } from '../domain/ranking/rankByRiskScore';
import type { TraderRiskSummary } from '../domain/ranking/traderRiskSummary';
import type { ITraderMetricsRepository } from '../domain/interface/iTraderMetricsRepository';

/** 用例：查詢風險導向排行（US-01）。編排 repository 讀取與 domain 排序邏輯。 */
export class RiskRankingApplication {
  private readonly repository: ITraderMetricsRepository;

  constructor(repository: ITraderMetricsRepository) {
    this.repository = repository;
  }

  async listRanking(query: RiskRankingQuery): Promise<TraderRiskSummary[]> {
    const summaries = await this.repository.findRankableSummaries();
    return rankTradersByRiskScore(summaries, query);
  }
}
