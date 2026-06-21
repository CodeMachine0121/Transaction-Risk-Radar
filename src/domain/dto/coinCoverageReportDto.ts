/** 單一 coin 的共識覆蓋度（含衍生跨度）。 */
export type CoinCoverageDto = {
  coin: string;
  snapshotCount: number;
  earliestCapturedAt: number;
  latestCapturedAt: number;
  /** latestCapturedAt − earliestCapturedAt；span 越長越接近 /backtest 的 adequate。 */
  spanMilliseconds: number;
};

/** /coins/coverage 回傳形狀：各 coin 覆蓋度，依 spanMilliseconds 由大到小排序。 */
export type CoinCoverageReportDto = {
  coins: CoinCoverageDto[];
};
