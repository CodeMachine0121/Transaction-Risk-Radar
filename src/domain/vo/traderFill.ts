import type Decimal from 'decimal.js';

/** 一筆成交（已正規化；金額/數量皆為 Decimal）。 */
export type TraderFill = {
  coin: string;
  price: Decimal;
  size: Decimal;
  side: 'buy' | 'sell';
  timestamp: number;
  /** 本筆成交前的帶號持倉量。 */
  startPosition: Decimal;
  /** Hyperliquid 的語義方向，如 "Open Long" / "Close Short"。 */
  direction: string;
  closedProfitAndLoss: Decimal;
  /** 成交唯一 id，作為去重鍵 (idempotency)。 */
  tradeId: number;
  hash: string;
};
