import type Decimal from 'decimal.js';

/** 回測讀取用的單一共識時序點（已正規化）。 */
export type ConsensusSnapshotPoint = {
  coin: string;
  convictionWeightedDirectionBias: Decimal;
  consensusStrength: Decimal;
  capturedAt: number;
};
