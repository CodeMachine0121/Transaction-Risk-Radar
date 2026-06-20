import { describe, expect, it, vi } from 'vitest';
import { PollTraderApplication } from '@/application/pollTraderApplication';
import { RecomputeTraderMetricsApplication } from '@/application/recomputeTraderMetricsApplication';
import { SyncLeaderboardApplication } from '@/application/syncLeaderboardApplication';
import { PollTraderService } from '@/domain/service/pollTraderService';
import { RecomputeTraderMetricsService } from '@/domain/service/recomputeTraderMetricsService';
import { SyncLeaderboardService } from '@/domain/service/syncLeaderboardService';
import type { IHyperliquidProxy } from '@/domain/interface/iHyperliquidProxy';
import type { IPositionRepository } from '@/domain/interface/iPositionRepository';
import type { ITraderRepository } from '@/domain/interface/iTraderRepository';
import { Scheduler } from '@/infrastructure/scheduler/scheduler';
import { createMockHyperliquidProxy } from '../../application/support/mockHyperliquidProxy';
import { createMockPositionRepository } from '../../application/support/mockPositionRepository';
import { createMockTraderRepository } from '../../application/support/mockTraderRepository';

// 真實 application/service（連帶真實 entity），只 mock 最外層介面。
const buildScheduler = (deps: {
  hyperliquidProxy: IHyperliquidProxy;
  positionRepository: IPositionRepository;
  traderRepository: ITraderRepository;
  onTraderError: (phase: 'poll' | 'recompute', traderAddress: string, error: Error) => void;
}): Scheduler =>
  new Scheduler(
    {
      syncLeaderboardApplication: new SyncLeaderboardApplication(
        new SyncLeaderboardService(deps.hyperliquidProxy, deps.traderRepository),
      ),
      pollTraderApplication: new PollTraderApplication(
        new PollTraderService(deps.hyperliquidProxy, deps.positionRepository, {
          lookbackMilliseconds: 1000,
        }),
      ),
      recomputeTraderMetricsApplication: new RecomputeTraderMetricsApplication(
        new RecomputeTraderMetricsService(deps.positionRepository, deps.traderRepository),
      ),
      traderRepository: deps.traderRepository,
    },
    {
      connection: { host: '127.0.0.1', port: 6379 },
      syncIntervalMs: 1000,
      pollIntervalMs: 1000,
      recomputeIntervalMs: 1000,
      onTraderError: deps.onTraderError,
    },
  );

describe('Scheduler per-trader isolation', () => {
  it('recomputes every trader even when one fails, reporting the failure', async () => {
    const traderRepository = createMockTraderRepository();
    vi.mocked(traderRepository.findAllAddresses).mockResolvedValue(['A', 'B', 'C']);
    const positionRepository = createMockPositionRepository();
    vi.mocked(positionRepository.findPositions).mockImplementation((traderAddress) =>
      traderAddress === 'B' ? Promise.reject(new Error('db down')) : Promise.resolve([]),
    );
    const onTraderError = vi.fn();
    const scheduler = buildScheduler({
      hyperliquidProxy: createMockHyperliquidProxy(),
      positionRepository,
      traderRepository,
      onTraderError,
    });

    await scheduler.recomputeAllTraders();

    expect(positionRepository.findPositions).toHaveBeenCalledTimes(3); // A, B, C all attempted
    expect(traderRepository.saveTraderMetrics).toHaveBeenCalledTimes(2); // only A and C persisted
    expect(onTraderError).toHaveBeenCalledTimes(1);
    expect(onTraderError).toHaveBeenCalledWith('recompute', 'B', expect.any(Error));
  });

  it('runs sync then poll then recompute once on the initial cycle', async () => {
    const traderRepository = createMockTraderRepository();
    vi.mocked(traderRepository.findAllAddresses).mockResolvedValue(['A']);
    const hyperliquidProxy = createMockHyperliquidProxy();
    const callOrder: string[] = [];
    vi.mocked(traderRepository.saveTraders).mockImplementation(async () => {
      callOrder.push('sync');
    });
    vi.mocked(hyperliquidProxy.fetchUserFills).mockImplementation(async () => {
      callOrder.push('poll');
      return [];
    });
    vi.mocked(traderRepository.saveTraderMetrics).mockImplementation(async () => {
      callOrder.push('recompute');
    });
    const scheduler = buildScheduler({
      hyperliquidProxy,
      positionRepository: createMockPositionRepository(),
      traderRepository,
      onTraderError: vi.fn(),
    });

    await scheduler.runInitialCycle();

    expect(hyperliquidProxy.fetchUserFills).toHaveBeenCalledWith('A', expect.any(Number));
    // 順序：sync → poll → recompute。
    expect(callOrder).toEqual(['sync', 'poll', 'recompute']);
  });

  it('skips poll and recompute when the initial sync fails', async () => {
    const traderRepository = createMockTraderRepository();
    vi.mocked(traderRepository.findAllAddresses).mockResolvedValue(['A']);
    const hyperliquidProxy = createMockHyperliquidProxy();
    vi.mocked(hyperliquidProxy.fetchLeaderboard).mockRejectedValue(new Error('rate limited'));
    const scheduler = buildScheduler({
      hyperliquidProxy,
      positionRepository: createMockPositionRepository(),
      traderRepository,
      onTraderError: vi.fn(),
    });

    await expect(scheduler.runInitialCycle()).resolves.toBeUndefined(); // 不中斷啟動
    expect(hyperliquidProxy.fetchUserFills).not.toHaveBeenCalled();
    expect(traderRepository.saveTraderMetrics).not.toHaveBeenCalled();
  });

  it('polls every trader even when one fails, reporting the failure', async () => {
    const traderRepository = createMockTraderRepository();
    vi.mocked(traderRepository.findAllAddresses).mockResolvedValue(['A', 'B', 'C']);
    const hyperliquidProxy = createMockHyperliquidProxy();
    vi.mocked(hyperliquidProxy.fetchUserFills).mockImplementation((traderAddress) =>
      traderAddress === 'B' ? Promise.reject(new Error('rate limited')) : Promise.resolve([]),
    );
    const onTraderError = vi.fn();
    const scheduler = buildScheduler({
      hyperliquidProxy,
      positionRepository: createMockPositionRepository(),
      traderRepository,
      onTraderError,
    });

    await scheduler.pollAllTraders();

    expect(hyperliquidProxy.fetchUserFills).toHaveBeenCalledTimes(3); // A, B, C all attempted
    expect(onTraderError).toHaveBeenCalledTimes(1);
    expect(onTraderError).toHaveBeenCalledWith('poll', 'B', expect.any(Error));
  });
});
