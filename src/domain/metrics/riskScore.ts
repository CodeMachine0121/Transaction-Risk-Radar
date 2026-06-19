import Decimal from 'decimal.js';

/** 已正規化（皆為 0~1）的五項危險因子。 */
export type RiskScoreComponents = {
  normalizedMaxAdverseExcursion: Decimal;
  averagingDownRatio: Decimal;
  trapSignal: Decimal;
  normalizedReturnDownsideDeviation: Decimal;
  normalizedAverageLeverage: Decimal;
};

/** 各危險因子的權重，總和應為 1。 */
export type RiskScoreWeights = {
  maxAdverseExcursion: Decimal;
  averagingDown: Decimal;
  trapSignal: Decimal;
  returnDownsideDeviation: Decimal;
  leverage: Decimal;
};

/** PRD 第 4 章定義的預設權重（總和 = 1）。 */
export const DEFAULT_RISK_SCORE_WEIGHTS: RiskScoreWeights = {
  maxAdverseExcursion: new Decimal('0.30'),
  averagingDown: new Decimal('0.25'),
  trapSignal: new Decimal('0.15'),
  returnDownsideDeviation: new Decimal('0.15'),
  leverage: new Decimal('0.15'),
};

const RISK_SCORE_SCALE = new Decimal(100);

/**
 * 風險分數（0~100，越高越危險）：五項危險因子的加權和 ×100。
 * 刻意不獎勵報酬率——衡量的是「拿小本金跟單有多危險」。
 */
export function computeRiskScore(
  components: RiskScoreComponents,
  weights: RiskScoreWeights = DEFAULT_RISK_SCORE_WEIGHTS,
): Decimal {
  const weightedSum = components.normalizedMaxAdverseExcursion
    .times(weights.maxAdverseExcursion)
    .plus(components.averagingDownRatio.times(weights.averagingDown))
    .plus(components.trapSignal.times(weights.trapSignal))
    .plus(components.normalizedReturnDownsideDeviation.times(weights.returnDownsideDeviation))
    .plus(components.normalizedAverageLeverage.times(weights.leverage));
  return weightedSum.times(RISK_SCORE_SCALE);
}
