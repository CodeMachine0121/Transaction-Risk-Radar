import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import type { ITraderMetricsWriter } from '@/domain/interface/iTraderMetricsWriter';
import type { ITraderPositionRepository } from '@/domain/interface/iTraderPositionRepository';
import { RecomputeTraderMetricsApplication } from '@/application/recomputeTraderMetricsApplication';
import type { AssemblyPosition } from '@/domain/assembly/assembleTraderPositionInputs';
import type { TraderMetricsResult } from '@/domain/metrics/traderMetrics';

const assemblyPosition = (isClosed: boolean, hasSnapshot: boolean): AssemblyPosition => ({
  reconstructed: {
    coin: 'ETH',
    side: 'long',
    events: [{ type: 'open', price: new Decimal(100), size: new Decimal(1) }],
    realizedProfitAndLoss: new Decimal(10),
    realizedReturnPercentage: new Decimal(10),
    isClosed,
  },
  snapshots: hasSnapshot
    ? [{ unrealizedProfitAndLossPercentage: new Decimal(-10), leverage: new Decimal(10) }]
    : [],
});

const createPositionRepository = (): ITraderPositionRepository => ({
  findAssemblyPositions: vi
    .fn<(traderAddress: string) => Promise<AssemblyPosition[]>>()
    .mockResolvedValue([]),
});

const createMetricsWriter = (): ITraderMetricsWriter => ({
  saveTraderMetrics: vi
    .fn<(traderAddress: string, metrics: TraderMetricsResult) => Promise<void>>()
    .mockResolvedValue(undefined),
});

describe('RecomputeTraderMetricsApplication', () => {
  it('loads positions, computes metrics, saves them, and returns the result', async () => {
    const positionRepository = createPositionRepository();
    vi.mocked(positionRepository.findAssemblyPositions).mockResolvedValue([
      assemblyPosition(true, true),
    ]);
    const metricsWriter = createMetricsWriter();
    const application = new RecomputeTraderMetricsApplication(positionRepository, metricsWriter);

    const metrics = await application.recompute('0xA');

    expect(positionRepository.findAssemblyPositions).toHaveBeenCalledWith('0xA');
    expect(metrics.closedPositionCount).toBe(1);
    expect(metricsWriter.saveTraderMetrics).toHaveBeenCalledWith('0xA', metrics);
  });

  it('excludes positions without snapshots before computing', async () => {
    const positionRepository = createPositionRepository();
    vi.mocked(positionRepository.findAssemblyPositions).mockResolvedValue([
      assemblyPosition(true, true),
      assemblyPosition(true, false),
    ]);
    const metricsWriter = createMetricsWriter();
    const application = new RecomputeTraderMetricsApplication(positionRepository, metricsWriter);

    const metrics = await application.recompute('0xA');

    expect(metrics.closedPositionCount).toBe(1);
  });

  it('flags insufficient data and still persists when there are no positions', async () => {
    const positionRepository = createPositionRepository();
    const metricsWriter = createMetricsWriter();
    const application = new RecomputeTraderMetricsApplication(positionRepository, metricsWriter);

    const metrics = await application.recompute('0xA');

    expect(metrics.insufficientData).toBe(true);
    expect(metrics.closedPositionCount).toBe(0);
    expect(metricsWriter.saveTraderMetrics).toHaveBeenCalledOnce();
  });
});
