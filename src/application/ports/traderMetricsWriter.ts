import type { ITraderMetricsResult } from '../../domain/metrics/traderMetrics';

/** Repository port（寫入端）：持久化交易員重算後的指標集。 */
export interface ITraderMetricsWriter {
  saveTraderMetrics(traderAddress: string, metrics: ITraderMetricsResult): Promise<void>;
}
