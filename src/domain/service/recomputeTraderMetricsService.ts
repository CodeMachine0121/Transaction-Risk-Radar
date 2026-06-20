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
    const positionTrader = Trader.reconstruct(provider, traderAddress, positions);
    const trader = positionTrader.toRiskDto().insufficientData
      ? await this.withAccountFallback(provider, traderAddress, positionTrader)
      : positionTrader;
    await this.traderRepository.saveTraderMetrics(trader);
    return trader.toRiskDto();
  }

  /** 部位級資料不足時，若該交易員有帳戶級彙總則改算粗版風險（tier=account）；否則維持部位級結果。 */
  private async withAccountFallback(
    provider: Provider,
    traderAddress: string,
    positionTrader: Trader,
  ): Promise<Trader> {
    const accountStats = await this.traderRepository.findAccountStats(provider, traderAddress);
    if (accountStats === null) {
      return positionTrader;
    }
    return Trader.fromAccountStats(provider, traderAddress, accountStats);
  }
}
