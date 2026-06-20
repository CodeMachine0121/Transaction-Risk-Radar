import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { SnapshotConsensusApplication } from '@/application/snapshotConsensusApplication';
import { SafeCohortConsensusService } from '@/domain/service/safeCohortConsensusService';
import { SnapshotConsensusService } from '@/domain/service/snapshotConsensusService';
import type { CurrentOpenPosition } from '@/domain/vo/currentOpenPosition';
import { createMockConsensusSnapshotRepository } from './support/mockConsensusSnapshotRepository';
import { buildTrader, createMockTraderRepository } from './support/mockTraderRepository';
import { createMockPositionRepository } from './support/mockPositionRepository';

const position = (traderAddress: string, coin: string, signedSize: number): CurrentOpenPosition => ({
  traderAddress,
  coin,
  signedSize: new Decimal(signedSize),
  leverage: new Decimal(10),
  positionNotional: new Decimal(Math.abs(signedSize) * 100),
  capturedAt: 1000,
  firstObservedAt: 1000,
});

describe('SnapshotConsensusApplication', () => {
  it('persists each consensus coin as a snapshot record', async () => {
    const traders = createMockTraderRepository();
    vi.mocked(traders.findRankableTraders).mockResolvedValue([
      buildTrader('A', 0),
      buildTrader('B', 0),
      buildTrader('C', 0),
    ]);
    const positions = createMockPositionRepository();
    vi.mocked(positions.findCurrentOpenPositions).mockResolvedValue([
      position('A', 'BTC', 1),
      position('B', 'BTC', 1),
      position('C', 'BTC', 1),
    ]);
    const consensusSnapshots = createMockConsensusSnapshotRepository();
    const service = new SnapshotConsensusService(
      new SafeCohortConsensusService(traders, positions, { freshnessWindowMilliseconds: 60_000 }),
      consensusSnapshots,
    );
    const application = new SnapshotConsensusApplication(service);

    await application.snapshot({});

    expect(consensusSnapshots.saveConsensusSnapshots).toHaveBeenCalledTimes(1);
    const [records] = vi.mocked(consensusSnapshots.saveConsensusSnapshots).mock.calls[0] ?? [];
    expect(records?.[0]?.coin).toBe('BTC');
    expect(records?.[0]?.participantCount).toBe(3);
    expect(records?.[0]?.convictionWeightedDirectionBias.toString()).toBe('1'); // 全多
  });
});
