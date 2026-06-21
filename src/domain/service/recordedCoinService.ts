import type { RecordedCoinsDto } from '../dto/recordedCoinsDto';
import type { IConsensusSnapshotRepository } from '../interface/iConsensusSnapshotRepository';

/** Domain Service：取有共識紀錄的不重複 coin，排序後轉 DTO 回傳。 */
export class RecordedCoinService {
  private readonly consensusSnapshotRepository: IConsensusSnapshotRepository;

  constructor(consensusSnapshotRepository: IConsensusSnapshotRepository) {
    this.consensusSnapshotRepository = consensusSnapshotRepository;
  }

  async listRecordedCoins(): Promise<RecordedCoinsDto> {
    const coins = await this.consensusSnapshotRepository.listRecordedCoins();
    return { coins: [...coins].sort((left, right) => left.localeCompare(right)) };
  }
}
