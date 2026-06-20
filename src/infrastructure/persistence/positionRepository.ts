import Decimal from 'decimal.js';
import type {
  PositionActivity as PositionActivityRow,
  PositionSnapshot as PositionSnapshotRow,
  PrismaClient,
} from '@prisma/client';
import { Position } from '../../domain/entity/position';
import type { IPositionRepository } from '../../domain/interface/iPositionRepository';
import type { CurrentOpenPosition } from '../../domain/vo/currentOpenPosition';
import type { PositionSnapshot } from '../../domain/vo/positionSnapshot';
import type { PositionSnapshotRecord } from '../../domain/vo/positionSnapshotRecord';
import { Provider } from '../../domain/vo/provider';
import type { TraderActivity } from '../../domain/vo/traderActivity';

const toPrismaProvider = (value: Provider): 'hyperliquid' | 'okx' =>
  value === Provider.Okx ? 'okx' : 'hyperliquid';

const toTraderActivity = (row: PositionActivityRow): TraderActivity => ({
  coin: row.coin,
  price: new Decimal(row.price.toString()),
  signedSize: new Decimal(row.signedSize.toString()),
  signedSizeBefore: new Decimal(row.signedSizeBefore.toString()),
  realizedProfitAndLoss: new Decimal(row.realizedProfitAndLoss.toString()),
  occurredAt: row.occurredAt.getTime(),
  sourceReference: row.sourceReference,
});

/**
 * Repository（Position entity）：寫入倉位變動腿（去重）與浮虧快照；
 * 讀取時以 Position.reconstruct 重建倉位，再依「標的 + 時間窗」掛回 snapshot。
 */
export class PositionRepository implements IPositionRepository {
  private readonly prismaClient: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient;
  }

  async saveActivities(
    provider: Provider,
    traderAddress: string,
    activities: TraderActivity[],
  ): Promise<void> {
    if (activities.length === 0) {
      return;
    }
    await this.prismaClient.positionActivity.createMany({
      data: activities.map((activity) => ({
        provider: toPrismaProvider(provider),
        sourceReference: activity.sourceReference,
        traderAddress,
        coin: activity.coin,
        price: activity.price.toString(),
        signedSize: activity.signedSize.toString(),
        signedSizeBefore: activity.signedSizeBefore.toString(),
        realizedProfitAndLoss: activity.realizedProfitAndLoss.toString(),
        occurredAt: new Date(activity.occurredAt),
      })),
      skipDuplicates: true, // 以 (provider, sourceReference) (PK) 去重
    });
  }

  async saveSnapshots(
    provider: Provider,
    traderAddress: string,
    snapshots: PositionSnapshotRecord[],
  ): Promise<void> {
    if (snapshots.length === 0) {
      return;
    }
    const capturedAt = new Date();
    await this.prismaClient.positionSnapshot.createMany({
      data: snapshots.map((snapshot) => ({
        provider: toPrismaProvider(provider),
        traderAddress,
        coin: snapshot.coin,
        signedSize: snapshot.signedSize.toString(),
        markPrice: snapshot.markPrice.toString(),
        unrealizedProfitAndLossPercentage: snapshot.unrealizedProfitAndLossPercentage.toString(),
        margin: snapshot.margin.toString(),
        leverage: snapshot.leverage.toString(),
        capturedAt,
      })),
    });
  }

  async findCurrentOpenPositions(
    provider: Provider,
    traderAddresses: string[],
    freshAfter: number,
  ): Promise<CurrentOpenPosition[]> {
    if (traderAddresses.length === 0) {
      return [];
    }
    const rows = await this.prismaClient.positionSnapshot.findMany({
      where: {
        provider: toPrismaProvider(provider),
        traderAddress: { in: traderAddresses },
        capturedAt: { gte: new Date(freshAfter) },
      },
      orderBy: { capturedAt: 'desc' },
    });
    // rows 依 capturedAt 遞減：每個 (traderAddress, coin) 首見即最新（決定當前持倉），
    // 並沿途更新窗內最早 capturedAt 作 firstObservedAt；已平倉（signedSize=0）排除。
    const byKey = new Map<string, { row: PositionSnapshotRow; firstObservedAt: number }>();
    for (const row of rows) {
      const key = `${row.traderAddress}:${row.coin}`;
      const existing = byKey.get(key);
      const capturedAt = row.capturedAt.getTime();
      if (existing === undefined) {
        byKey.set(key, { row, firstObservedAt: capturedAt });
      } else if (capturedAt < existing.firstObservedAt) {
        existing.firstObservedAt = capturedAt;
      }
    }
    const current: CurrentOpenPosition[] = [];
    for (const { row, firstObservedAt } of byKey.values()) {
      const signedSize = new Decimal(row.signedSize.toString());
      if (signedSize.isZero()) {
        continue;
      }
      const markPrice = new Decimal(row.markPrice.toString());
      current.push({
        traderAddress: row.traderAddress,
        coin: row.coin,
        signedSize,
        leverage: new Decimal(row.leverage.toString()),
        positionNotional: signedSize.abs().times(markPrice),
        capturedAt: row.capturedAt.getTime(),
        firstObservedAt,
      });
    }
    return current;
  }

  async latestActivityTimestamp(provider: Provider, traderAddress: string): Promise<number | null> {
    const result = await this.prismaClient.positionActivity.aggregate({
      where: { provider: toPrismaProvider(provider), traderAddress },
      _max: { occurredAt: true },
    });
    return result._max.occurredAt?.getTime() ?? null;
  }

  async findPositions(provider: Provider, traderAddress: string): Promise<Position[]> {
    const activityRows = await this.prismaClient.positionActivity.findMany({
      where: { provider: toPrismaProvider(provider), traderAddress },
      orderBy: { occurredAt: 'asc' },
    });
    const positions = Position.reconstruct(activityRows.map(toTraderActivity));

    const snapshotRows = await this.prismaClient.positionSnapshot.findMany({
      where: { provider: toPrismaProvider(provider), traderAddress },
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
