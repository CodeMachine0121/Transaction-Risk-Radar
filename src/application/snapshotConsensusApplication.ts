import type { SnapshotConsensusService } from '../domain/service/snapshotConsensusService';
import type { SafeCohortConsensusQuery } from '../domain/vo/safeCohortConsensusQuery';

/** 用例（B2-US-04）：委派 SnapshotConsensusService 留存一輪共識時序。背景排程觸發。 */
export class SnapshotConsensusApplication {
  private readonly snapshotConsensusService: SnapshotConsensusService;

  constructor(snapshotConsensusService: SnapshotConsensusService) {
    this.snapshotConsensusService = snapshotConsensusService;
  }

  snapshot(query: SafeCohortConsensusQuery): Promise<void> {
    return this.snapshotConsensusService.snapshot(query);
  }
}
