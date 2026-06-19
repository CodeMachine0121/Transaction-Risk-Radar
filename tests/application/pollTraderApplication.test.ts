import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { PollTraderApplication } from '@/application/pollTraderApplication';
import { PollTraderService } from '@/domain/service/pollTraderService';
import type { IPositionRepository } from '@/domain/interface/iPositionRepository';
import type { OpenPosition } from '@/domain/vo/openPosition';
import type { PositionSnapshotRecord } from '@/domain/vo/positionSnapshotRecord';
import type { TraderFill } from '@/domain/vo/traderFill';
import { createMockHyperliquidProxy } from './support/mockHyperliquidProxy';

const createMockPositionRepository = (): IPositionRepository => ({
  saveFills: vi
    .fn<(traderAddress: string, fills: TraderFill[]) => Promise<void>>()
    .mockResolvedValue(undefined),
  saveSnapshots: vi
    .fn<(traderAddress: string, snapshots: PositionSnapshotRecord[]) => Promise<void>>()
    .mockResolvedValue(undefined),
});

const openPosition = (): OpenPosition => ({
  coin: 'ETH',
  signedSize: new Decimal(2),
  entryPrice: new Decimal(100),
  leverage: new Decimal(10),
  unrealizedProfitAndLoss: new Decimal(40),
  positionValue: new Decimal(240),
  marginUsed: new Decimal(20),
});

const fill = (): TraderFill => ({
  coin: 'ETH',
  price: new Decimal(100),
  size: new Decimal(1),
  side: 'buy',
  timestamp: 1,
  startPosition: new Decimal(0),
  direction: 'Open Long',
  closedProfitAndLoss: new Decimal(0),
  tradeId: 1,
  hash: '0x',
});

describe('PollTraderApplication', () => {
  it('fetches fills since the given time and saves them', async () => {
    const proxy = createMockHyperliquidProxy();
    vi.mocked(proxy.fetchUserFills).mockResolvedValue([fill()]);
    const positionRepository = createMockPositionRepository();
    const application = new PollTraderApplication(new PollTraderService(proxy, positionRepository));

    await application.poll('0xA', 1000);

    expect(proxy.fetchUserFills).toHaveBeenCalledWith('0xA', 1000);
    expect(positionRepository.saveFills).toHaveBeenCalledWith('0xA', [fill()]);
  });

  it('snapshots open positions with ROI unrealized percentage and derived mark price', async () => {
    const proxy = createMockHyperliquidProxy();
    vi.mocked(proxy.fetchOpenPositions).mockResolvedValue([openPosition()]);
    const positionRepository = createMockPositionRepository();
    const application = new PollTraderApplication(new PollTraderService(proxy, positionRepository));

    await application.poll('0xA', 1000);

    const [, snapshots] = vi.mocked(positionRepository.saveSnapshots).mock.calls[0] ?? [];
    expect(snapshots?.[0]?.coin).toBe('ETH');
    expect(snapshots?.[0]?.unrealizedProfitAndLossPercentage.toString()).toBe('20');
    expect(snapshots?.[0]?.markPrice.toString()).toBe('120');
    expect(snapshots?.[0]?.leverage.toString()).toBe('10');
  });
});
