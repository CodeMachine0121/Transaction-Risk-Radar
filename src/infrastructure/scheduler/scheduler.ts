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
      await this.pollAll();
    });
    await this.registerRepeatable(
      'recompute-metrics',
      this.options.recomputeIntervalMs,
      async () => {
        await this.recomputeAll();
      },
    );
  }

  async stop(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all(this.queues.map((queue) => queue.close()));
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

  private async pollAll(): Promise<void> {
    const addresses = await this.applications.traderRepository.findAllAddresses();
    const fillsSince = Date.now() - this.options.pollLookbackMs;
    for (const address of addresses) {
      await this.applications.pollTraderApplication.poll(address, fillsSince);
    }
  }

  private async recomputeAll(): Promise<void> {
    const addresses = await this.applications.traderRepository.findAllAddresses();
    for (const address of addresses) {
      await this.applications.recomputeTraderMetricsApplication.recompute(address);
    }
  }
}
