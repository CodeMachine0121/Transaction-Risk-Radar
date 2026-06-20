import type { PrismaClient } from '@prisma/client';
import type { IPositionRepository } from '../../domain/interface/iPositionRepository';
import type { PositionSnapshotRecord } from '../../domain/vo/positionSnapshotRecord';
import type { TraderFill } from '../../domain/vo/traderFill';

/** Repository：以 Prisma 寫入原始成交（去重）與浮虧快照。 */
export class PositionRepository implements IPositionRepository {
  private readonly prismaClient: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient;
  }

  async saveFills(traderAddress: string, fills: TraderFill[]): Promise<void> {
    if (fills.length === 0) {
      return;
    }
    await this.prismaClient.positionFill.createMany({
      data: fills.map((fill) => ({
        tradeId: BigInt(fill.tradeId),
        traderAddress,
        coin: fill.coin,
        side: fill.side,
        price: fill.price.toString(),
        size: fill.size.toString(),
        startPosition: fill.startPosition.toString(),
        direction: fill.direction,
        closedProfitAndLoss: fill.closedProfitAndLoss.toString(),
        occurredAt: new Date(fill.timestamp),
        hash: fill.hash,
      })),
      skipDuplicates: true, // 以 tradeId (PK) 去重
    });
  }

  async saveSnapshots(traderAddress: string, snapshots: PositionSnapshotRecord[]): Promise<void> {
    if (snapshots.length === 0) {
      return;
    }
    const capturedAt = new Date();
    await this.prismaClient.positionSnapshot.createMany({
      data: snapshots.map((snapshot) => ({
        traderAddress,
        coin: snapshot.coin,
        markPrice: snapshot.markPrice.toString(),
        unrealizedProfitAndLossPercentage: snapshot.unrealizedProfitAndLossPercentage.toString(),
        margin: snapshot.margin.toString(),
        leverage: snapshot.leverage.toString(),
        capturedAt,
      })),
    });
  }
}
