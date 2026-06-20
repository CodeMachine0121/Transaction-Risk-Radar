import type Decimal from 'decimal.js';

/** 安全群於某 coin 的單筆投票（方向 + 兩種權重 + conviction 佔比 + 槓桿 + 是否新開倉）。 */
export type ConsensusContribution = {
  coin: string;
  isLong: boolean;
  /** clamp(1 − riskScore/100)。 */
  inverseRiskWeight: Decimal;
  /** positionNotional / 該交易員當前總 notional。 */
  convictionShare: Decimal;
  /** inverseRiskWeight × convictionShare。 */
  convictionWeight: Decimal;
  leverage: Decimal;
  /** firstObservedAt 落在最近一個輪詢間隔內。 */
  isNew: boolean;
};
