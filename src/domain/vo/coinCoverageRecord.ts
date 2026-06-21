/** 單一 coin 在 consensus_snapshots 的覆蓋度原始彙總（repository 聚合產出）。 */
export type CoinCoverageRecord = {
  coin: string;
  snapshotCount: number;
  /** 最早共識快照時間（ms epoch）。 */
  earliestCapturedAt: number;
  /** 最晚共識快照時間（ms epoch）。 */
  latestCapturedAt: number;
};
