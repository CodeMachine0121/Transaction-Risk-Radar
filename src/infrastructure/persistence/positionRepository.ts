import Decimal from 'decimal.js';
import type {
  PositionFill as PositionFillRow,
  PositionSnapshot as PositionSnapshotRow,
  PrismaClient,
} from '@prisma/client';
import { Position } from '../../domain/entity/position';
import type { IPositionRepository } from '../../domain/interface/iPositionRepository';
import type { PositionSnapshot } from '../../domain/vo/positionSnapshot';
import type { PositionSnapshotRecord } from '../../domain/vo/positionSnapshotRecord';
import type { TraderFill } from '../../domain/vo/traderFill';

const toTraderFill = (row: PositionFillRow): TraderFill => ({
  coin: row.coin,
  price: new Decimal(row.price.toString()),
  size: new Decimal(row.size.toString()),
  side: row.side,
  timestamp: row.occurredAt.getTime(),
  startPosition: new Decimal(row.startPosition.toString()),
  direction: row.direction,
  closedProfitAndLoss: new Decimal(row.closedProfitAndLoss.toString()),
  tradeId: Number(row.tradeId),
  hash: row.hash,
});

/**
 * Repository（Position entity）：寫入原始成交（去重）與浮虧快照；
 * 讀取時以 Position.reconstruct 重建倉位，再依「標的 + 時間窗」掛回 snapshot。
 */
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

  async latestObservedFillTimestamp(traderAddress: string): Promise<number | null> {
    const result = await this.prismaClient.positionFill.aggregate({
      where: { traderAddress },
      _max: { occurredAt: true },
    });
    return result._max.occurredAt?.getTime() ?? null;
  }

  async findPositions(traderAddress: string): Promise<Position[]> {
    const fillRows = await this.prismaClient.positionFill.findMany({
      where: { traderAddress },
      orderBy: { occurredAt: 'asc' },
    });
    const positions = Position.reconstruct(fillRows.map(toTraderFill));

    const snapshotRows = await this.prismaClient.positionSnapshot.findMany({
      where: { traderAddress },
      orderBy: { capturedAt: 'asc' },
    });
    return positions.map((position) =>
      position.withSnapshots(this.snapshotsWithinWindow(position, snapshotRows)),
    );
  }

  private snapshotsWithinWindow(
    position: Position,
    snapshotRows: PositionSnapshotRow[],
  ): PositionSnapshot[] {
    const openedAt = position.openedAt();
    const closedAt = position.closedAt();
    return snapshotRows
      .filter((row) => {
        if (row.coin !== position.coin()) {
          return false;
        }
        const capturedAt = row.capturedAt.getTime();
        return capturedAt >= openedAt && (closedAt === null || capturedAt <= closedAt);
      })
      .map((row) => ({
        unrealizedProfitAndLossPercentage: new Decimal(
          row.unrealizedProfitAndLossPercentage.toString(),
        ),
        leverage: new Decimal(row.leverage.toString()),
      }));
  }
}
