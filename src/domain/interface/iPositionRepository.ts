import type { Position } from '../entity/position';
import type { PositionSnapshotRecord } from '../vo/positionSnapshotRecord';
import type { TraderFill } from '../vo/traderFill';

/** Position entity 的持久化：寫入原始成交與快照、讀取時重建倉位。 */
export interface IPositionRepository {
  /** 寫入成交；以 fill 的 tradeId 去重 (idempotency)。 */
  saveFills(traderAddress: string, fills: TraderFill[]): Promise<void>;
  /** 寫入本輪輪詢的開倉快照。 */
  saveSnapshots(traderAddress: string, snapshots: PositionSnapshotRecord[]): Promise<void>;
  /** 載入交易員倉位（由原始成交重建並掛回 snapshot）。 */
  findPositions(traderAddress: string): Promise<Position[]>;
}
