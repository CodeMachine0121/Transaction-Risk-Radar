import type Decimal from 'decimal.js';

/** Leaderboard 上的一位交易員（已正規化）。 */
export interface LeaderboardTrader {
  address: string;
  accountValue: Decimal;
}

/** 一筆成交（已正規化；金額/數量皆為 Decimal）。 */
export interface TraderFill {
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
}

/** 一個開倉的當前快照（已正規化）。 */
export interface OpenPosition {
  coin: string;
  /** 帶號持倉量：正=多、負=空。 */
  signedSize: Decimal;
  entryPrice: Decimal;
  leverage: Decimal;
  unrealizedProfitAndLoss: Decimal;
  positionValue: Decimal;
  marginUsed: Decimal;
}

/**
 * Proxy port：封裝 Hyperliquid 公開讀取 API（leaderboard / clearinghouseState / userFillsByTime）。
 * application 只依賴此介面；HTTP 細節由 infrastructure 的具體 Proxy 實作（DIP）。
 */
export interface HyperliquidProxy {
  fetchLeaderboard(): Promise<LeaderboardTrader[]>;
  fetchOpenPositions(address: string): Promise<OpenPosition[]>;
  fetchUserFills(address: string, startTime: number): Promise<TraderFill[]>;
}
