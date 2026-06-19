import Decimal from 'decimal.js';

/**
 * 計算單一倉位的最大逆向幅度（Max Adverse Excursion）：
 * 該倉位所有浮虧快照中最深的 unrealizedProfitAndLossPercentage（即最小值）。
 * @param unrealizedProfitAndLossPercentages 倉位生命週期內各 snapshot 的浮動損益百分比
 */
export function computeMaxAdverseExcursionPerPosition(
  unrealizedProfitAndLossPercentages: Decimal[],
): Decimal {
  const [first, ...rest] = unrealizedProfitAndLossPercentages;
  if (first === undefined) {
    throw new RangeError('a position must have at least one snapshot');
  }
  return rest.reduce((deepest, current) => Decimal.min(deepest, current), first);
}

const PERCENTILE_90 = new Decimal('0.9');

/**
 * 計算交易員層級的 MAE 第 90 百分位：各倉位 MAE 取絕對值後排序，
 * 以線性插值 (R-7) 求第 90 百分位。代表「90% 的倉位最深都在此幅度內」，
 * 即跟單所需的回撤緩衝。
 * @param perPositionMaxAdverseExcursions 各倉位的 computeMaxAdverseExcursionPerPosition 結果
 */
export function computeMaxAdverseExcursionPercentile90(
  perPositionMaxAdverseExcursions: Decimal[],
): Decimal {
  if (perPositionMaxAdverseExcursions.length === 0) {
    throw new RangeError('at least one position is required');
  }
  const sortedAbsolute = perPositionMaxAdverseExcursions
    .map((value) => value.abs())
    .sort((left, right) => left.comparedTo(right));

  const lastIndex = sortedAbsolute.length - 1;
  const rank = new Decimal(lastIndex).times(PERCENTILE_90);
  const lowerIndex = rank.floor().toNumber();
  const fraction = rank.minus(lowerIndex);

  const lowerValue = sortedAbsolute[lowerIndex];
  if (lowerValue === undefined) {
    throw new RangeError('percentile rank out of range');
  }
  if (fraction.isZero()) {
    return lowerValue;
  }
  const upperValue = sortedAbsolute[lowerIndex + 1] ?? lowerValue;
  return lowerValue.plus(upperValue.minus(lowerValue).times(fraction));
}
