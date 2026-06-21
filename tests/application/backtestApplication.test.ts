import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { BacktestApplication } from '@/application/backtestApplication';
import { BacktestEvaluatorService } from '@/domain/service/backtestEvaluatorService';
import type { ConsensusSnapshotPoint } from '@/domain/vo/consensusSnapshotPoint';
import type { PricePoint } from '@/domain/vo/pricePoint';
import { createMockConsensusSnapshotRepository } from './support/mockConsensusSnapshotRepository';
import { createMockPriceProxy } from './support/mockPriceProxy';

const consensusPoint = (
  capturedAt: number,
  bias: number,
  participantCount = 10,
): ConsensusSnapshotPoint => ({
  coin: 'BTC',
  convictionWeightedDirectionBias: new Decimal(bias),
  consensusStrength: new Decimal(Math.abs(bias)),
  participantCount,
  capturedAt,
});

const price = (timestamp: number, value: number): PricePoint => ({
  timestamp,
  price: new Decimal(value),
});

describe('BacktestApplication', () => {
  it('computes direction hit-rate and aligned forward return per horizon', async () => {
    const consensusSnapshots = createMockConsensusSnapshotRepository();
    vi.mocked(consensusSnapshots.loadConsensusSeries).mockResolvedValue([
      consensusPoint(0, 1), // long
      consensusPoint(100, 1), // long
    ]);
    const priceProxy = createMockPriceProxy();
    vi.mocked(priceProxy.fetchPriceSeries).mockResolvedValue([
      price(0, 100),
      price(60, 110), // t=0 +60 → +10% (long hit)
      price(100, 110),
      price(160, 99), // t=100 +60 → -10% (long miss)
    ]);
    const application = new BacktestApplication(
      consensusSnapshots,
      priceProxy,
      new BacktestEvaluatorService(),
    );

    const report = await application.evaluate('BTC', 0, [60]);

    expect(report.coin).toBe('BTC');
    expect(report.evaluatedSignalCount).toBe(2);
    const horizon = report.horizons[0];
    expect(horizon?.sampleCount).toBe(2);
    expect(horizon?.signalHitRate).toBe('0.5'); // 1 hit / 2
    expect(Number(horizon?.averageForwardReturn)).toBeCloseTo(0, 6); // (+0.1 − 0.1) / 2
  });

  it('excludes neutral signals and samples lacking forward prices', async () => {
    const consensusSnapshots = createMockConsensusSnapshotRepository();
    vi.mocked(consensusSnapshots.loadConsensusSeries).mockResolvedValue([
      consensusPoint(0, 0), // neutral → excluded
      consensusPoint(100, 1), // long but no price at/after 160 → no sample
    ]);
    const priceProxy = createMockPriceProxy();
    vi.mocked(priceProxy.fetchPriceSeries).mockResolvedValue([price(100, 110)]); // no price ≥ 160
    const application = new BacktestApplication(
      consensusSnapshots,
      priceProxy,
      new BacktestEvaluatorService(),
    );

    const report = await application.evaluate('BTC', 0, [60]);

    expect(report.evaluatedSignalCount).toBe(1); // neutral dropped
    expect(report.horizons[0]?.sampleCount).toBe(0); // long sample had no forward price
    expect(report.horizons[0]?.signalHitRate).toBe('0');
  });

  it('estimates independent samples from non-overlapping windows only', async () => {
    // horizon=100: points at 0,20,40 overlap (all exit within 140); 200 starts a new
    // window; 220 falls inside it. Non-overlapping: {0, 200} = 2, while sampleCount = 5.
    const consensusSnapshots = createMockConsensusSnapshotRepository();
    vi.mocked(consensusSnapshots.loadConsensusSeries).mockResolvedValue([
      consensusPoint(0, 1),
      consensusPoint(20, 1),
      consensusPoint(40, 1),
      consensusPoint(200, 1),
      consensusPoint(220, 1),
    ]);
    const priceProxy = createMockPriceProxy();
    vi.mocked(priceProxy.fetchPriceSeries).mockResolvedValue([
      price(0, 100),
      price(20, 101),
      price(40, 102),
      price(100, 110),
      price(120, 111),
      price(140, 112),
      price(200, 120),
      price(220, 121),
      price(300, 130),
      price(320, 131),
    ]);
    const application = new BacktestApplication(
      consensusSnapshots,
      priceProxy,
      new BacktestEvaluatorService(),
    );

    const report = await application.evaluate('BTC', 0, [100]);

    const horizon = report.horizons[0];
    expect(horizon?.sampleCount).toBe(5); // overlapping count
    expect(horizon?.independentSampleEstimate).toBe(2); // de-overlapped
  });

  it('maps independent-sample count to a dataAdequacy level', async () => {
    // tiny injected thresholds keep synthetic data small; participation high so the
    // participation floor never triggers (that downgrade is covered separately).
    const thresholds = {
      smokeTestMinimum: 2,
      trustworthyMinimum: 4,
      adequateSpanMilliseconds: 1000,
      participationFloor: 1,
    };
    const levelFor = async (capturedAts: number[]): Promise<string> => {
      const consensusSnapshots = createMockConsensusSnapshotRepository();
      vi.mocked(consensusSnapshots.loadConsensusSeries).mockResolvedValue(
        capturedAts.map((at) => consensusPoint(at, 1)),
      );
      const timestamps = new Set<number>();
      capturedAts.forEach((at) => {
        timestamps.add(at);
        timestamps.add(at + 10);
      });
      const prices = [...timestamps]
        .sort((left, right) => left - right)
        .map((timestamp, index) => price(timestamp, 100 + index));
      const priceProxy = createMockPriceProxy();
      vi.mocked(priceProxy.fetchPriceSeries).mockResolvedValue(prices);
      const application = new BacktestApplication(
        consensusSnapshots,
        priceProxy,
        new BacktestEvaluatorService({ adequacyThresholds: thresholds }),
      );
      const report = await application.evaluate('BTC', 0, [10]);
      return report.horizons[0]?.dataAdequacy.level ?? '';
    };

    expect(await levelFor([0])).toBe('insufficient'); // 1 independent < 2
    expect(await levelFor([0, 10])).toBe('smoke-test'); // 2 independent, < 4
    expect(await levelFor([0, 10, 20, 30])).toBe('preliminary'); // 4 independent, span 30 < 1000
    expect(await levelFor([0, 10, 20, 1000])).toBe('adequate'); // 4 independent, span 1000
  });
});
