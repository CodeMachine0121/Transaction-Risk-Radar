import type { TraderRiskDto } from '../domain/dto/traderRiskDto';
import type { RiskRankingService } from '../domain/service/riskRankingService';
import type { RiskRankingQuery } from '../domain/vo/riskRankingQuery';

/** 用例（US-01）：委派 RiskRankingService 取得風險排行 DTO。 */
export class RiskRankingApplication {
  private readonly riskRankingService: RiskRankingService;

  constructor(riskRankingService: RiskRankingService) {
    this.riskRankingService = riskRankingService;
  }

  listRanking(query: RiskRankingQuery): Promise<TraderRiskDto[]> {
    return this.riskRankingService.listRanking(query);
  }
}
