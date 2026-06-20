import type { Trader } from '../entity/trader';
import type { Provider } from '../vo/provider';
import type { TraderKey } from '../vo/traderKey';

/** Trader entity 的持久化：追蹤名單、彙總指標的讀寫（以 `(provider, address)` 識別）。 */
export interface ITraderRepository {
  /** 以 `(provider, address)` upsert 追蹤名單（idempotent）。 */
  saveTraders(provider: Provider, traderAddresses: string[]): Promise<void>;
  /** 取得所有被追蹤的交易員鍵 `(provider, address)`（供輪詢 / 重算迭代）。 */
  findAllTraderKeys(): Promise<TraderKey[]>;
  /** 取得所有可排行（非 insufficientData）的交易員；可選擇只取某 provider。 */
  findRankableTraders(provider?: Provider): Promise<Trader[]>;
  /** 依 `(provider, address)` 取得單一交易員；不存在回傳 null。 */
  findTrader(provider: Provider, traderAddress: string): Promise<Trader | null>;
  /** 持久化交易員重算後的彙總指標（trader 自帶 provider）。 */
  saveTraderMetrics(trader: Trader): Promise<void>;
}
