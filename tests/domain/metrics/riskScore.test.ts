import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  computeRiskScore,
  DEFAULT_RISK_SCORE_WEIGHTS,
  type RiskScoreComponents,
} from '@/domain/metrics/riskScore';

const components = (values: {
  mae: number;
  averagingDown: number;
  trap: number;
  downside: number;
  leverage: number;
}): RiskScoreComponents => ({
  normalizedMaxAdverseExcursion: new Decimal(values.mae),
  averagingDownRatio: new Decimal(values.averagingDown),
  trapSignal: new Decimal(values.trap),
  normalizedReturnDownsideDeviation: new Decimal(values.downside),
  normalizedAverageLeverage: new Decimal(values.leverage),
});

describe('DEFAULT_RISK_SCORE_WEIGHTS', () => {
  it('sums to 1', () => {
    const total = Object.values(DEFAULT_RISK_SCORE_WEIGHTS).reduce(
      (sum, weight) => sum.plus(weight),
      new Decimal(0),
    );
    expect(total.toString()).toBe('1');
  });
});

describe('computeRiskScore', () => {
  it('returns 100 when every danger factor is maxed out', () => {
    const result = computeRiskScore(
      components({ mae: 1, averagingDown: 1, trap: 1, downside: 1, leverage: 1 }),
    );
    expect(result.toString()).toBe('100');
  });

  it('returns 0 when every danger factor is 0', () => {
    const result = computeRiskScore(
      components({ mae: 0, averagingDown: 0, trap: 0, downside: 0, leverage: 0 }),
    );
    expect(result.toString()).toBe('0');
  });

  it('computes the weighted sum (x100) with default weights', () => {
    // 0.5*0.30 + 0.4*0.25 + 0.2*0.15 + 0.6*0.15 + 0.8*0.15 = 0.49 → 49
    const result = computeRiskScore(
      components({ mae: 0.5, averagingDown: 0.4, trap: 0.2, downside: 0.6, leverage: 0.8 }),
    );
    expect(result.toString()).toBe('49');
  });

  it('honours custom weights', () => {
    const result = computeRiskScore(
      components({ mae: 0.5, averagingDown: 0, trap: 0, downside: 0, leverage: 0 }),
      {
        maxAdverseExcursion: new Decimal(1),
        averagingDown: new Decimal(0),
        trapSignal: new Decimal(0),
        returnDownsideDeviation: new Decimal(0),
        leverage: new Decimal(0),
      },
    );
    expect(result.toString()).toBe('50');
  });
});
