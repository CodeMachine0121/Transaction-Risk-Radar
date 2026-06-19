import { assembleTraderPositionInputs } from '../domain/assembly/assembleTraderPositionInputs';
import { computeTraderMetrics, type TraderMetricsResult } from '../domain/metrics/traderMetrics';
import type { TraderMetricsWriter } from './ports/traderMetricsWriter';
import type { TraderPositionRepository } from './ports/traderPositionRepository';

/**
 * 用例（US-05）：重算單一交易員的指標集。
 * 載入組裝輸入 → assemble → computeTraderMetrics → 持久化，並回傳結果。
 */
export class RecomputeTraderMetricsApplication {
  private readonly positionRepository: TraderPositionRepository;
  private readonly metricsWriter: TraderMetricsWriter;

  constructor(positionRepository: TraderPositionRepository, metricsWriter: TraderMetricsWriter) {
    this.positionRepository = positionRepository;
    this.metricsWriter = metricsWriter;
  }

  async recompute(traderAddress: string): Promise<TraderMetricsResult> {
    const positions = await this.positionRepository.findAssemblyPositions(traderAddress);
    const metrics = computeTraderMetrics({ positions: assembleTraderPositionInputs(positions) });
    await this.metricsWriter.saveTraderMetrics(traderAddress, metrics);
    return metrics;
  }
}
