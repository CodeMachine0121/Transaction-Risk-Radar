import Decimal from 'decimal.js';
import type { IConsensusSnapshotRepository } from '../interface/iConsensusSnapshotRepository';
import type { ConsensusSnapshotRecord } from '../vo/consensusSnapshotRecord';
import type { SafeCohortConsensusQuery } from '../vo/safeCohortConsensusQuery';
import type { SafeCohortConsensusService } from './safeCohortConsensusService';

/**
 * Domain Service（B2-US-04）：取一輪安全群共識並留存為時序快照，供離線回測。
 * 由背景排程觸發（對齊 recompute）。
 */
export class SnapshotConsensusService {
  private readonly safeCohortConsensusService: SafeCohortConsensusService;
  private readonly consensusSnapshotRepository: IConsensusSnapshotRepository;

  constructor(
    safeCohortConsensusService: SafeCohortConsensusService,
    consensusSnapshotRepository: IConsensusSnapshotRepository,
  ) {
    this.safeCohortConsensusService = safeCohortConsensusService;
    this.consensusSnapshotRepository = consensusSnapshotRepository;
  }

  async snapshot(query: SafeCohortConsensusQuery): Promise<void> {
    const consensus = await this.safeCohortConsensusService.listConsensus(query);
    const records: ConsensusSnapshotRecord[] = consensus.coins.map((coin) => ({
      coin: coin.coin,
      netDirectionBias: new Decimal(coin.netDirectionBias),
      convictionWeightedDirectionBias: new Decimal(coin.convictionWeightedDirectionBias),
      consensusStrength: new Decimal(coin.consensusStrength),
      maxConvictionShare: new Decimal(coin.maxConvictionShare),
      participantCount: coin.participantCount,
    }));
    await this.consensusSnapshotRepository.saveConsensusSnapshots(records);
  }
}
