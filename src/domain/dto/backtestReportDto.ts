/** 單一評估視窗（horizon）的回測結果。 */
export type HorizonResultDto = {
  horizonMilliseconds: number;
  /** 有方向且兩端皆有對照價格的樣本數（**重疊**計數，為高估上界）。 */
  sampleCount: number;
  /** 非重疊窗的獨立樣本估計（資料充足度判定依據；恆 ≤ sampleCount）。 */
  independentSampleEstimate: number;
  /** lean 方向與 forwardReturn 同號的比例（0..1）。 */
  signalHitRate: string;
  /** 以 lean 方向對齊的前向報酬平均（>0 代表方向平均有利）。 */
  averageForwardReturn: string;
};

/** 某 coin 的回測報告：各 horizon 的預測力指標。供人工校準門檻，非自動套用。 */
export type BacktestReportDto = {
  coin: string;
  /** 非 neutral 的共識訊號點數（無論是否有對照價格）。 */
  evaluatedSignalCount: number;
  horizons: HorizonResultDto[];
};
