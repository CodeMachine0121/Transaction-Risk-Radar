import type Decimal from 'decimal.js';
import type { PrismaClient } from '@prisma/client';
import type { ITraderMetricsWriter } from '../../domain/interface/iTraderMetricsWriter';
import type { TraderMetrics } from '../../domain/vo/traderMetrics';

const toNullableString = (value: Decimal | null): string | null =>
  value === null ? null : value.toString();

/** Repository（寫入端）：upsert 交易員彙總指標到 trader_metrics。 */
export class TraderMetricsWriter implements ITraderMetricsWriter {
  private readonly prismaClient: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient;
  }

  async saveTraderMetrics(traderAddress: string, metrics: TraderMetrics): Promise<void> {
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
      where: { traderAddress },
      create: { traderAddress, ...data },
      update: data,
    });
  }
}
