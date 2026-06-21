/** 回測資料充足度（dataAdequacy）分級門檻；皆可注入，預設為保守值。 */
export type BacktestAdequacyThresholds = {
  /** 獨立樣本 ≥ 此值 → 至少 smoke-test（低於則 insufficient）。 */
  smokeTestMinimum: number;
  /** 獨立樣本 ≥ 此值 → preliminary/adequate（足以談信賴）。 */
  trustworthyMinimum: number;
  /** 達 trustworthy 後，日曆跨度 ≥ 此值（ms）→ adequate，否則 preliminary。 */
  adequateSpanMilliseconds: number;
  /** 典型參與人數 < 此值 → 封頂 smoke-test（薄共識不算共識）。 */
  participationFloor: number;
};

const DAYS_30_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

/** PRD 第 4 章規則 1 的保守預設。 */
export const DEFAULT_BACKTEST_ADEQUACY_THRESHOLDS: BacktestAdequacyThresholds = {
  smokeTestMinimum: 30,
  trustworthyMinimum: 200,
  adequateSpanMilliseconds: DAYS_30_MILLISECONDS,
  participationFloor: 5,
};
