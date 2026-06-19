import { vi } from 'vitest';
import type {
  IHyperliquidProxy,
  ILeaderboardTrader,
  IOpenPosition,
  ITraderFill,
} from '@/application/ports/iHyperliquidProxy';

/** 以 vi.fn 建立 IHyperliquidProxy 的 mock（預設皆回空陣列）。 */
export const createMockHyperliquidProxy = (): IHyperliquidProxy => ({
  fetchLeaderboard: vi.fn<() => Promise<ILeaderboardTrader[]>>().mockResolvedValue([]),
  fetchOpenPositions: vi
    .fn<(traderAddress: string) => Promise<IOpenPosition[]>>()
    .mockResolvedValue([]),
  fetchUserFills: vi
    .fn<(traderAddress: string, startTime: number) => Promise<ITraderFill[]>>()
    .mockResolvedValue([]),
});
