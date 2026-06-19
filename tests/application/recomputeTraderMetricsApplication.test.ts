import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { RecomputeTraderMetricsApplication } from '@/application/recomputeTraderMetricsApplication';
import { Position } from '@/domain/entity/position';
import { RecomputeTraderMetricsService } from '@/domain/service/recomputeTraderMetricsService';
import type { ITraderMetricsWriter } from '@/domain/interface/iTraderMetricsWriter';
import type { ITraderPositionRepository } from '@/domain/interface/iTraderPositionRepository';
import type { TraderMetrics } from '@/domain/vo/traderMetrics';

const closedPosition = (hasSnapshot: boolean, coin = 'ETH'): Position =>
  new Position({
    coin,
    side: 'long',
    events: [{ type: 'open', price: new Decimal(100), size: new Decimal(1) }],
    snapshots: hasSnapshot
      ? [{ unrealizedProfitAndLossPercentage: new Decimal(-10), leverage: new Decimal(10) }]
      : [],
    realizedProfitAndLoss: new Decimal(10),
    closed: true,
  });

const createMockPositionRepository = (): ITraderPositionRepository => ({
  findPositions: vi.fn<(traderAddress: string) => Promise<Position[]>>().mockResolvedValue([]),
});

const createMockMetricsWriter = (): ITraderMetricsWriter => ({
  saveTraderMetrics: vi
    .fn<(traderAddress: string, metrics: TraderMetrics) => Promise<void>>()
    .mockResolvedValue(undefined),
});

// 真實 RecomputeTraderMetricsService（連帶真實 Trader/Position），只 mock repository / writer 介面。
describe('RecomputeTraderMetricsApplication', () => {
  it('loads positions, recomputes, persists, and returns a DTO', async () => {
    const positionRepository = createMockPositionRepository();
    vi.mocked(positionRepository.findPositions).mockResolvedValue([closedPosition(true)]);
    const metricsWriter = createMockMetricsWriter();
    const application = new RecomputeTraderMetricsApplication(
      new RecomputeTraderMetricsService(positionRepository, metricsWriter),
    );

    const dto = await application.recompute('0xA');

    expect(positionRepository.findPositions).toHaveBeenCalledWith('0xA');
    expect(metricsWriter.saveTraderMetrics).toHaveBeenCalledOnce();
    expect(dto.insufficientData).toBe(true); // 1 closed < minimum 20
    expect(dto.closedPositionCount).toBe(1);
  });

  it('excludes positions without snapshots from the count', async () => {
    const positionRepository = createMockPositionRepository();
    vi.mocked(positionRepository.findPositions).mockResolvedValue([
      closedPosition(true),
      closedPosition(false, 'BTC'),
    ]);
    const application = new RecomputeTraderMetricsApplication(
      new RecomputeTraderMetricsService(positionRepository, createMockMetricsWriter()),
    );

    const dto = await application.recompute('0xA');

    expect(dto.closedPositionCount).toBe(1);
  });
});
