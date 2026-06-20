import type { Trader } from '../entity/trader';

/** Trader entity 的持久化：追蹤名單、彙總指標的讀寫。 */
export interface ITraderRepository {
  /** 以地址 upsert 追蹤名單（idempotent）。 */
  saveTraders(traderAddresses: string[]): Promise<void>;
  /** 取得所有被追蹤的交易員地址（供輪詢 / 重算迭代）。 */
  findAllAddresses(): Promise<string[]>;
  /** 取得所有可排行（非 insufficientData）的交易員。 */
  findRankableTraders(): Promise<Trader[]>;
  /** 依地址取得單一交易員；不存在回傳 null。 */
  findTraderByAddress(traderAddress: string): Promise<Trader | null>;
  /** 持久化交易員重算後的彙總指標。 */
  saveTraderMetrics(trader: Trader): Promise<void>;
}
