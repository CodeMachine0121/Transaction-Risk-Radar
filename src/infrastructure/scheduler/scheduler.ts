import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { PollTraderApplication } from '../../application/pollTraderApplication';
import type { RecomputeTraderMetricsApplication } from '../../application/recomputeTraderMetricsApplication';
import type { SnapshotConsensusApplication } from '../../application/snapshotConsensusApplication';
import type { SyncLeaderboardApplication } from '../../application/syncLeaderboardApplication';
import type { ITraderRepository } from '../../domain/interface/iTraderRepository';
import type { Provider } from '../../domain/vo/provider';
import type { TraderKey } from '../../domain/vo/traderKey';

/** 單一 provider 的攝取管線（sync + poll，各自綁定該 provider 的 proxy）。 */
export type ProviderPipeline = {
  provider: Provider;
  syncLeaderboardApplication: SyncLeaderboardApplication;
  pollTraderApplication: PollTraderApplication;
};

export type SchedulerApplications = {
  /** 每個 provider 一條管線；跨 provider 平行執行、彼此隔離。 */
  providers: ProviderPipeline[];
  /** recompute 與來源無關（只讀 DB），以 (provider, address) 重算。 */
  recomputeTraderMetricsApplication: RecomputeTraderMetricsApplication;
  traderRepository: ITraderRepository;
  /** 選用：recompute 後留存一輪共識時序（供回測）。未提供則略過。 */
  snapshotConsensusApplication?: SnapshotConsensusApplication;
};

export type SchedulerOptions = {
  connection: ConnectionOptions;
  syncIntervalMs: number;
  pollIntervalMs: number;
  recomputeIntervalMs: number;
  /** 單一 trader 處理失敗時的回報（不中斷整批）；未提供則寫 stderr。 */
  onTraderError?: (phase: 'poll' | 'recompute', traderAddress: string, error: Error) => void;
};

/**
 * 以 BullMQ 排程三條背景流程：同步 leaderboard、輪詢交易員、重算指標。
 * 多 provider：每條 phase 內以 Promise.allSettled 跨 provider 平行 + 失敗隔離。
 */
export class Scheduler {
  private readonly applications: SchedulerApplications;
  private readonly options: SchedulerOptions;
  private readonly queues: Queue[] = [];
  private readonly workers: Worker[] = [];

  constructor(applications: SchedulerApplications, options: SchedulerOptions) {
    this.applications = applications;
    this.options = options;
  }

  async start(): Promise<void> {
    await this.registerRepeatable('sync-leaderboard', this.options.syncIntervalMs, async () => {
      await this.syncAllProviders();
    });
    await this.registerRepeatable('poll-trader', this.options.pollIntervalMs, async () => {
      await this.pollAllTraders();
    });
    await this.registerRepeatable(
      'recompute-metrics',
      this.options.recomputeIntervalMs,
      async () => {
        await this.recomputeAllTraders();
      },
    );
    // 啟動即跑一輪，排行不必等第一個 interval 才有資料（見 PRD US-03/04/05 驗收）。
    await this.runInitialCycle();
  }

  async stop(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all(this.queues.map((queue) => queue.close()));
  }

  /**
   * 啟動時跨 provider 平行各跑一輪 sync → poll → recompute（彼此隔離）。
   * 單一 provider 的 sync 失敗只回報、跳過該 provider 本輪 poll/recompute，不影響其他 provider。
   */
  async runInitialCycle(): Promise<void> {
    await Promise.allSettled(
      this.applications.providers.map((pipeline) => this.runProviderInitialPipeline(pipeline)),
    );
    await this.snapshotConsensus();
  }

  private async runProviderInitialPipeline(pipeline: ProviderPipeline): Promise<void> {
    if (!(await this.syncProvider(pipeline))) {
      return;
    }
    const keys = await this.providerKeys(pipeline.provider);
    await this.pollProviderKeys(pipeline, keys);
    await this.recomputeKeys(keys);
  }

  /** sync 階段：跨 provider 平行 + 隔離。 */
  async syncAllProviders(): Promise<void> {
    await Promise.allSettled(
      this.applications.providers.map((pipeline) => this.syncProvider(pipeline)),
    );
  }

  /** poll 階段：跨 provider 平行 + 隔離；provider 內逐 trader（startTime 由 service 以 high-watermark 解析）。 */
  async pollAllTraders(): Promise<void> {
    const keys = await this.applications.traderRepository.findAllTraderKeys();
    await Promise.allSettled(
      this.applications.providers.map((pipeline) =>
        this.pollProviderKeys(
          pipeline,
          keys.filter((key) => key.provider === pipeline.provider),
        ),
      ),
    );
  }

  /** recompute 階段：與來源無關，逐 (provider, address) 重算；單一失敗只回報不中斷整批。 */
  async recomputeAllTraders(): Promise<void> {
    const keys = await this.applications.traderRepository.findAllTraderKeys();
    await this.recomputeKeys(keys);
    await this.snapshotConsensus();
  }

  /** recompute 後留存一輪共識時序（供回測）；未配置或失敗只回報、不中斷排程。 */
  private async snapshotConsensus(): Promise<void> {
    const application = this.applications.snapshotConsensusApplication;
    if (application === undefined) {
      return;
    }
    try {
      await application.snapshot({});
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught));
      process.stderr.write(`[scheduler:snapshot] consensus snapshot failed: ${error.message}\n`);
    }
  }

  private async syncProvider(pipeline: ProviderPipeline): Promise<boolean> {
    try {
      await pipeline.syncLeaderboardApplication.sync();
      return true;
    } catch (caught) {
      this.reportSyncError(
        pipeline.provider,
        caught instanceof Error ? caught : new Error(String(caught)),
      );
      return false;
    }
  }

  private async providerKeys(provider: Provider): Promise<TraderKey[]> {
    const keys = await this.applications.traderRepository.findAllTraderKeys();
    return keys.filter((key) => key.provider === provider);
  }

  private async pollProviderKeys(pipeline: ProviderPipeline, keys: TraderKey[]): Promise<void> {
    for (const key of keys) {
      try {
        await pipeline.pollTraderApplication.poll(key.address);
      } catch (caught) {
        this.reportTraderError(
          'poll',
          key.address,
          caught instanceof Error ? caught : new Error(String(caught)),
        );
      }
    }
  }

  private async recomputeKeys(keys: TraderKey[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.applications.recomputeTraderMetricsApplication.recompute(
          key.provider,
          key.address,
        );
      } catch (caught) {
        this.reportTraderError(
          'recompute',
          key.address,
          caught instanceof Error ? caught : new Error(String(caught)),
        );
      }
    }
  }

  private async registerRepeatable(
    name: string,
    everyMilliseconds: number,
    run: () => Promise<void>,
  ): Promise<void> {
    const queue = new Queue(name, { connection: this.options.connection });
    this.queues.push(queue);
    this.workers.push(new Worker(name, () => run(), { connection: this.options.connection }));
    await queue.add(name, {}, { repeat: { every: everyMilliseconds } });
  }

  private reportTraderError(
    phase: 'poll' | 'recompute',
    traderAddress: string,
    error: Error,
  ): void {
    if (this.options.onTraderError) {
      this.options.onTraderError(phase, traderAddress, error);
      return;
    }
    process.stderr.write(`[scheduler:${phase}] ${traderAddress} failed: ${error.message}\n`);
  }

  private reportSyncError(provider: Provider, error: Error): void {
    process.stderr.write(`[scheduler:sync] ${provider} leaderboard sync failed: ${error.message}\n`);
  }
}
