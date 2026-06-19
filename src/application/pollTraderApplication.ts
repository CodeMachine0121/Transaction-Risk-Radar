import type { PollTraderService } from '../domain/service/pollTraderService';

/** 用例（US-04）：委派 PollTraderService 輪詢成交與開倉快照。 */
export class PollTraderApplication {
  private readonly pollTraderService: PollTraderService;

  constructor(pollTraderService: PollTraderService) {
    this.pollTraderService = pollTraderService;
  }

  poll(traderAddress: string, fillsSince: number): Promise<void> {
    return this.pollTraderService.poll(traderAddress, fillsSince);
  }
}
