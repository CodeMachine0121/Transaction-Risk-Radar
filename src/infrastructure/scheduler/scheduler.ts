import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { PollTraderApplication } from '../../application/pollTraderApplication';
import type { RecomputeTraderMetricsApplication } from '../../application/recomputeTraderMetricsApplication';
import type { SyncLeaderboardApplication } from '../../application/syncLeaderboardApplication';
import type { ITraderRepository } from '../../domain/interface/iTraderRepository';

export type SchedulerApplications = {
  syncLeaderboardApplication: SyncLeaderboardApplication;
  pollTraderApplication: PollTraderApplication;
  recomputeTraderMetricsApplication: RecomputeTraderMetricsApplication;
  traderRepository: ITraderRepository;
};

export type SchedulerOptions = {
  connection: ConnectionOptions;
  syncIntervalMs: number;
  pollIntervalMs: number;
  recomputeIntervalMs: number;
  /** poll 抓取成交的回看時間窗（ms）。 */
  pollLookbackMs: number;
  /** 單一 trader 處理失敗時的回報（不中斷整批）；未提供則寫 stderr。 */
  onTraderError?: (phase: 'poll' | 'recompute', traderAddress: string, error: Error) => void;
};

/**
 * 以 BullMQ 排程三條背景流程：同步 leaderboard、輪詢交易員、重算指標。
 * 需 Redis（驗證由使用者執行）。
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
      await this.applications.syncLeaderboardApplication.sync();
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
   * 啟動時立即依序跑一輪 sync → poll → recompute，讓排行不必等第一個 interval 才有資料。
   * sync 失敗只回報、不中斷啟動：repeatable 排程會在下一個 interval 重試。
   */
  async runInitialCycle(): Promise<void> {
    try {
      await this.applications.syncLeaderboardApplication.sync();
    } catch (caught) {
      this.reportSyncError(caught instanceof Error ? caught : new Error(String(caught)));
      return;
    }
    await this.pollAllTraders();
    await this.recomputeAllTraders();
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

  /** 輪詢每位 trader；單一失敗只回報不中斷整批。 */
  async pollAllTraders(): Promise<void> {
    const addresses = await this.applications.traderRepository.findAllAddresses();
    const fillsSince = Date.now() - this.options.pollLookbackMs;
    for (const address of addresses) {
      try {
        await this.applications.pollTraderApplication.poll(address, fillsSince);
      } catch (caught) {
        this.reportTraderError(
          'poll',
          address,
          caught instanceof Error ? caught : new Error(String(caught)),
        );
      }
    }
  }

  /** 重算每位 trader 的指標；單一失敗只回報不中斷整批。 */
  async recomputeAllTraders(): Promise<void> {
    const addresses = await this.applications.traderRepository.findAllAddresses();
    for (const address of addresses) {
      try {
        await this.applications.recomputeTraderMetricsApplication.recompute(address);
      } catch (caught) {
        this.reportTraderError(
          'recompute',
          address,
          caught instanceof Error ? caught : new Error(String(caught)),
        );
      }
    }
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

  private reportSyncError(error: Error): void {
    process.stderr.write(`[scheduler:sync] leaderboard sync failed: ${error.message}\n`);
  }
}
