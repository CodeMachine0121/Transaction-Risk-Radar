import { vi } from 'vitest';
import type { IConsensusSnapshotRepository } from '@/domain/interface/iConsensusSnapshotRepository';
import type { ConsensusSnapshotPoint } from '@/domain/vo/consensusSnapshotPoint';
import type { ConsensusSnapshotRecord } from '@/domain/vo/consensusSnapshotRecord';

export const createMockConsensusSnapshotRepository = (): IConsensusSnapshotRepository => ({
  saveConsensusSnapshots: vi
    .fn<(records: ConsensusSnapshotRecord[]) => Promise<void>>()
    .mockResolvedValue(undefined),
  loadConsensusSeries: vi
    .fn<(coin: string, since: number) => Promise<ConsensusSnapshotPoint[]>>()
    .mockResolvedValue([]),
  listRecordedCoins: vi.fn<() => Promise<string[]>>().mockResolvedValue([]),
});
