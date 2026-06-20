import Decimal from 'decimal.js';
import type { PrismaClient } from '@prisma/client';
import type { IConsensusSnapshotRepository } from '../../domain/interface/iConsensusSnapshotRepository';
import type { ConsensusSnapshotPoint } from '../../domain/vo/consensusSnapshotPoint';
import type { ConsensusSnapshotRecord } from '../../domain/vo/consensusSnapshotRecord';

/** Repository（ConsensusSnapshot）：留存每輪共識時序、依 coin+時間讀回序列供回測。 */
export class ConsensusSnapshotRepository implements IConsensusSnapshotRepository {
  private readonly prismaClient: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient;
  }

  async saveConsensusSnapshots(records: ConsensusSnapshotRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }
    const capturedAt = new Date();
    await this.prismaClient.consensusSnapshot.createMany({
      data: records.map((record) => ({
        coin: record.coin,
        netDirectionBias: record.netDirectionBias.toString(),
        convictionWeightedDirectionBias: record.convictionWeightedDirectionBias.toString(),
        consensusStrength: record.consensusStrength.toString(),
        maxConvictionShare: record.maxConvictionShare.toString(),
        participantCount: record.participantCount,
        capturedAt,
      })),
    });
  }

  async loadConsensusSeries(coin: string, since: number): Promise<ConsensusSnapshotPoint[]> {
    const rows = await this.prismaClient.consensusSnapshot.findMany({
      where: { coin, capturedAt: { gte: new Date(since) } },
      orderBy: { capturedAt: 'asc' },
    });
    return rows.map((row) => ({
      coin: row.coin,
      convictionWeightedDirectionBias: new Decimal(row.convictionWeightedDirectionBias.toString()),
      consensusStrength: new Decimal(row.consensusStrength.toString()),
      capturedAt: row.capturedAt.getTime(),
    }));
  }
}
