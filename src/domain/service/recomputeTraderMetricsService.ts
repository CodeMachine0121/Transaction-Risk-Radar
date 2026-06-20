import type { TraderRiskDto } from '../dto/traderRiskDto';
import { Trader } from '../entity/trader';
import type { IPositionRepository } from '../interface/iPositionRepository';
import type { ITraderRepository } from '../interface/iTraderRepository';
import type { Provider } from '../vo/provider';

/** Domain Service（US-05）：載入倉位 → 重算 Trader → 持久化指標 → 回傳 DTO。 */
export class RecomputeTraderMetricsService {
  private readonly positionRepository: IPositionRepository;
  private readonly traderRepository: ITraderRepository;

  constructor(positionRepository: IPositionRepository, traderRepository: ITraderRepository) {
    this.positionRepository = positionRepository;
    this.traderRepository = traderRepository;
  }

  async recompute(provider: Provider, traderAddress: string): Promise<TraderRiskDto> {
    const positions = await this.positionRepository.findPositions(provider, traderAddress);
    const trader = Trader.reconstruct(provider, traderAddress, positions);
    await this.traderRepository.saveTraderMetrics(trader);
    return trader.toRiskDto();
  }
}
