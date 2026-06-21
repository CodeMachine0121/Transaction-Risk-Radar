import { describe, expect, it, vi } from 'vitest';
import { ListRecordedCoinsApplication } from '@/application/listRecordedCoinsApplication';
import { RecordedCoinService } from '@/domain/service/recordedCoinService';
import { createMockConsensusSnapshotRepository } from './support/mockConsensusSnapshotRepository';

describe('ListRecordedCoinsApplication', () => {
  it('returns recorded coins sorted ascending', async () => {
    const repository = createMockConsensusSnapshotRepository();
    vi.mocked(repository.listRecordedCoins).mockResolvedValue(['ETH', 'BTC', 'SOL']);
    const application = new ListRecordedCoinsApplication(new RecordedCoinService(repository));

    const result = await application.listRecordedCoins();

    expect(result.coins).toEqual(['BTC', 'ETH', 'SOL']);
  });

  it('returns an empty list when nothing is recorded', async () => {
    const repository = createMockConsensusSnapshotRepository();
    vi.mocked(repository.listRecordedCoins).mockResolvedValue([]);
    const application = new ListRecordedCoinsApplication(new RecordedCoinService(repository));

    const result = await application.listRecordedCoins();

    expect(result.coins).toEqual([]);
  });
});
