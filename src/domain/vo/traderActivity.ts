import type Decimal from 'decimal.js';

/**
 * Provider-agnostic 的「倉位變動腿（leg）」：各來源正規化後的共同單位，
 * 也是 `Position.reconstruct` 的輸入。Hyperliquid 由逐筆 fill 映射、OKX 由 sub-position 映射。
 */
export type TraderActivity = {
  coin: string;
  price: Decimal;
  /** 帶號變動量（增多/buy 為正、減多/sell 為負）。 */
  signedSize: Decimal;
  /** 此腿之前的帶號持倉量（seed 重建時的 running size；對應 Hyperliquid 的 startPosition）。 */
  signedSizeBefore: Decimal;
  /** 此腿已實現盈虧（開腿為 0）。 */
  realizedProfitAndLoss: Decimal;
  /** 發生時間（ms epoch），重建排序鍵。 */
  occurredAt: number;
  /** 去重鍵（Hyperliquid tradeId、OKX subPosId+open/close）。 */
  sourceReference: string;
};
