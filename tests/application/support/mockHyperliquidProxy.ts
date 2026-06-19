import { vi } from 'vitest';
import type { IHyperliquidProxy } from '@/domain/interface/iHyperliquidProxy';
import type { LeaderboardTrader } from '@/domain/vo/leaderboardTrader';
import type { OpenPosition } from '@/domain/vo/openPosition';
import type { TraderFill } from '@/domain/vo/traderFill';

/** 以 vi.fn 建立 IHyperliquidProxy 的 mock（預設皆回空陣列）。 */
export const createMockHyperliquidProxy = (): IHyperliquidProxy => ({
  fetchLeaderboard: vi.fn<() => Promise<LeaderboardTrader[]>>().mockResolvedValue([]),
  fetchOpenPositions: vi
    .fn<(traderAddress: string) => Promise<OpenPosition[]>>()
    .mockResolvedValue([]),
  fetchUserFills: vi
    .fn<(traderAddress: string, startTime: number) => Promise<TraderFill[]>>()
    .mockResolvedValue([]),
});
