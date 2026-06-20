import Decimal from 'decimal.js';
import type { PrismaClient, TraderMetrics as TraderMetricsRow } from '@prisma/client';
import { Trader } from '../../domain/entity/trader';
import type { ITraderRepository } from '../../domain/interface/iTraderRepository';
import { Provider } from '../../domain/vo/provider';
import type { TraderKey } from '../../domain/vo/traderKey';
import type { TraderMetrics } from '../../domain/vo/traderMetrics';

const toDomainProvider = (value: string): Provider =>
  value === 'okx' ? Provider.Okx : Provider.Hyperliquid;
const toPrismaProvider = (value: Provider): 'hyperliquid' | 'okx' =>
  value === Provider.Okx ? 'okx' : 'hyperliquid';

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
  return Trader.fromStoredMetrics(toDomainProvider(row.provider), row.traderAddress, metrics);
};

/** Repository（Trader entity）：以 Prisma 管理追蹤名單與 trader_metrics 的讀寫。 */
export class TraderRepository implements ITraderRepository {
  private readonly prismaClient: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient;
  }

  async saveTraders(provider: Provider, traderAddresses: string[]): Promise<void> {
    if (traderAddresses.length === 0) {
      return;
    }
    await this.prismaClient.trader.createMany({
      data: traderAddresses.map((address) => ({ provider: toPrismaProvider(provider), address })),
      skipDuplicates: true,
    });
  }

  async findAllTraderKeys(): Promise<TraderKey[]> {
    const rows = await this.prismaClient.trader.findMany({
      select: { provider: true, address: true },
    });
    return rows.map((row) => ({ provider: toDomainProvider(row.provider), address: row.address }));
  }

  async findRankableTraders(provider?: Provider): Promise<Trader[]> {
    const rows = await this.prismaClient.traderMetrics.findMany({
      where: {
        insufficientData: false,
        ...(provider === undefined ? {} : { provider: toPrismaProvider(provider) }),
      },
    });
    return rows.map(toTrader);
  }

  async findAllTraders(provider?: Provider): Promise<Trader[]> {
    const rows = await this.prismaClient.traderMetrics.findMany({
      where: provider === undefined ? {} : { provider: toPrismaProvider(provider) },
    });
    return rows.map(toTrader);
  }

  async findTrader(provider: Provider, traderAddress: string): Promise<Trader | null> {
    const row = await this.prismaClient.traderMetrics.findUnique({
      where: { provider_traderAddress: { provider: toPrismaProvider(provider), traderAddress } },
    });
    return row === null ? null : toTrader(row);
  }

  async saveTraderMetrics(trader: Trader): Promise<void> {
    const metrics = trader.metricsSnapshot();
    const provider = toPrismaProvider(trader.provider());
    const traderAddress = trader.address();
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
      where: { provider_traderAddress: { provider, traderAddress } },
      create: { provider, traderAddress, ...data },
      update: data,
    });
  }
}
