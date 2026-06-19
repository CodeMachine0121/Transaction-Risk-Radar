import type { TraderRiskDto } from '../dto/traderRiskDto';
import { Trader } from '../entity/trader';
import type { ITraderMetricsWriter } from '../interface/iTraderMetricsWriter';
import type { ITraderPositionRepository } from '../interface/iTraderPositionRepository';

/** Domain Service（US-05）：載入倉位 → 重算 Trader → 持久化指標 → 回傳 DTO。 */
export class RecomputeTraderMetricsService {
  private readonly traderPositionRepository: ITraderPositionRepository;
  private readonly traderMetricsWriter: ITraderMetricsWriter;

  constructor(
    traderPositionRepository: ITraderPositionRepository,
    traderMetricsWriter: ITraderMetricsWriter,
  ) {
    this.traderPositionRepository = traderPositionRepository;
    this.traderMetricsWriter = traderMetricsWriter;
  }

  async recompute(traderAddress: string): Promise<TraderRiskDto> {
    const positions = await this.traderPositionRepository.findPositions(traderAddress);
    const trader = Trader.reconstruct(traderAddress, positions);
    await this.traderMetricsWriter.saveTraderMetrics(traderAddress, trader.metricsSnapshot());
    return trader.toRiskDto();
  }
}
