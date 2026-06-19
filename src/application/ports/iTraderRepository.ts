/** Repository port（寫入端）：維護被追蹤的交易員清單。 */
export interface ITraderRepository {
  /** 以地址 upsert 追蹤名單（idempotent）。 */
  saveTraders(traderAddresses: string[]): Promise<void>;
}
