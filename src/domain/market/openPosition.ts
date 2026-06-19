import type Decimal from 'decimal.js';

/** 一個開倉的當前快照（已正規化）。 */
export type OpenPosition = {
  coin: string;
  /** 帶號持倉量：正=多、負=空。 */
  signedSize: Decimal;
  entryPrice: Decimal;
  leverage: Decimal;
  unrealizedProfitAndLoss: Decimal;
  positionValue: Decimal;
  marginUsed: Decimal;
};
