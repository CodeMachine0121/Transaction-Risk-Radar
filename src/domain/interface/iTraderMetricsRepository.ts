import type { Trader } from '../entity/trader';

/** 讀取已計算好的交易員（由 DB 既有 trader_metrics hydrate 成 Trader entity）。 */
export interface ITraderMetricsRepository {
  /** 取得所有可排行（非 insufficientData）的交易員。 */
  findRankableTraders(): Promise<Trader[]>;
  /** 依地址取得單一交易員；不存在回傳 null。 */
  findTraderByAddress(traderAddress: string): Promise<Trader | null>;
}
