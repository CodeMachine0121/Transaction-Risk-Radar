import type { SyncLeaderboardService } from '../domain/service/syncLeaderboardService';

/** 用例（US-03）：委派 SyncLeaderboardService 同步追蹤名單。 */
export class SyncLeaderboardApplication {
  private readonly syncLeaderboardService: SyncLeaderboardService;

  constructor(syncLeaderboardService: SyncLeaderboardService) {
    this.syncLeaderboardService = syncLeaderboardService;
  }

  sync(): Promise<number> {
    return this.syncLeaderboardService.sync();
  }
}
