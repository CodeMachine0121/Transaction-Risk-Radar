import { vi } from 'vitest';
import type { IPriceProxy } from '@/domain/interface/iPriceProxy';
import type { PricePoint } from '@/domain/vo/pricePoint';

export const createMockPriceProxy = (): IPriceProxy => ({
  fetchPriceSeries: vi
    .fn<(coin: string, since: number) => Promise<PricePoint[]>>()
    .mockResolvedValue([]),
});
