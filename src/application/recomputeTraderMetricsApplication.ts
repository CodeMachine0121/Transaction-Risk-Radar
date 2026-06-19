import type { TraderRiskDto } from '../domain/dto/traderRiskDto';
import type { RecomputeTraderMetricsService } from '../domain/service/recomputeTraderMetricsService';

/** 用例（US-05）：委派 RecomputeTraderMetricsService 重算並持久化指標。 */
export class RecomputeTraderMetricsApplication {
  private readonly recomputeTraderMetricsService: RecomputeTraderMetricsService;

  constructor(recomputeTraderMetricsService: RecomputeTraderMetricsService) {
    this.recomputeTraderMetricsService = recomputeTraderMetricsService;
  }

  recompute(traderAddress: string): Promise<TraderRiskDto> {
    return this.recomputeTraderMetricsService.recompute(traderAddress);
  }
}
