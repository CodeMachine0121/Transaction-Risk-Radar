import type { TraderRiskDto } from '../dto/traderRiskDto';
import { Trader } from '../entity/trader';
import type { IPositionRepository } from '../interface/iPositionRepository';
import type { ITraderRepository } from '../interface/iTraderRepository';

/** Domain Service（US-05）：載入倉位 → 重算 Trader → 持久化指標 → 回傳 DTO。 */
export class RecomputeTraderMetricsService {
  private readonly positionRepository: IPositionRepository;
  private readonly traderRepository: ITraderRepository;

  constructor(positionRepository: IPositionRepository, traderRepository: ITraderRepository) {
    this.positionRepository = positionRepository;
    this.traderRepository = traderRepository;
  }

  async recompute(traderAddress: string): Promise<TraderRiskDto> {
    const positions = await this.positionRepository.findPositions(traderAddress);
    const trader = Trader.reconstruct(traderAddress, positions);
    await this.traderRepository.saveTraderMetrics(trader);
    return trader.toRiskDto();
  }
}
