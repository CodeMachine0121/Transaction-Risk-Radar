import Decimal from 'decimal.js';

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

/**
 * 將數值正規化到 [0, 1]：clamp(value / cap, 0, 1)。
 * 供 riskScore 各危險因子（MAE、槓桿、下行標準差）的正規化使用。
 * @param value 欲正規化的（非負）量值
 * @param cap   視為「滿格危險」的上限，必須大於 0
 */
export function normalize(value: Decimal, cap: Decimal): Decimal {
  if (cap.lessThanOrEqualTo(ZERO)) {
    throw new RangeError('cap must be greater than zero');
  }
  const ratio = value.dividedBy(cap);
  if (ratio.lessThan(ZERO)) {
    return ZERO;
  }
  if (ratio.greaterThan(ONE)) {
    return ONE;
  }
  return ratio;
}
