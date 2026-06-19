import type Decimal from 'decimal.js';

/** 倉位某一時點的浮虧 / 槓桿快照（由 poll clearinghouseState 取得）。 */
export type PositionSnapshot = {
  unrealizedProfitAndLossPercentage: Decimal;
  leverage: Decimal;
};
