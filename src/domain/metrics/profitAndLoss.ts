import Decimal from 'decimal.js';

/**
 * 已實現盈虧加總：時間窗（近 90 天）內所有已平倉位的 realized PnL 總和。
 * @param realizedProfitAndLosses 各已平倉位的已實現盈虧
 */
export function computeRealizedProfitAndLoss(realizedProfitAndLosses: Decimal[]): Decimal {
  return realizedProfitAndLosses.reduce((total, current) => total.plus(current), new Decimal(0));
}

/**
 * 勝率：已平倉位中報酬為正者的比例（報酬為 0 不算勝）。
 * 注意：高勝率不等於安全，須與 MAE 一起看（見 trapSignal）。
 * @param realizedReturnPercentagesPerPosition 各已平倉位的已實現報酬率
 */
export function computeWinRate(realizedReturnPercentagesPerPosition: Decimal[]): Decimal {
  if (realizedReturnPercentagesPerPosition.length === 0) {
    throw new RangeError('at least one closed position is required');
  }
  const winningCount = realizedReturnPercentagesPerPosition.filter((returnPercentage) =>
    returnPercentage.greaterThan(0),
  ).length;
  return new Decimal(winningCount).dividedBy(realizedReturnPercentagesPerPosition.length);
}
