import type { Provider } from './provider';

/** 安全群共識查詢條件（US-05）。皆可選；門檻未給時 service 套預設。 */
export type SafeCohortConsensusQuery = {
  provider?: Provider;
  /** 納入共識群體的 riskScore 上限（預設 40）。 */
  maxRiskScore?: number;
  /** 某 coin 至少需幾位安全交易員才輸出（預設 3）。 */
  minimumConsensusParticipants?: number;
  offset?: number;
  limit?: number;
};
