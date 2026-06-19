import type Decimal from 'decimal.js';
import type { TraderRiskSummary } from './traderRiskSummary';

export type RiskRankingDirection = 'ascending' | 'descending';

export type RiskRankingQuery = {
  direction?: RiskRankingDirection;
  offset?: number;
  limit?: number;
};

const DEFAULT_LIMIT = 50;

/**
 * 風險導向排行：依 riskScore 排序並分頁。
 * 預設 ascending（安全在前，找相對可跟的交易員），可切 descending（高危黑名單）。
 * insufficientData（無 riskScore）的交易員不納入排行主體（PRD 第 4 章規則 8）。
 */
export function rankTradersByRiskScore(
  traders: TraderRiskSummary[],
  query: RiskRankingQuery = {},
): TraderRiskSummary[] {
  const direction = query.direction ?? 'ascending';
  const offset = query.offset ?? 0;
  const limit = query.limit ?? DEFAULT_LIMIT;

  const rankable = traders.filter(
    (trader): trader is TraderRiskSummary & { riskScore: Decimal } =>
      !trader.insufficientData && trader.riskScore !== null,
  );

  const sorted = [...rankable].sort((left, right) => {
    const comparison = left.riskScore.comparedTo(right.riskScore);
    return direction === 'ascending' ? comparison : -comparison;
  });

  return sorted.slice(offset, offset + limit);
}
