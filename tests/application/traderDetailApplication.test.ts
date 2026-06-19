import { describe, expect, it, vi } from 'vitest';
import { TraderDetailApplication } from '@/application/traderDetailApplication';
import { TraderDetailService } from '@/domain/service/traderDetailService';
import {
  buildTrader,
  createMockTraderMetricsRepository,
} from './support/mockTraderMetricsRepository';

describe('TraderDetailApplication', () => {
  it('returns the risk DTO for a known trader address', async () => {
    const repository = createMockTraderMetricsRepository();
    vi.mocked(repository.findTraderByAddress).mockResolvedValue(buildTrader('A', 70));
    const application = new TraderDetailApplication(new TraderDetailService(repository));

    const detail = await application.getTraderDetail('A');

    expect(detail?.traderAddress).toBe('A');
    expect(repository.findTraderByAddress).toHaveBeenCalledWith('A');
  });

  it('returns null when the trader is unknown', async () => {
    const repository = createMockTraderMetricsRepository();
    vi.mocked(repository.findTraderByAddress).mockResolvedValue(null);
    const application = new TraderDetailApplication(new TraderDetailService(repository));

    const detail = await application.getTraderDetail('Z');

    expect(detail).toBeNull();
  });
});
