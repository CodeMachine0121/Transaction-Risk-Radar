import type { TraderMetricsResult } from '../../domain/metrics/traderMetrics';

/** Repository port（寫入端）：持久化交易員重算後的指標集。 */
export interface TraderMetricsWriter {
  saveTraderMetrics(traderAddress: string, metrics: TraderMetricsResult): Promise<void>;
}
