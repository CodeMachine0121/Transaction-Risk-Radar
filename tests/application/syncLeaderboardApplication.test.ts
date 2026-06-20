import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { SyncLeaderboardApplication } from '@/application/syncLeaderboardApplication';
import { SyncLeaderboardService } from '@/domain/service/syncLeaderboardService';
import { Provider } from '@/domain/vo/provider';
import { createMockHyperliquidProxy } from './support/mockHyperliquidProxy';
import { createMockTraderRepository } from './support/mockTraderRepository';

const leaderboardTrader = (address: string) => ({ address, accountValue: new Decimal(1000) });

describe('SyncLeaderboardApplication', () => {
  it('fetches the leaderboard and saves every trader address', async () => {
    const proxy = createMockHyperliquidProxy();
    vi.mocked(proxy.fetchTraderList).mockResolvedValue([
      leaderboardTrader('0xA'),
      leaderboardTrader('0xB'),
    ]);
    const traderRepository = createMockTraderRepository();
    const application = new SyncLeaderboardApplication(
      new SyncLeaderboardService(proxy, traderRepository),
    );

    const count = await application.sync();

    expect(count).toBe(2);
    expect(traderRepository.saveTraders).toHaveBeenCalledWith(Provider.Hyperliquid, ['0xA', '0xB']);
  });

  it('persists account stats for traders that carry an aggregate return series', async () => {
    const proxy = createMockHyperliquidProxy();
    vi.mocked(proxy.fetchTraderList).mockResolvedValue([
      {
        address: '0xA',
        accountValue: new Decimal(1000),
        winRatio: new Decimal('0.6'),
        accountReturnSeries: [new Decimal('1'), new Decimal('-2'), new Decimal('3')],
      },
      leaderboardTrader('0xB'), // 無彙總 → 不寫 account stats
    ]);
    const traderRepository = createMockTraderRepository();
    const application = new SyncLeaderboardApplication(
      new SyncLeaderboardService(proxy, traderRepository),
    );

    await application.sync();

    expect(traderRepository.saveAccountStats).toHaveBeenCalledTimes(1);
    expect(traderRepository.saveAccountStats).toHaveBeenCalledWith(
      Provider.Hyperliquid,
      '0xA',
      expect.objectContaining({ winRatio: new Decimal('0.6') }),
    );
  });

  it('caps the synced traders to the configured maximum', async () => {
    const proxy = createMockHyperliquidProxy();
    vi.mocked(proxy.fetchTraderList).mockResolvedValue([
      leaderboardTrader('0xA'),
      leaderboardTrader('0xB'),
      leaderboardTrader('0xC'),
    ]);
    const traderRepository = createMockTraderRepository();
    const application = new SyncLeaderboardApplication(
      new SyncLeaderboardService(proxy, traderRepository, { maximumTraders: 2 }),
    );

    const count = await application.sync();

    expect(count).toBe(2);
    expect(traderRepository.saveTraders).toHaveBeenCalledWith(Provider.Hyperliquid, ['0xA', '0xB']);
  });
});
