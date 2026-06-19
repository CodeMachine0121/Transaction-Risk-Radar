import Decimal from 'decimal.js';
import type { PrismaClient, TraderMetrics as TraderMetricsRow } from '@prisma/client';
import { Trader } from '../../domain/entity/trader';
import type { ITraderMetricsRepository } from '../../domain/interface/iTraderMetricsRepository';
import type { TraderMetrics } from '../../domain/vo/traderMetrics';

const toDomainDecimal = (value: { toString(): string } | null): Decimal | null =>
  value === null ? null : new Decimal(value.toString());

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

/** Repository：以 Prisma 讀取 trader_metrics，hydrate 成 Trader entity。 */
export class TraderMetricsRepository implements ITraderMetricsRepository {
  private readonly prismaClient: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient;
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
}
