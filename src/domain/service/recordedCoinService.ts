import type { CoinCoverageReportDto } from '../dto/coinCoverageReportDto';
import type { RecordedCoinsDto } from '../dto/recordedCoinsDto';
import type { IConsensusSnapshotRepository } from '../interface/iConsensusSnapshotRepository';

/** Domain Service：以共識快照彙總已記錄標的——清單與覆蓋度，排序後轉 DTO 回傳。 */
export class RecordedCoinService {
  private readonly consensusSnapshotRepository: IConsensusSnapshotRepository;

  constructor(consensusSnapshotRepository: IConsensusSnapshotRepository) {
    this.consensusSnapshotRepository = consensusSnapshotRepository;
  }

  async listRecordedCoins(): Promise<RecordedCoinsDto> {
    const coins = await this.consensusSnapshotRepository.listRecordedCoins();
    return { coins: [...coins].sort((left, right) => left.localeCompare(right)) };
  }

  async listCoinCoverage(): Promise<CoinCoverageReportDto> {
    const records = await this.consensusSnapshotRepository.listCoinCoverage();
    const coins = records
      .map((record) => ({
        ...record,
        spanMilliseconds: record.latestCapturedAt - record.earliestCapturedAt,
      }))
      .sort(
        (left, right) =>
          right.spanMilliseconds - left.spanMilliseconds || left.coin.localeCompare(right.coin),
      );
    return { coins };
  }
}
