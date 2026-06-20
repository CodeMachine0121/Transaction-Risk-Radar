import type Decimal from 'decimal.js';

/**
 * 安全群某交易員此刻於某 coin 的當前持倉（由 repository 取「最新且在新鮮度窗內」的快照產出）。
 * 僅用 `signedSize` 的符號判定方向（多/空），不用其量值。
 */
export type CurrentOpenPosition = {
  traderAddress: string;
  coin: string;
  /** 帶號持倉量：正=多、負=空。 */
  signedSize: Decimal;
  leverage: Decimal;
  /** 快照時刻（ms epoch）。 */
  capturedAt: number;
};
