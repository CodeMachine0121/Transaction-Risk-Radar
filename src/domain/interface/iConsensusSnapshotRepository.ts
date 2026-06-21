import type { CoinCoverageRecord } from '../vo/coinCoverageRecord';
import type { ConsensusSnapshotPoint } from '../vo/consensusSnapshotPoint';
import type { ConsensusSnapshotRecord } from '../vo/consensusSnapshotRecord';

/** 共識時序快照的持久化：留存每輪共識、供離線回測讀取序列。 */
export interface IConsensusSnapshotRepository {
  /** 寫入一輪共識的各 coin 快照（capturedAt 由實作設定）。 */
  saveConsensusSnapshots(records: ConsensusSnapshotRecord[]): Promise<void>;
  /** 載入某 coin 自 `since`（ms epoch）起、依時間遞增的共識時序，供回測。 */
  loadConsensusSeries(coin: string, since: number): Promise<ConsensusSnapshotPoint[]>;
  /** 列出有共識紀錄的不重複 coin（排序由呼叫端決定）。 */
  listRecordedCoins(): Promise<string[]>;
  /** 每 coin 的覆蓋度彙總（筆數、最早／最晚 capturedAt）；排序由呼叫端決定。 */
  listCoinCoverage(): Promise<CoinCoverageRecord[]>;
}
