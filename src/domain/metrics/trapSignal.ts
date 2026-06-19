import Decimal from 'decimal.js';

/**
 * 陷阱訊號（trap signal）：winRate × normalizedMaxAdverseExcursion。
 * 抓「高勝率（看似超穩）但倉位偷偷扛很深」的馬丁格爾陷阱——這正是會把
 * 散戶洗出場的交易員，別的跟單榜看不出來。
 * @param winRate 勝率（0~1）
 * @param normalizedMaxAdverseExcursion 已正規化的 MAE p90（0~1）
 */
export function computeTrapSignal(
  winRate: Decimal,
  normalizedMaxAdverseExcursion: Decimal,
): Decimal {
  return winRate.times(normalizedMaxAdverseExcursion);
}
