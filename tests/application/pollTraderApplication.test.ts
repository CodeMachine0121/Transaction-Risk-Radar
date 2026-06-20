import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { PollTraderApplication } from '@/application/pollTraderApplication';
import { PollTraderService } from '@/domain/service/pollTraderService';
import type { IHyperliquidProxy } from '@/domain/interface/iHyperliquidProxy';
import type { IPositionRepository } from '@/domain/interface/iPositionRepository';
import type { OpenPosition } from '@/domain/vo/openPosition';
import type { TraderActivity } from '@/domain/vo/traderActivity';
import { createMockHyperliquidProxy } from './support/mockHyperliquidProxy';
import { createMockPositionRepository } from './support/mockPositionRepository';

const openPosition = (): OpenPosition => ({
  coin: 'ETH',
  signedSize: new Decimal(2),
  entryPrice: new Decimal(100),
  leverage: new Decimal(10),
  unrealizedProfitAndLoss: new Decimal(40),
  positionValue: new Decimal(240),
  marginUsed: new Decimal(20),
});

const fill = (): TraderActivity => ({
  coin: 'ETH',
  price: new Decimal(100),
  signedSize: new Decimal(1),
  signedSizeBefore: new Decimal(0),
  realizedProfitAndLoss: new Decimal(0),
  occurredAt: 1,
  sourceReference: '1',
});

const buildApplication = (
  proxy: IHyperliquidProxy,
  positionRepository: IPositionRepository,
  options: { lookbackMilliseconds: number; now?: () => number },
): PollTraderApplication =>
  new PollTraderApplication(new PollTraderService(proxy, positionRepository, options));

describe('PollTraderApplication', () => {
  it('fetches activities since the latest observed timestamp and saves them', async () => {
    const proxy = createMockHyperliquidProxy();
    vi.mocked(proxy.fetchUserFills).mockResolvedValue([fill()]);
    const positionRepository = createMockPositionRepository();
    vi.mocked(positionRepository.latestActivityTimestamp).mockResolvedValue(5000);
    const application = buildApplication(proxy, positionRepository, {
      lookbackMilliseconds: 3000,
    });

    await application.poll('0xA');

    expect(proxy.fetchUserFills).toHaveBeenCalledWith('0xA', 5000);
    expect(positionRepository.saveActivities).toHaveBeenCalledWith('0xA', [fill()]);
  });

  it('falls back to now minus lookback when there is no prior fill', async () => {
    const proxy = createMockHyperliquidProxy();
    const positionRepository = createMockPositionRepository();
    vi.mocked(positionRepository.latestActivityTimestamp).mockResolvedValue(null);
    const application = buildApplication(proxy, positionRepository, {
      lookbackMilliseconds: 3000,
      now: () => 10000,
    });

    await application.poll('0xA');

    expect(proxy.fetchUserFills).toHaveBeenCalledWith('0xA', 7000);
  });

  it('snapshots open positions with ROI unrealized percentage and derived mark price', async () => {
    const proxy = createMockHyperliquidProxy();
    vi.mocked(proxy.fetchOpenPositions).mockResolvedValue([openPosition()]);
    const positionRepository = createMockPositionRepository();
    const application = buildApplication(proxy, positionRepository, {
      lookbackMilliseconds: 3000,
    });

    await application.poll('0xA');

    const [, snapshots] = vi.mocked(positionRepository.saveSnapshots).mock.calls[0] ?? [];
    expect(snapshots?.[0]?.coin).toBe('ETH');
    expect(snapshots?.[0]?.unrealizedProfitAndLossPercentage.toString()).toBe('20');
    expect(snapshots?.[0]?.markPrice.toString()).toBe('120');
    expect(snapshots?.[0]?.leverage.toString()).toBe('10');
  });
});
