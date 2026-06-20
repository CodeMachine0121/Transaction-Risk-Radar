import type Decimal from 'decimal.js';

/**
 * provider 排行提供的帳戶級彙總（看不到逐筆部位時的 fallback 輸入）。
 * `returnSeries`：每期報酬（百分比，依時間排序），由 provider 在 infra 邊際正規化。
 */
export type AccountStats = {
  winRatio: Decimal;
  returnSeries: Decimal[];
};
