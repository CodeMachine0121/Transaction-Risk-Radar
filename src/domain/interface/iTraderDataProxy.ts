import type { LeaderboardTrader } from '../vo/leaderboardTrader';
import type { OpenPosition } from '../vo/openPosition';
import type { Provider } from '../vo/provider';
import type { TraderActivity } from '../vo/traderActivity';

/**
 * Provider-agnostic 的交易員資料來源契約。每個場所（Hyperliquid / OKX…）一個實作，
 * 在 infrastructure 邊際正規化成共用 domain VO；domain 不認識任何 vendor 形狀。
 */
export interface ITraderDataProxy {
  /** 此來源場所（供 (provider, address) 標記）。 */
  readonly provider: Provider;
  /** 追蹤名單發現（Hyperliquid leaderboard / OKX public-lead-traders）。 */
  fetchTraderList(): Promise<LeaderboardTrader[]>;
  /** 自 since 起的倉位變動腿（Hyperliquid fills / OKX sub-positions）。 */
  fetchPositionActivities(address: string, since: number): Promise<TraderActivity[]>;
  /** 當前開倉（供 MAE / 槓桿快照）。 */
  fetchOpenPositions(address: string): Promise<OpenPosition[]>;
}
