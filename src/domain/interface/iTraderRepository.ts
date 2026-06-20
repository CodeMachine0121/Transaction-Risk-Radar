/** 維護被追蹤的交易員清單。 */
export interface ITraderRepository {
  /** 以地址 upsert 追蹤名單（idempotent）。 */
  saveTraders(traderAddresses: string[]): Promise<void>;
  /** 取得目前所有被追蹤的交易員地址（供輪詢 / 重算迭代）。 */
  findAllAddresses(): Promise<string[]>;
}
