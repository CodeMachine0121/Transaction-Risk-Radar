import type Decimal from 'decimal.js';

/** 回測讀取用的單一共識時序點（已正規化）。 */
export type ConsensusSnapshotPoint = {
  coin: string;
  convictionWeightedDirectionBias: Decimal;
  consensusStrength: Decimal;
  /** 該共識點的參與人數；回測資料充足度的「參與深度」軸。 */
  participantCount: number;
  capturedAt: number;
};
