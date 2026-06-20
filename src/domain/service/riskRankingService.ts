import type Decimal from 'decimal.js';
import type { TraderRiskDto } from '../dto/traderRiskDto';
import type { Trader } from '../entity/trader';
import type { ITraderRepository } from '../interface/iTraderRepository';
import type { RiskRankingQuery } from '../vo/riskRankingQuery';

const DEFAULT_LIMIT = 50;

/** Domain Service：風險導向排行（US-01）。排序/分頁為跨多個 Trader 的運算，故置於 service。 */
export class RiskRankingService {
  private readonly traderRepository: ITraderRepository;

  constructor(traderRepository: ITraderRepository) {
    this.traderRepository = traderRepository;
  }

  async listRanking(query: RiskRankingQuery): Promise<TraderRiskDto[]> {
    const direction = query.direction ?? 'ascending';
    const offset = query.offset ?? 0;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const traders = await this.traderRepository.findRankableTraders(query.provider);
    const scored = traders
      .map((trader) => ({ trader, score: trader.riskScore() }))
      .filter(
        (entry): entry is { trader: Trader; score: Decimal } =>
          entry.score !== null && !entry.trader.isInsufficientData(),
      );

    const sorted = [...scored].sort((left, right) =>
      direction === 'ascending'
        ? left.score.comparedTo(right.score)
        : right.score.comparedTo(left.score),
    );

    return sorted.slice(offset, offset + limit).map((entry) => entry.trader.toRiskDto());
  }
}
