import Decimal from 'decimal.js';
import type { PrismaClient, TraderMetrics } from '@prisma/client';
import type { ITraderMetricsRepository } from '../../domain/interface/iTraderMetricsRepository';
import type { TraderRiskSummary } from '../../domain/ranking/traderRiskSummary';

const toDomainDecimal = (value: { toString(): string } | null): Decimal | null =>
  value === null ? null : new Decimal(value.toString());

const toTraderRiskSummary = (row: TraderMetrics): TraderRiskSummary => ({
  traderAddress: row.traderAddress,
  insufficientData: row.insufficientData,
  closedPositionCount: row.closedPositionCount,
  riskScore: toDomainDecimal(row.riskScore),
  maxAdverseExcursionPercentile90: toDomainDecimal(row.maxAdverseExcursionPercentile90),
  averagingDownRatio: toDomainDecimal(row.averagingDownRatio),
  winRate: toDomainDecimal(row.winRate),
  realizedProfitAndLoss: toDomainDecimal(row.realizedProfitAndLoss),
  returnDownsideDeviation: toDomainDecimal(row.returnDownsideDeviation),
  averageLeverage: toDomainDecimal(row.averageLeverage),
  trapSignal: toDomainDecimal(row.trapSignal),
});

/** Repository：以 Prisma Client 讀取 trader_metrics，並將 Prisma.Decimal 轉為 domain 的 decimal.js Decimal。 */
export class TraderMetricsRepository implements ITraderMetricsRepository {
  private readonly prismaClient: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient;
  }

  async findRankableSummaries(): Promise<TraderRiskSummary[]> {
    const rows = await this.prismaClient.traderMetrics.findMany({
      where: { insufficientData: false },
    });
    return rows.map(toTraderRiskSummary);
  }

  async findSummaryByAddress(traderAddress: string): Promise<TraderRiskSummary | null> {
    const row = await this.prismaClient.traderMetrics.findUnique({ where: { traderAddress } });
    return row === null ? null : toTraderRiskSummary(row);
  }
}
