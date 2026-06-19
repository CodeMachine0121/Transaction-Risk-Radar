import type Decimal from 'decimal.js';

/** 一筆要寫入的浮虧快照（capturedAt 由 repository 於寫入時設定）。 */
export type PositionSnapshotRecord = {
  coin: string;
  markPrice: Decimal;
  unrealizedProfitAndLossPercentage: Decimal;
  margin: Decimal;
  leverage: Decimal;
};
