import { ConsensusSnapshotRepository } from './infrastructure/persistence/consensusSnapshotRepository';
import { PositionRepository } from './infrastructure/persistence/positionRepository';
import { createPrismaClient } from './infrastructure/persistence/prismaClient';
import { TraderRepository } from './infrastructure/persistence/traderRepository';
import { PriceProxy } from './infrastructure/hyperliquid/priceProxy';
import { buildServer } from './server';

/** 解析 BACKTEST_HORIZONS_HOURS（逗號分隔小時）為正數陣列；非法值略過。 */
const parseHorizonsHoursEnv = (raw: string | undefined): number[] => {
  if (raw === undefined || raw === '') {
    return [];
  }
  return raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
};

// 組裝根 (composition root)：在此選定具體實作並注入。
const connectionString = process.env.DATABASE_URL ?? '';
const prismaClient = createPrismaClient(connectionString);
const repository = new TraderRepository(prismaClient);
const positionRepository = new PositionRepository(prismaClient);
const pollIntervalMilliseconds = Number(process.env.POLL_INTERVAL_MS ?? `${30 * 1000}`);
const backtestToken = process.env.BACKTEST_API_TOKEN;
const server = buildServer(repository, positionRepository, {
  logger: true,
  consensusFreshnessWindowMilliseconds: 2 * pollIntervalMilliseconds,
  backtest: {
    consensusSnapshotRepository: new ConsensusSnapshotRepository(prismaClient),
    priceProxy: new PriceProxy({
      infoApiBaseUrl: process.env.HYPERLIQUID_API_BASE_URL ?? 'https://api.hyperliquid.xyz',
    }),
    ...(backtestToken === undefined ? {} : { token: backtestToken }),
    defaultHorizonsHours: parseHorizonsHoursEnv(process.env.BACKTEST_HORIZONS_HOURS),
  },
});

const port = Number(process.env.PORT ?? '3000');

try {
  await server.listen({ port, host: '0.0.0.0' });
} catch (error) {
  server.log.error({ error }, 'failed to start server');
  process.exit(1);
}
