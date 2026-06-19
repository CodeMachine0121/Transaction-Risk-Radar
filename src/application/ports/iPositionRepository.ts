import type Decimal from 'decimal.js';
import type { ITraderFill } from './iHyperliquidProxy';

/** 一筆要寫入的浮虧快照（capturedAt 由 repository 於寫入時設定）。 */
export interface IPositionSnapshotRecord {
  coin: string;
  markPrice: Decimal;
  unrealizedProfitAndLossPercentage: Decimal;
  margin: Decimal;
  leverage: Decimal;
}

/** Repository port（寫入端）：持久化成交（轉成 events）與浮虧快照。 */
export interface IPositionRepository {
  /** 寫入成交；以 fill 的 tradeId 去重 (idempotency)。 */
  saveFills(traderAddress: string, fills: ITraderFill[]): Promise<void>;
  /** 寫入本輪輪詢的開倉快照。 */
  saveSnapshots(traderAddress: string, snapshots: IPositionSnapshotRecord[]): Promise<void>;
}
