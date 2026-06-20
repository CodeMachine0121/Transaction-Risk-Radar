import type { PricePoint } from '../vo/pricePoint';

/** 取得某 coin 的價格時序（回測對照之後價格）。vendor 形狀在 infra 邊際正規化。 */
export interface IPriceProxy {
  /** 自 `since`（ms epoch）起、依時間遞增的價格序列。 */
  fetchPriceSeries(coin: string, since: number): Promise<PricePoint[]>;
}
