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
