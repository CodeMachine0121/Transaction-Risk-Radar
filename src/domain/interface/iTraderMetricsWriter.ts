import type { TraderMetricsResult } from '../metrics/traderMetrics';

/** 持久化交易員重算後的指標集。 */
export interface ITraderMetricsWriter {
  saveTraderMetrics(traderAddress: string, metrics: TraderMetricsResult): Promise<void>;
}
