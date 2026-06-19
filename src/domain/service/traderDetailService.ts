import type { TraderRiskDto } from '../dto/traderRiskDto';
import type { ITraderMetricsRepository } from '../interface/iTraderMetricsRepository';

/** Domain Service：單一交易員風險詳情（US-02）。不存在時回傳 null（由 controller 映射 404）。 */
export class TraderDetailService {
  private readonly traderMetricsRepository: ITraderMetricsRepository;

  constructor(traderMetricsRepository: ITraderMetricsRepository) {
    this.traderMetricsRepository = traderMetricsRepository;
  }

  async getTraderDetail(traderAddress: string): Promise<TraderRiskDto | null> {
    const trader = await this.traderMetricsRepository.findTraderByAddress(traderAddress);
    return trader === null ? null : trader.toRiskDto();
  }
}
