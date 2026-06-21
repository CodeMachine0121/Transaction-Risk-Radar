import { describe, expect, it, vi } from 'vitest';
import { ListCoinCoverageApplication } from '@/application/listCoinCoverageApplication';
import { RecordedCoinService } from '@/domain/service/recordedCoinService';
import { createMockConsensusSnapshotRepository } from './support/mockConsensusSnapshotRepository';

describe('ListCoinCoverageApplication', () => {
  it('derives spanMilliseconds and sorts by span descending', async () => {
    const repository = createMockConsensusSnapshotRepository();
    vi.mocked(repository.listCoinCoverage).mockResolvedValue([
      { coin: 'BTC', snapshotCount: 10, earliestCapturedAt: 1000, latestCapturedAt: 2000 }, // span 1000
      { coin: 'ETH', snapshotCount: 5, earliestCapturedAt: 0, latestCapturedAt: 5000 }, // span 5000
    ]);
    const application = new ListCoinCoverageApplication(new RecordedCoinService(repository));

    const result = await application.listCoinCoverage();

    expect(result.coins.map((entry) => entry.coin)).toEqual(['ETH', 'BTC']); // longest span first
    expect(result.coins[0]).toEqual({
      coin: 'ETH',
      snapshotCount: 5,
      earliestCapturedAt: 0,
      latestCapturedAt: 5000,
      spanMilliseconds: 5000,
    });
    expect(result.coins[1]?.spanMilliseconds).toBe(1000);
  });

  it('breaks span ties by coin ascending', async () => {
    const repository = createMockConsensusSnapshotRepository();
    vi.mocked(repository.listCoinCoverage).mockResolvedValue([
      { coin: 'SOL', snapshotCount: 3, earliestCapturedAt: 0, latestCapturedAt: 1000 },
      { coin: 'ADA', snapshotCount: 3, earliestCapturedAt: 100, latestCapturedAt: 1100 },
    ]); // both span 1000

    const application = new ListCoinCoverageApplication(new RecordedCoinService(repository));

    const result = await application.listCoinCoverage();

    expect(result.coins.map((entry) => entry.coin)).toEqual(['ADA', 'SOL']);
  });

  it('returns an empty list when nothing is recorded', async () => {
    const repository = createMockConsensusSnapshotRepository();
    vi.mocked(repository.listCoinCoverage).mockResolvedValue([]);
    const application = new ListCoinCoverageApplication(new RecordedCoinService(repository));

    const result = await application.listCoinCoverage();

    expect(result.coins).toEqual([]);
  });
});
