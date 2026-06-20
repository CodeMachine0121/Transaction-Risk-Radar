import Decimal from 'decimal.js';
import type {
  PositionFill as PositionFillRow,
  PositionSnapshot as PositionSnapshotRow,
  PrismaClient,
} from '@prisma/client';
import { Position } from '../../domain/entity/position';
import type { ITraderPositionRepository } from '../../domain/interface/iTraderPositionRepository';
import type { PositionSnapshot } from '../../domain/vo/positionSnapshot';
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
 * Repository：載入交易員倉位。由原始成交以 Position.reconstruct 重建，
 * 再依「標的 + 時間窗」把 snapshot 掛回對應倉位。
 */
export class TraderPositionRepository implements ITraderPositionRepository {
  private readonly prismaClient: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient;
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
