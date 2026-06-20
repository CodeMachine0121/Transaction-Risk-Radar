import { PollTraderApplication } from './application/pollTraderApplication';
import { RecomputeTraderMetricsApplication } from './application/recomputeTraderMetricsApplication';
import { SyncLeaderboardApplication } from './application/syncLeaderboardApplication';
import type { ITraderDataProxy } from './domain/interface/iTraderDataProxy';
import { PollTraderService } from './domain/service/pollTraderService';
import { RecomputeTraderMetricsService } from './domain/service/recomputeTraderMetricsService';
import { SyncLeaderboardService } from './domain/service/syncLeaderboardService';
import { HyperliquidProxy } from './infrastructure/hyperliquid/hyperliquidProxy';
import { OkxProxy } from './infrastructure/okx/okxProxy';
import { createPrismaClient } from './infrastructure/persistence/prismaClient';
import { PositionRepository } from './infrastructure/persistence/positionRepository';
import { TraderRepository } from './infrastructure/persistence/traderRepository';
import { Scheduler, type ProviderPipeline } from './infrastructure/scheduler/scheduler';
import { RequestWeightLimiter } from './shared/rateLimit/requestWeightLimiter';

// 背景 worker 組裝根：建立實作並注入，啟動 BullMQ 排程。
const prismaClient = createPrismaClient(process.env.DATABASE_URL ?? '');

const traderRepository = new TraderRepository(prismaClient);
const positionRepository = new PositionRepository(prismaClient);

const maximumTraders = Number(process.env.MAXIMUM_TRADERS ?? '200');
const ninetyDaysMilliseconds = 90 * 24 * 60 * 60 * 1000;
const lookbackMilliseconds = Number(process.env.POLL_LOOKBACK_MS ?? `${ninetyDaysMilliseconds}`);
const backoff = {
  maximumRetryCount: Number(process.env.BACKOFF_MAXIMUM_RETRY_COUNT ?? '5'),
  baseDelayMilliseconds: Number(process.env.BACKOFF_BASE_DELAY_MS ?? '500'),
  maximumDelayMilliseconds: Number(process.env.BACKOFF_MAXIMUM_DELAY_MS ?? '30000'),
};

/** 由一個 provider 的 proxy 組出其攝取管線（sync + poll）。 */
const buildPipeline = (proxy: ITraderDataProxy): ProviderPipeline => ({
  provider: proxy.provider,
  syncLeaderboardApplication: new SyncLeaderboardApplication(
    new SyncLeaderboardService(proxy, traderRepository, { maximumTraders }),
  ),
  pollTraderApplication: new PollTraderApplication(
    new PollTraderService(proxy, positionRepository, { lookbackMilliseconds }),
  ),
});

const hyperliquidProxy = new HyperliquidProxy({
  infoApiBaseUrl: process.env.HYPERLIQUID_API_BASE_URL ?? 'https://api.hyperliquid.xyz',
  statsDataBaseUrl:
    process.env.HYPERLIQUID_STATS_DATA_BASE_URL ?? 'https://stats-data.hyperliquid.xyz',
  requestWeightLimiter: new RequestWeightLimiter({
    maximumWeightPerInterval: Number(process.env.REQUEST_WEIGHT_BUDGET ?? '1200'),
    intervalMilliseconds: Number(process.env.REQUEST_WEIGHT_INTERVAL_MS ?? '60000'),
  }),
  backoff,
});

const okxProxy = new OkxProxy({
  apiBaseUrl: process.env.OKX_API_BASE_URL ?? 'https://www.okx.com',
  requestWeightLimiter: new RequestWeightLimiter({
    maximumWeightPerInterval: Number(process.env.OKX_REQUEST_BUDGET ?? '10'),
    intervalMilliseconds: Number(process.env.OKX_REQUEST_INTERVAL_MS ?? '2000'),
  }),
  backoff,
});

const recomputeTraderMetricsApplication = new RecomputeTraderMetricsApplication(
  new RecomputeTraderMetricsService(positionRepository, traderRepository),
);

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || '6379'),
  ...(redisUrl.password === '' ? {} : { password: redisUrl.password }),
  ...(redisUrl.username === '' ? {} : { username: redisUrl.username }),
};

const scheduler = new Scheduler(
  {
    providers: [buildPipeline(hyperliquidProxy), buildPipeline(okxProxy)],
    recomputeTraderMetricsApplication,
    traderRepository,
  },
  {
    connection,
    syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS ?? `${60 * 60 * 1000}`),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? `${30 * 1000}`),
    recomputeIntervalMs: Number(process.env.RECOMPUTE_INTERVAL_MS ?? `${5 * 60 * 1000}`),
  },
);

await scheduler.start();
