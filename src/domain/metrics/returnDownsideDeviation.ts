import Decimal from 'decimal.js';

const ZERO = new Decimal(0);

/**
 * 下行標準差（downside deviation）：僅取負報酬子集計算的母體標準差。
 * 衡量「賠的時候穩不穩、會不會突然爆一筆」；只看下行、不懲罰上行波動。
 * 無負報酬（或無資料）時回傳 0。
 * @param realizedReturnPercentagesPerPosition 近 90 天各已平倉位的報酬率
 */
export function computeReturnDownsideDeviation(
  realizedReturnPercentagesPerPosition: Decimal[],
): Decimal {
  const negativeReturns = realizedReturnPercentagesPerPosition.filter((returnPercentage) =>
    returnPercentage.lessThan(ZERO),
  );
  if (negativeReturns.length === 0) {
    return ZERO;
  }

  const count = new Decimal(negativeReturns.length);
  const mean = negativeReturns
    .reduce((total, current) => total.plus(current), ZERO)
    .dividedBy(count);
  const sumSquaredDeviations = negativeReturns.reduce(
    (total, current) => total.plus(current.minus(mean).pow(2)),
    ZERO,
  );
  return sumSquaredDeviations.dividedBy(count).sqrt();
}
