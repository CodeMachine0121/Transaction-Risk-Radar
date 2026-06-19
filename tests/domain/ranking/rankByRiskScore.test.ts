import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { rankTradersByRiskScore } from '@/domain/ranking/rankByRiskScore';
import type { TraderRiskSummary } from '@/domain/ranking/traderRiskSummary';

const summary = (traderAddress: string, riskScore: number | null): TraderRiskSummary => ({
  traderAddress,
  insufficientData: riskScore === null,
  riskScore: riskScore === null ? null : new Decimal(riskScore),
  maxAdverseExcursionPercentile90: null,
  averagingDownRatio: null,
  winRate: null,
  realizedProfitAndLoss: null,
  returnDownsideDeviation: null,
  averageLeverage: null,
  trapSignal: null,
  closedPositionCount: riskScore === null ? 0 : 25,
});

const addresses = (traders: TraderRiskSummary[]): string[] =>
  traders.map((trader) => trader.traderAddress);

describe('rankTradersByRiskScore', () => {
  it('ranks by ascending risk score (safest first) by default', () => {
    const ranked = rankTradersByRiskScore([summary('A', 70), summary('B', 30), summary('C', 50)]);
    expect(addresses(ranked)).toEqual(['B', 'C', 'A']);
  });

  it('ranks by descending risk score (most dangerous first) when requested', () => {
    const ranked = rankTradersByRiskScore([summary('A', 70), summary('B', 30), summary('C', 50)], {
      direction: 'descending',
    });
    expect(addresses(ranked)).toEqual(['A', 'C', 'B']);
  });

  it('excludes traders flagged as insufficient data', () => {
    const ranked = rankTradersByRiskScore([summary('A', 70), summary('D', null), summary('B', 30)]);
    expect(addresses(ranked)).toEqual(['B', 'A']);
  });

  it('applies offset and limit pagination', () => {
    const ranked = rankTradersByRiskScore(
      [summary('A', 70), summary('B', 30), summary('C', 50)],
      { offset: 1, limit: 1 },
    );
    expect(addresses(ranked)).toEqual(['C']);
  });
});
