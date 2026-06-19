import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import type { ITraderRepository } from '@/application/ports/iTraderRepository';
import { SyncLeaderboardApplication } from '@/application/syncLeaderboardApplication';
import { createMockHyperliquidProxy } from './support/mockHyperliquidProxy';

const createMockTraderRepository = (): ITraderRepository => ({
  saveTraders: vi.fn<(traderAddresses: string[]) => Promise<void>>().mockResolvedValue(undefined),
});

const leaderboardTrader = (address: string) => ({ address, accountValue: new Decimal(1000) });

describe('SyncLeaderboardApplication', () => {
  it('fetches the leaderboard and saves every trader address', async () => {
    const proxy = createMockHyperliquidProxy();
    vi.mocked(proxy.fetchLeaderboard).mockResolvedValue([
      leaderboardTrader('0xA'),
      leaderboardTrader('0xB'),
    ]);
    const traderRepository = createMockTraderRepository();
    const application = new SyncLeaderboardApplication(proxy, traderRepository);

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
    const application = new SyncLeaderboardApplication(proxy, traderRepository, {
      maximumTraders: 2,
    });

    const count = await application.sync();

    expect(count).toBe(2);
    expect(traderRepository.saveTraders).toHaveBeenCalledWith(['0xA', '0xB']);
  });
});
