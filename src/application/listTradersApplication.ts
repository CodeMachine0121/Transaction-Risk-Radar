import type { TraderRiskDto } from '../domain/dto/traderRiskDto';
import type { TraderListService } from '../domain/service/traderListService';
import type { RiskRankingQuery } from '../domain/vo/riskRankingQuery';

/** 用例：委派 TraderListService 列出全部追蹤交易員（含 insufficientData）。 */
export class ListTradersApplication {
  private readonly traderListService: TraderListService;

  constructor(traderListService: TraderListService) {
    this.traderListService = traderListService;
  }

  list(query: RiskRankingQuery): Promise<TraderRiskDto[]> {
    return this.traderListService.listTraders(query);
  }
}
