import type Decimal from 'decimal.js';

/** 倉位生命週期中的一個動作（open/add/reduce/close）。 */
export type PositionLifecycleEvent = {
  type: 'open' | 'add' | 'reduce' | 'close';
  price: Decimal;
  size: Decimal;
};
