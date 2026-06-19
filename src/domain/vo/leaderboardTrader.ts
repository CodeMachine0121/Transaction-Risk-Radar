import type Decimal from 'decimal.js';

/** Leaderboard 上的一位交易員（已正規化）。 */
export type LeaderboardTrader = {
  address: string;
  accountValue: Decimal;
};
