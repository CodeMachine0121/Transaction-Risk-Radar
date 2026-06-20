import type { EntrySignalReportDto } from '../domain/dto/entrySignalReportDto';
import type { EntrySignalService } from '../domain/service/entrySignalService';
import type { SafeCohortConsensusService } from '../domain/service/safeCohortConsensusService';
import type { SafeCohortConsensusQuery } from '../domain/vo/safeCohortConsensusQuery';

/** 用例（B1）：取安全群共識後，委派 EntrySignalService 導出進場訊號。 */
export class EntrySignalApplication {
  private readonly safeCohortConsensusService: SafeCohortConsensusService;
  private readonly entrySignalService: EntrySignalService;

  constructor(
    safeCohortConsensusService: SafeCohortConsensusService,
    entrySignalService: EntrySignalService,
  ) {
    this.safeCohortConsensusService = safeCohortConsensusService;
    this.entrySignalService = entrySignalService;
  }

  async evaluateEntrySignals(query: SafeCohortConsensusQuery): Promise<EntrySignalReportDto> {
    const consensus = await this.safeCohortConsensusService.listConsensus(query);
    return this.entrySignalService.evaluate(consensus);
  }
}
