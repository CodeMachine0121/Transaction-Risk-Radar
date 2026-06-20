import type { Position } from '../entity/position';
import type { PositionSnapshotRecord } from '../vo/positionSnapshotRecord';
import type { TraderActivity } from '../vo/traderActivity';

/** Position entity 的持久化：寫入倉位變動腿與快照、讀取時重建倉位。 */
export interface IPositionRepository {
  /** 寫入倉位變動腿；以 `sourceReference` 去重 (idempotency)。 */
  saveActivities(traderAddress: string, activities: TraderActivity[]): Promise<void>;
  /** 寫入本輪輪詢的開倉快照。 */
  saveSnapshots(traderAddress: string, snapshots: PositionSnapshotRecord[]): Promise<void>;
  /** 載入交易員倉位（由變動腿重建並掛回 snapshot）。 */
  findPositions(traderAddress: string): Promise<Position[]>;
  /** 該交易員已落庫變動腿的最新時間（ms epoch）；無則回傳 null。供 high-watermark 增量抓取。 */
  latestActivityTimestamp(traderAddress: string): Promise<number | null>;
}
