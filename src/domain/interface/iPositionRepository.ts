import type { PositionSnapshotRecord } from '../vo/positionSnapshotRecord';
import type { TraderFill } from '../vo/traderFill';

/** 持久化成交（轉成 events）與浮虧快照。 */
export interface IPositionRepository {
  /** 寫入成交；以 fill 的 tradeId 去重 (idempotency)。 */
  saveFills(traderAddress: string, fills: TraderFill[]): Promise<void>;
  /** 寫入本輪輪詢的開倉快照。 */
  saveSnapshots(traderAddress: string, snapshots: PositionSnapshotRecord[]): Promise<void>;
}
