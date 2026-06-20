import Decimal from 'decimal.js';
import type { PrismaClient, TraderMetrics as TraderMetricsRow } from '@prisma/client';
import { Trader } from '../../domain/entity/trader';
import type { ITraderRepository } from '../../domain/interface/iTraderRepository';
import type { TraderMetrics } from '../../domain/vo/traderMetrics';

const toDomainDecimal = (value: { toString(): string } | null): Decimal | null =>
  value === null ? null : new Decimal(value.toString());

const toNullableString = (value: Decimal | null): string | null =>
  value === null ? null : value.toString();

const toTrader = (row: TraderMetricsRow): Trader => {
  const metrics: TraderMetrics = {
    maxAdverseExcursionPercentile90: toDomainDecimal(row.maxAdverseExcursionPercentile90),
    averagingDownRatio: toDomainDecimal(row.averagingDownRatio),
    winRate: toDomainDecimal(row.winRate),
    realizedProfitAndLoss: toDomainDecimal(row.realizedProfitAndLoss),
    returnDownsideDeviation: toDomainDecimal(row.returnDownsideDeviation),
    averageLeverage: toDomainDecimal(row.averageLeverage),
    trapSignal: toDomainDecimal(row.trapSignal),
    riskScore: toDomainDecimal(row.riskScore),
    closedPositionCount: row.closedPositionCount,
    insufficientData: row.insufficientData,
  };
  return Trader.fromStoredMetrics(row.traderAddress, metrics);
};

/** Repository（Trader entity）：以 Prisma 管理追蹤名單與 trader_metrics 的讀寫。 */
export class TraderRepository implements ITraderRepository {
  private readonly prismaClient: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient;
  }

  async saveTraders(traderAddresses: string[]): Promise<void> {
    if (traderAddresses.length === 0) {
      return;
    }
    await this.prismaClient.trader.createMany({
      data: traderAddresses.map((address) => ({ address })),
      skipDuplicates: true,
    });
  }

  async findAllAddresses(): Promise<string[]> {
    const rows = await this.prismaClient.trader.findMany({ select: { address: true } });
    return rows.map((row) => row.address);
  }

  async findRankableTraders(): Promise<Trader[]> {
    const rows = await this.prismaClient.traderMetrics.findMany({
      where: { insufficientData: false },
    });
    return rows.map(toTrader);
  }

  async findTraderByAddress(traderAddress: string): Promise<Trader | null> {
    const row = await this.prismaClient.traderMetrics.findUnique({ where: { traderAddress } });
    return row === null ? null : toTrader(row);
  }

  async saveTraderMetrics(trader: Trader): Promise<void> {
    const metrics = trader.metricsSnapshot();
    const data = {
      maxAdverseExcursionPercentile90: toNullableString(metrics.maxAdverseExcursionPercentile90),
      averagingDownRatio: toNullableString(metrics.averagingDownRatio),
      winRate: toNullableString(metrics.winRate),
      realizedProfitAndLoss: toNullableString(metrics.realizedProfitAndLoss),
      returnDownsideDeviation: toNullableString(metrics.returnDownsideDeviation),
      averageLeverage: toNullableString(metrics.averageLeverage),
      trapSignal: toNullableString(metrics.trapSignal),
      riskScore: toNullableString(metrics.riskScore),
      closedPositionCount: metrics.closedPositionCount,
      insufficientData: metrics.insufficientData,
    };
    await this.prismaClient.traderMetrics.upsert({
      where: { traderAddress: trader.address() },
      create: { traderAddress: trader.address(), ...data },
      update: data,
    });
  }
}
