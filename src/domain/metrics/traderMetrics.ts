import Decimal from 'decimal.js';
import { computeAveragingDownRatio, detectAveragingDown } from './averagingDown';
import type { PositionLifecycleEvent, PositionSide } from './averagingDown';
import {
  computeMaxAdverseExcursionPercentile90,
  computeMaxAdverseExcursionPerPosition,
} from './maxAdverseExcursion';
import { normalize } from './normalize';
import { computeRealizedProfitAndLoss, computeWinRate } from './profitAndLoss';
import { computeReturnDownsideDeviation } from './returnDownsideDeviation';
import { computeRiskScore, DEFAULT_RISK_SCORE_WEIGHTS } from './riskScore';
import type { RiskScoreWeights } from './riskScore';
import { computeTrapSignal } from './trapSignal';

/** 已平倉位的結算資訊（近 90 天時間窗內）。 */
export type ClosedPositionResult = {
  realizedReturnPercentage: Decimal;
  realizedProfitAndLoss: Decimal;
};

/** 一個交易員的單一倉位輸入（已由 repository 整理好）。 */
export type TraderPositionInput = {
  side: PositionSide;
  events: PositionLifecycleEvent[];
  unrealizedProfitAndLossPercentages: Decimal[];
  averageLeverage: Decimal;
  closed: ClosedPositionResult | null;
};

export type TraderMetricsInput = {
  positions: TraderPositionInput[];
  minimumClosedPositions?: number;
};

export type TraderMetricsResult = {
  insufficientData: boolean;
  closedPositionCount: number;
  maxAdverseExcursionPercentile90: Decimal | null;
  averagingDownRatio: Decimal | null;
  winRate: Decimal | null;
  realizedProfitAndLoss: Decimal | null;
  returnDownsideDeviation: Decimal | null;
  averageLeverage: Decimal | null;
  trapSignal: Decimal | null;
  riskScore: Decimal | null;
};

// PRD 第 4 章的正規化上限與樣本門檻。
const MAX_ADVERSE_EXCURSION_CAP = new Decimal(50);
const AVERAGE_LEVERAGE_CAP = new Decimal(20);
const RETURN_DOWNSIDE_DEVIATION_CAP = new Decimal(30);
const DEFAULT_MINIMUM_CLOSED_POSITIONS = 20;

/**
 * Domain Service：把九個純指標函式組裝成一位交易員的完整指標集與 riskScore。
 * 已平倉位數低於門檻時標記 insufficientData 並不給 riskScore（避免少量幸運單騙過系統）。
 */
export function computeTraderMetrics(
  input: TraderMetricsInput,
  weights: RiskScoreWeights = DEFAULT_RISK_SCORE_WEIGHTS,
): TraderMetricsResult {
  const minimumClosedPositions = input.minimumClosedPositions ?? DEFAULT_MINIMUM_CLOSED_POSITIONS;
  const closedPositions = input.positions.filter(
    (position): position is TraderPositionInput & { closed: ClosedPositionResult } =>
      position.closed !== null,
  );
  const closedPositionCount = closedPositions.length;

  if (closedPositionCount < minimumClosedPositions) {
    return {
      insufficientData: true,
      closedPositionCount,
      maxAdverseExcursionPercentile90: null,
      averagingDownRatio: null,
      winRate: null,
      realizedProfitAndLoss: null,
      returnDownsideDeviation: null,
      averageLeverage: null,
      trapSignal: null,
      riskScore: null,
    };
  }

  const perPositionMaxAdverseExcursions = input.positions.map((position) =>
    computeMaxAdverseExcursionPerPosition(position.unrealizedProfitAndLossPercentages),
  );
  const maxAdverseExcursionPercentile90 = computeMaxAdverseExcursionPercentile90(
    perPositionMaxAdverseExcursions,
  );
  const averagingDownRatio = computeAveragingDownRatio(
    input.positions.map((position) => detectAveragingDown(position.side, position.events)),
  );

  const closedReturns = closedPositions.map((position) => position.closed.realizedReturnPercentage);
  const winRate = computeWinRate(closedReturns);
  const realizedProfitAndLoss = computeRealizedProfitAndLoss(
    closedPositions.map((position) => position.closed.realizedProfitAndLoss),
  );
  const returnDownsideDeviation = computeReturnDownsideDeviation(closedReturns);

  const averageLeverage = input.positions
    .reduce((total, position) => total.plus(position.averageLeverage), new Decimal(0))
    .dividedBy(input.positions.length);

  const normalizedMaxAdverseExcursion = normalize(
    maxAdverseExcursionPercentile90,
    MAX_ADVERSE_EXCURSION_CAP,
  );
  const trapSignal = computeTrapSignal(winRate, normalizedMaxAdverseExcursion);
  const riskScore = computeRiskScore(
    {
      normalizedMaxAdverseExcursion,
      averagingDownRatio,
      trapSignal,
      normalizedReturnDownsideDeviation: normalize(
        returnDownsideDeviation,
        RETURN_DOWNSIDE_DEVIATION_CAP,
      ),
      normalizedAverageLeverage: normalize(averageLeverage, AVERAGE_LEVERAGE_CAP),
    },
    weights,
  );

  return {
    insufficientData: false,
    closedPositionCount,
    maxAdverseExcursionPercentile90,
    averagingDownRatio,
    winRate,
    realizedProfitAndLoss,
    returnDownsideDeviation,
    averageLeverage,
    trapSignal,
    riskScore,
  };
}
