import type Decimal from 'decimal.js';

/** 單一價格時序點（已正規化）。回測對照之後價格用。 */
export type PricePoint = {
  /** ms epoch。 */
  timestamp: number;
  price: Decimal;
};
