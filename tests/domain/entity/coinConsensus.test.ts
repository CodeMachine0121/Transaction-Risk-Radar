import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { CoinConsensus } from '@/domain/entity/coinConsensus';
import type { ConsensusContribution } from '@/domain/vo/consensusContribution';

const vote = (
  isLong: boolean,
  convictionShare: number,
  options: { inverseRiskWeight?: number; leverage?: number; isNew?: boolean } = {},
): ConsensusContribution => {
  const inverseRiskWeight = new Decimal(options.inverseRiskWeight ?? 1);
  const share = new Decimal(convictionShare);
  return {
    coin: 'BTC',
    isLong,
    inverseRiskWeight,
    convictionShare: share,
    convictionWeight: inverseRiskWeight.times(share),
    leverage: new Decimal(options.leverage ?? 10),
    isNew: options.isNew ?? false,
  };
};

describe('CoinConsensus', () => {
  it('aggregates risk- and conviction-weighted bias and selects strength by weighting', () => {
    const consensus = new CoinConsensus('BTC');
    consensus.add(vote(true, 1)); // FOCUS long, share 1
    consensus.add(vote(false, 0.1)); // WHALE short, share 0.1
    consensus.add(vote(false, 0.1)); // WHALE short, share 0.1

    const equal = consensus.toDto('equal');
    const conviction = consensus.toDto('conviction');

    expect(equal.participantCount).toBe(3);
    expect(equal.longCount).toBe(1);
    expect(equal.shortCount).toBe(2);
    // risk-加權（每人一票）：(1 − 1 − 1)/3 = −1/3
    expect(Number(equal.netDirectionBias)).toBeCloseTo(-1 / 3, 6);
    expect(Number(equal.consensusStrength)).toBeCloseTo(1 / 3, 6);
    // conviction-加權：(1 − 0.1 − 0.1)/1.2 = 2/3（翻轉為偏多）
    expect(Number(conviction.convictionWeightedDirectionBias)).toBeCloseTo(2 / 3, 6);
    expect(Number(conviction.consensusStrength)).toBeCloseTo(2 / 3, 6);
  });

  it('reports conviction-share distribution, leverage and new positions', () => {
    const consensus = new CoinConsensus('BTC');
    consensus.add(vote(true, 1, { leverage: 10, isNew: true }));
    consensus.add(vote(false, 0.1, { leverage: 20, isNew: false }));
    consensus.add(vote(false, 0.1, { leverage: 6, isNew: true }));

    const dto = consensus.toDto('conviction');

    expect(Number(dto.averageConvictionShare)).toBeCloseTo(0.4, 6); // (1 + 0.1 + 0.1)/3
    expect(dto.maxConvictionShare).toBe('1');
    expect(Number(dto.averageLeverage)).toBeCloseTo(12, 6); // (10 + 20 + 6)/3
    expect(dto.newPositionCount).toBe(2);
    expect(Number(dto.longShareOfParticipants)).toBeCloseTo(1 / 3, 6);
  });
});
