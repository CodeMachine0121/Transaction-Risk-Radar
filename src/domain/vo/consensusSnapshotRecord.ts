import type Decimal from 'decimal.js';

/** 一筆要留存的共識時序快照（capturedAt 由 repository 於寫入時設定）。回測的歷史輸入。 */
export type ConsensusSnapshotRecord = {
  coin: string;
  netDirectionBias: Decimal;
  convictionWeightedDirectionBias: Decimal;
  consensusStrength: Decimal;
  maxConvictionShare: Decimal;
  participantCount: number;
};
