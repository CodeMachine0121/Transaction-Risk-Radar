import type Decimal from 'decimal.js';

/** 一筆要寫入的浮虧快照（capturedAt 由 repository 於寫入時設定）。 */
export type PositionSnapshotRecord = {
  coin: string;
  /** 帶號持倉量：正=多、負=空。供安全群共識判定當前持倉方向。 */
  signedSize: Decimal;
  markPrice: Decimal;
  unrealizedProfitAndLossPercentage: Decimal;
  margin: Decimal;
  leverage: Decimal;
};
