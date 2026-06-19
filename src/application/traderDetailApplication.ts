import type { TraderRiskDto } from '../domain/dto/traderRiskDto';
import type { TraderDetailService } from '../domain/service/traderDetailService';

/** 用例（US-02）：委派 TraderDetailService 取得交易員詳情 DTO（不存在回傳 null）。 */
export class TraderDetailApplication {
  private readonly traderDetailService: TraderDetailService;

  constructor(traderDetailService: TraderDetailService) {
    this.traderDetailService = traderDetailService;
  }

  getTraderDetail(traderAddress: string): Promise<TraderRiskDto | null> {
    return this.traderDetailService.getTraderDetail(traderAddress);
  }
}
