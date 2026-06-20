import { PollTraderApplication } from './application/pollTraderApplication';
import { RecomputeTraderMetricsApplication } from './application/recomputeTraderMetricsApplication';
import { SyncLeaderboardApplication } from './application/syncLeaderboardApplication';
import { PollTraderService } from './domain/service/pollTraderService';
import { RecomputeTraderMetricsService } from './domain/service/recomputeTraderMetricsService';
import { SyncLeaderboardService } from './domain/service/syncLeaderboardService';
import { HyperliquidProxy } from './infrastructure/hyperliquid/hyperliquidProxy';
import { createPrismaClient } from './infrastructure/persistence/prismaClient';
import { PositionRepository } from './infrastructure/persistence/positionRepository';
import { TraderMetricsWriter } from './infrastructure/persistence/traderMetricsWriter';
import { TraderPositionRepository } from './infrastructure/persistence/traderPositionRepository';
import { TraderRepository } from './infrastructure/persistence/traderRepository';
import { Scheduler } from './infrastructure/scheduler/scheduler';

// 背景 worker 組裝根：建立實作並注入，啟動 BullMQ 排程。
const prismaClient = createPrismaClient(process.env.DATABASE_URL ?? '');

const traderRepository = new TraderRepository(prismaClient);
const positionRepository = new PositionRepository(prismaClient);
const traderPositionRepository = new TraderPositionRepository(prismaClient);
const traderMetricsWriter = new TraderMetricsWriter(prismaClient);
const hyperliquidProxy = new HyperliquidProxy({
  infoApiBaseUrl: process.env.HYPERLIQUID_API_BASE_URL ?? 'https://api.hyperliquid.xyz',
  statsDataBaseUrl:
    process.env.HYPERLIQUID_STATS_DATA_BASE_URL ?? 'https://stats-data.hyperliquid.xyz',
});

const syncLeaderboardApplication = new SyncLeaderboardApplication(
  new SyncLeaderboardService(hyperliquidProxy, traderRepository, {
    maximumTraders: Number(process.env.MAXIMUM_TRADERS ?? '200'),
  }),
);
const pollTraderApplication = new PollTraderApplication(
  new PollTraderService(hyperliquidProxy, positionRepository),
);
const recomputeTraderMetricsApplication = new RecomputeTraderMetricsApplication(
  new RecomputeTraderMetricsService(traderPositionRepository, traderMetricsWriter),
);

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || '6379'),
  ...(redisUrl.password === '' ? {} : { password: redisUrl.password }),
  ...(redisUrl.username === '' ? {} : { username: redisUrl.username }),
};

const ninetyDaysMilliseconds = 90 * 24 * 60 * 60 * 1000;
const scheduler = new Scheduler(
  {
    syncLeaderboardApplication,
    pollTraderApplication,
    recomputeTraderMetricsApplication,
    traderRepository,
  },
  {
    connection,
    syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS ?? `${60 * 60 * 1000}`),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? `${30 * 1000}`),
    recomputeIntervalMs: Number(process.env.RECOMPUTE_INTERVAL_MS ?? `${5 * 60 * 1000}`),
    pollLookbackMs: Number(process.env.POLL_LOOKBACK_MS ?? `${ninetyDaysMilliseconds}`),
  },
);

await scheduler.start();
