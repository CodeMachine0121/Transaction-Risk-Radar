import type { TraderRiskDto } from '../dto/traderRiskDto';
import type { ITraderRepository } from '../interface/iTraderRepository';
import type { Provider } from '../vo/provider';

/** Domain Service：單一交易員風險詳情（US-02）。不存在時回傳 null（由 controller 映射 404）。 */
export class TraderDetailService {
  private readonly traderRepository: ITraderRepository;

  constructor(traderRepository: ITraderRepository) {
    this.traderRepository = traderRepository;
  }

  async getTraderDetail(provider: Provider, traderAddress: string): Promise<TraderRiskDto | null> {
    const trader = await this.traderRepository.findTrader(provider, traderAddress);
    return trader === null ? null : trader.toRiskDto();
  }
}
