import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { HorizonEvaluation } from '@/domain/entity/horizonEvaluation';
import type { BacktestAdequacyThresholds } from '@/domain/vo/backtestAdequacyThresholds';

const thresholds: BacktestAdequacyThresholds = {
  smokeTestMinimum: 2,
  trustworthyMinimum: 4,
  adequateSpanMilliseconds: 1000,
  participationFloor: 5,
};

describe('HorizonEvaluation', () => {
  it('computes hit rate and aligned average forward return', () => {
    const evaluation = new HorizonEvaluation(10, thresholds);
    evaluation.add(0, true, 10, new Decimal('0.1')); // long, +10% → hit
    evaluation.add(100, true, 10, new Decimal('-0.1')); // long, -10% → miss

    const dto = evaluation.toDto();

    expect(dto.sampleCount).toBe(2);
    expect(dto.signalHitRate).toBe('0.5');
    expect(Number(dto.averageForwardReturn)).toBeCloseTo(0, 6);
  });

  it('counts independent samples from non-overlapping windows only', () => {
    const evaluation = new HorizonEvaluation(100, thresholds);
    for (const capturedAt of [0, 20, 40, 200, 220]) {
      evaluation.add(capturedAt, true, 10, new Decimal('0.1'));
    }

    const dto = evaluation.toDto();

    expect(dto.sampleCount).toBe(5);
    expect(dto.independentSampleEstimate).toBe(2); // {0, 200}
  });

  it('caps the adequacy level at smoke-test when participation is below the floor', () => {
    const evaluation = new HorizonEvaluation(10, thresholds);
    for (const capturedAt of [0, 10, 20, 1000]) {
      evaluation.add(capturedAt, true, 2, new Decimal('0.1')); // 2 participants < floor 5
    }

    const dto = evaluation.toDto();

    expect(dto.independentSampleEstimate).toBe(4); // would be 'adequate' on samples+span
    expect(dto.dataAdequacy.level).toBe('smoke-test'); // capped down
    expect(dto.dataAdequacy.reasons.length).toBeGreaterThan(0);
  });
});
