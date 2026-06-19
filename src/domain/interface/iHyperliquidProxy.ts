import type { LeaderboardTrader } from '../market/leaderboardTrader';
import type { OpenPosition } from '../market/openPosition';
import type { TraderFill } from '../market/traderFill';

/**
 * 封裝 Hyperliquid 公開讀取 API（leaderboard / clearinghouseState / userFillsByTime）。
 * 由 infrastructure 的具體 proxy 實作（DIP）；domain 只認識此契約與正規化後的型別。
 */
export interface IHyperliquidProxy {
  fetchLeaderboard(): Promise<LeaderboardTrader[]>;
  fetchOpenPositions(address: string): Promise<OpenPosition[]>;
  fetchUserFills(address: string, startTime: number): Promise<TraderFill[]>;
}
