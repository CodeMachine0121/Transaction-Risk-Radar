import { vi } from 'vitest';
import type { Position } from '@/domain/entity/position';
import type { IPositionRepository } from '@/domain/interface/iPositionRepository';
import type { PositionSnapshotRecord } from '@/domain/vo/positionSnapshotRecord';
import type { TraderActivity } from '@/domain/vo/traderActivity';

export const createMockPositionRepository = (): IPositionRepository => ({
  saveActivities: vi
    .fn<(traderAddress: string, activities: TraderActivity[]) => Promise<void>>()
    .mockResolvedValue(undefined),
  saveSnapshots: vi
    .fn<(traderAddress: string, snapshots: PositionSnapshotRecord[]) => Promise<void>>()
    .mockResolvedValue(undefined),
  findPositions: vi.fn<(traderAddress: string) => Promise<Position[]>>().mockResolvedValue([]),
  latestActivityTimestamp: vi
    .fn<(traderAddress: string) => Promise<number | null>>()
    .mockResolvedValue(null),
});
