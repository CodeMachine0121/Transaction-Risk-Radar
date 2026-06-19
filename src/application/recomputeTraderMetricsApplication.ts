import { assembleTraderPositionInputs } from '../domain/assembly/assembleTraderPositionInputs';
import { computeTraderMetrics, type ITraderMetricsResult } from '../domain/metrics/traderMetrics';
import type { ITraderMetricsWriter } from './ports/iTraderMetricsWriter';
import type { ITraderPositionRepository } from './ports/iTraderPositionRepository';

/**
 * 用例（US-05）：重算單一交易員的指標集。
 * 載入組裝輸入 → assemble → computeTraderMetrics → 持久化，並回傳結果。
 */
export class RecomputeTraderMetricsApplication {
  private readonly positionRepository: ITraderPositionRepository;
  private readonly metricsWriter: ITraderMetricsWriter;

  constructor(positionRepository: ITraderPositionRepository, metricsWriter: ITraderMetricsWriter) {
    this.positionRepository = positionRepository;
    this.metricsWriter = metricsWriter;
  }

  async recompute(traderAddress: string): Promise<ITraderMetricsResult> {
    const positions = await this.positionRepository.findAssemblyPositions(traderAddress);
    const metrics = computeTraderMetrics({ positions: assembleTraderPositionInputs(positions) });
    await this.metricsWriter.saveTraderMetrics(traderAddress, metrics);
    return metrics;
  }
}
