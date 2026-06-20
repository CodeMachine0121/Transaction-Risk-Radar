import { describe, expect, it, vi } from 'vitest';
import { TraderDetailApplication } from '@/application/traderDetailApplication';
import { TraderDetailService } from '@/domain/service/traderDetailService';
import { Provider } from '@/domain/vo/provider';
import { buildTrader, createMockTraderRepository } from './support/mockTraderRepository';

describe('TraderDetailApplication', () => {
  it('returns the risk DTO for a known trader', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findTrader).mockResolvedValue(buildTrader('A', 70));
    const application = new TraderDetailApplication(new TraderDetailService(repository));

    const detail = await application.getTraderDetail(Provider.Hyperliquid, 'A');

    expect(detail?.traderAddress).toBe('A');
    expect(repository.findTrader).toHaveBeenCalledWith(Provider.Hyperliquid, 'A');
  });

  it('returns null when the trader is unknown', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findTrader).mockResolvedValue(null);
    const application = new TraderDetailApplication(new TraderDetailService(repository));

    const detail = await application.getTraderDetail(Provider.Hyperliquid, 'Z');

    expect(detail).toBeNull();
  });
});
