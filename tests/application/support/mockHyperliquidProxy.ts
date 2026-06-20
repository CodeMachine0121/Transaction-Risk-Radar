import { vi } from 'vitest';
import type { ITraderDataProxy } from '@/domain/interface/iTraderDataProxy';
import type { LeaderboardTrader } from '@/domain/vo/leaderboardTrader';
import type { OpenPosition } from '@/domain/vo/openPosition';
import { Provider } from '@/domain/vo/provider';
import type { TraderActivity } from '@/domain/vo/traderActivity';

/** 以 vi.fn 建立 ITraderDataProxy 的 mock（預設皆回空陣列）。 */
export const createMockHyperliquidProxy = (): ITraderDataProxy => ({
  provider: Provider.Hyperliquid,
  fetchTraderList: vi.fn<() => Promise<LeaderboardTrader[]>>().mockResolvedValue([]),
  fetchOpenPositions: vi
    .fn<(traderAddress: string) => Promise<OpenPosition[]>>()
    .mockResolvedValue([]),
  fetchPositionActivities: vi
    .fn<(traderAddress: string, startTime: number) => Promise<TraderActivity[]>>()
    .mockResolvedValue([]),
});
