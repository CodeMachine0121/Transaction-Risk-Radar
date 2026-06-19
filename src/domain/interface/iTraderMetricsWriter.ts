import type { TraderMetrics } from '../vo/traderMetrics';

/** 持久化交易員重算後的彙總指標。 */
export interface ITraderMetricsWriter {
  saveTraderMetrics(traderAddress: string, metrics: TraderMetrics): Promise<void>;
}
