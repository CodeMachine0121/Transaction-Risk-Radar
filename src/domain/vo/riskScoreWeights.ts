import Decimal from 'decimal.js';

/** riskScore 各危險因子的權重，總和應為 1。 */
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
