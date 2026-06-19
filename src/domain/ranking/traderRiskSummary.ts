import type { TraderMetricsResult } from '../metrics/traderMetrics';

/** 一位交易員的完整風險指標摘要（指標集 + 地址），供排行與詳情使用。 */
export type TraderRiskSummary = TraderMetricsResult & {
  traderAddress: string;
};
