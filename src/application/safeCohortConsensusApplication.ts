import type { SafeCohortConsensusDto } from '../domain/dto/safeCohortConsensusDto';
import type { SafeCohortConsensusService } from '../domain/service/safeCohortConsensusService';
import type { SafeCohortConsensusQuery } from '../domain/vo/safeCohortConsensusQuery';

/** 用例（US-01/US-02）：委派 SafeCohortConsensusService 取得安全群持倉共識。 */
export class SafeCohortConsensusApplication {
  private readonly safeCohortConsensusService: SafeCohortConsensusService;

  constructor(safeCohortConsensusService: SafeCohortConsensusService) {
    this.safeCohortConsensusService = safeCohortConsensusService;
  }

  listConsensus(query: SafeCohortConsensusQuery): Promise<SafeCohortConsensusDto> {
    return this.safeCohortConsensusService.listConsensus(query);
  }

  coinConsensus(
    coin: string,
    query: SafeCohortConsensusQuery,
  ): Promise<SafeCohortConsensusDto | null> {
    return this.safeCohortConsensusService.coinConsensus(coin, query);
  }
}
