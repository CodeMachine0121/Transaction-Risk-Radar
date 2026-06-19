import { describe, expect, it, vi } from 'vitest';
import { TraderDetailApplication } from '@/application/traderDetailApplication';
import {
  buildSummary,
  createMockTraderMetricsRepository,
} from './support/mockTraderMetricsRepository';

describe('TraderDetailApplication', () => {
  it('returns the risk summary the repository resolves for the address', async () => {
    const repository = createMockTraderMetricsRepository();
    vi.mocked(repository.findSummaryByAddress).mockResolvedValue(buildSummary('A', 70));
    const application = new TraderDetailApplication(repository);

    const detail = await application.getTraderDetail('A');

    expect(detail?.traderAddress).toBe('A');
    expect(repository.findSummaryByAddress).toHaveBeenCalledWith('A');
  });

  it('returns null when the repository finds no trader for the address', async () => {
    const repository = createMockTraderMetricsRepository();
    vi.mocked(repository.findSummaryByAddress).mockResolvedValue(null);
    const application = new TraderDetailApplication(repository);

    const detail = await application.getTraderDetail('Z');

    expect(detail).toBeNull();
  });
});
