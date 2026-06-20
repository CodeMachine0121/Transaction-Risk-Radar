import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { RecomputeTraderMetricsApplication } from '@/application/recomputeTraderMetricsApplication';
import { Position } from '@/domain/entity/position';
import { RecomputeTraderMetricsService } from '@/domain/service/recomputeTraderMetricsService';
import { Provider } from '@/domain/vo/provider';
import { createMockPositionRepository } from './support/mockPositionRepository';
import { createMockTraderRepository } from './support/mockTraderRepository';

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

// 真實 RecomputeTraderMetricsService（連帶真實 Trader/Position），只 mock repository 介面。
describe('RecomputeTraderMetricsApplication', () => {
  it('loads positions, recomputes, persists, and returns a DTO', async () => {
    const positionRepository = createMockPositionRepository();
    vi.mocked(positionRepository.findPositions).mockResolvedValue([closedPosition(true)]);
    const traderRepository = createMockTraderRepository();
    const application = new RecomputeTraderMetricsApplication(
      new RecomputeTraderMetricsService(positionRepository, traderRepository),
    );

    const dto = await application.recompute(Provider.Hyperliquid, '0xA');

    expect(positionRepository.findPositions).toHaveBeenCalledWith(Provider.Hyperliquid, '0xA');
    expect(traderRepository.saveTraderMetrics).toHaveBeenCalledOnce();
    expect(dto.insufficientData).toBe(true); // 1 closed < minimum 20
    expect(dto.closedPositionCount).toBe(1);
  });

  it('falls back to account-level risk when position-level is insufficient and account stats exist', async () => {
    const positionRepository = createMockPositionRepository();
    vi.mocked(positionRepository.findPositions).mockResolvedValue([closedPosition(true)]); // 1 < 20 → 不足
    const traderRepository = createMockTraderRepository();
    vi.mocked(traderRepository.findAccountStats).mockResolvedValue({
      winRatio: new Decimal('0.6'),
      returnSeries: [new Decimal('10'), new Decimal('-20'), new Decimal('5'), new Decimal('-10')],
    });
    const application = new RecomputeTraderMetricsApplication(
      new RecomputeTraderMetricsService(positionRepository, traderRepository),
    );

    const dto = await application.recompute(Provider.Okx, 'CODE');

    expect(traderRepository.findAccountStats).toHaveBeenCalledWith(Provider.Okx, 'CODE');
    expect(dto.tier).toBe('account');
    expect(dto.insufficientData).toBe(false);
    expect(dto.riskScore).not.toBeNull();
  });

  it('keeps position-level tier when position data is sufficient (no fallback)', async () => {
    const positionRepository = createMockPositionRepository();
    vi.mocked(positionRepository.findPositions).mockResolvedValue(
      Array.from({ length: 20 }, (_unused, index) => closedPosition(true, `C${index}`)),
    );
    const traderRepository = createMockTraderRepository();
    vi.mocked(traderRepository.findAccountStats).mockResolvedValue({
      winRatio: new Decimal('0.6'),
      returnSeries: [new Decimal('10'), new Decimal('-20')],
    });
    const application = new RecomputeTraderMetricsApplication(
      new RecomputeTraderMetricsService(positionRepository, traderRepository),
    );

    const dto = await application.recompute(Provider.Okx, 'CODE');

    expect(dto.tier).toBe('position');
    expect(traderRepository.findAccountStats).not.toHaveBeenCalled();
  });

  it('excludes positions without snapshots from the count', async () => {
    const positionRepository = createMockPositionRepository();
    vi.mocked(positionRepository.findPositions).mockResolvedValue([
      closedPosition(true),
      closedPosition(false, 'BTC'),
    ]);
    const application = new RecomputeTraderMetricsApplication(
      new RecomputeTraderMetricsService(positionRepository, createMockTraderRepository()),
    );

    const dto = await application.recompute(Provider.Hyperliquid, '0xA');

    expect(dto.closedPositionCount).toBe(1);
  });
});
