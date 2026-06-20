import Decimal from 'decimal.js';
import type { PrismaClient, TraderMetrics as TraderMetricsRow } from '@prisma/client';
import { Trader } from '../../domain/entity/trader';
import type { ITraderRepository } from '../../domain/interface/iTraderRepository';
import type { AccountStats } from '../../domain/vo/accountStats';
import { Provider } from '../../domain/vo/provider';
import type { RiskScoreTier } from '../../domain/vo/riskScoreTier';
import type { TraderKey } from '../../domain/vo/traderKey';
import type { TraderMetrics } from '../../domain/vo/traderMetrics';

const toDomainTier = (value: string): RiskScoreTier => (value === 'account' ? 'account' : 'position');

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
    riskScoreTier: toDomainTier(row.riskScoreTier),
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
        // 帳戶級（粗版）風險不參與排行，只在 /traders 顯示。
        riskScoreTier: 'position',
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
      riskScoreTier: metrics.riskScoreTier,
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

  async saveAccountStats(
    provider: Provider,
    address: string,
    stats: AccountStats,
  ): Promise<void> {
    const data = {
      winRatio: stats.winRatio.toString(),
      returnSeries: stats.returnSeries.map((value) => value.toString()),
    };
    await this.prismaClient.traderAccountStats.upsert({
      where: { provider_address: { provider: toPrismaProvider(provider), address } },
      create: { provider: toPrismaProvider(provider), address, ...data },
      update: data,
    });
  }

  async findAccountStats(provider: Provider, address: string): Promise<AccountStats | null> {
    const row = await this.prismaClient.traderAccountStats.findUnique({
      where: { provider_address: { provider: toPrismaProvider(provider), address } },
    });
    if (row === null) {
      return null;
    }
    return {
      winRatio: new Decimal(row.winRatio.toString()),
      returnSeries: row.returnSeries.map((value) => new Decimal(value)),
    };
  }
}
