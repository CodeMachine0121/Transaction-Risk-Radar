import type Decimal from 'decimal.js';

/** Leaderboard 上的一位交易員（已正規化）。帳戶彙總僅部分來源提供（OKX 有、Hyperliquid 無）。 */
export type LeaderboardTrader = {
  address: string;
  accountValue: Decimal;
  /** 勝率（0..1）；供帳戶級 fallback。 */
  winRatio?: Decimal;
  /** 每期報酬序列（百分比，依時間遞增）；供帳戶級 fallback。 */
  accountReturnSeries?: Decimal[];
};
