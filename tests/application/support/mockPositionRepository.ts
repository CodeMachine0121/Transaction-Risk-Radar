import { vi } from 'vitest';
import type { Position } from '@/domain/entity/position';
import type { IPositionRepository } from '@/domain/interface/iPositionRepository';
import type { PositionSnapshotRecord } from '@/domain/vo/positionSnapshotRecord';
import type { TraderFill } from '@/domain/vo/traderFill';

export const createMockPositionRepository = (): IPositionRepository => ({
  saveFills: vi
    .fn<(traderAddress: string, fills: TraderFill[]) => Promise<void>>()
    .mockResolvedValue(undefined),
  saveSnapshots: vi
    .fn<(traderAddress: string, snapshots: PositionSnapshotRecord[]) => Promise<void>>()
    .mockResolvedValue(undefined),
  findPositions: vi.fn<(traderAddress: string) => Promise<Position[]>>().mockResolvedValue([]),
});
