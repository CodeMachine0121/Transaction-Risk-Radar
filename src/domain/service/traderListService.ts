import type { TraderRiskDto } from '../dto/traderRiskDto';
import type { ITraderRepository } from '../interface/iTraderRepository';
import type { RiskRankingQuery } from '../vo/riskRankingQuery';

const DEFAULT_LIMIT = 50;

/**
 * Domain Service：列出全部追蹤交易員（US-01，含 insufficientData）。
 * 與 RiskRankingService 的差異：不過濾可排行。排序/分頁為跨多 Trader 運算，故置於 service。
 */
export class TraderListService {
  private readonly traderRepository: ITraderRepository;

  constructor(traderRepository: ITraderRepository) {
    this.traderRepository = traderRepository;
  }

  async listTraders(query: RiskRankingQuery): Promise<TraderRiskDto[]> {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const traders = await this.traderRepository.findAllTraders(query.provider);
    // 可排行者（有 riskScore）依升冪在前；insufficientData（null score）殿後。
    const sorted = [...traders].sort((left, right) => {
      const leftScore = left.riskScore();
      const rightScore = right.riskScore();
      if (leftScore === null && rightScore === null) {
        return 0;
      }
      if (leftScore === null) {
        return 1;
      }
      if (rightScore === null) {
        return -1;
      }
      return leftScore.comparedTo(rightScore);
    });

    return sorted.slice(offset, offset + limit).map((trader) => trader.toRiskDto());
  }
}
