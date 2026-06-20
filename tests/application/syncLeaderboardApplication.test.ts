import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { SyncLeaderboardApplication } from '@/application/syncLeaderboardApplication';
import { SyncLeaderboardService } from '@/domain/service/syncLeaderboardService';
import { createMockHyperliquidProxy } from './support/mockHyperliquidProxy';
import { createMockTraderRepository } from './support/mockTraderRepository';

const leaderboardTrader = (address: string) => ({ address, accountValue: new Decimal(1000) });

describe('SyncLeaderboardApplication', () => {
  it('fetches the leaderboard and saves every trader address', async () => {
    const proxy = createMockHyperliquidProxy();
    vi.mocked(proxy.fetchLeaderboard).mockResolvedValue([
      leaderboardTrader('0xA'),
      leaderboardTrader('0xB'),
    ]);
    const traderRepository = createMockTraderRepository();
    const application = new SyncLeaderboardApplication(
      new SyncLeaderboardService(proxy, traderRepository),
    );

    const count = await application.sync();

    expect(count).toBe(2);
    expect(traderRepository.saveTraders).toHaveBeenCalledWith(['0xA', '0xB']);
  });

  it('caps the synced traders to the configured maximum', async () => {
    const proxy = createMockHyperliquidProxy();
    vi.mocked(proxy.fetchLeaderboard).mockResolvedValue([
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
    expect(traderRepository.saveTraders).toHaveBeenCalledWith(['0xA', '0xB']);
  });
});
