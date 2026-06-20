import type { ITraderDataProxy } from '../interface/iTraderDataProxy';
import type { ITraderRepository } from '../interface/iTraderRepository';
import type { LeaderboardTrader } from '../vo/leaderboardTrader';

export type SyncLeaderboardOptions = {
  /** 同步的交易員數量上限（取 leaderboard 前 N 名）；未設定則全部同步。 */
  maximumTraders?: number;
};

/** Domain Service（US-03）：從 Hyperliquid leaderboard 同步追蹤名單。回傳同步的交易員數。 */
export class SyncLeaderboardService {
  private readonly hyperliquidProxy: ITraderDataProxy;
  private readonly traderRepository: ITraderRepository;
  private readonly maximumTraders: number | undefined;

  constructor(
    hyperliquidProxy: ITraderDataProxy,
    traderRepository: ITraderRepository,
    options: SyncLeaderboardOptions = {},
  ) {
    this.hyperliquidProxy = hyperliquidProxy;
    this.traderRepository = traderRepository;
    this.maximumTraders = options.maximumTraders;
  }

  async sync(): Promise<number> {
    const leaderboard = await this.hyperliquidProxy.fetchTraderList();
    const selected =
      this.maximumTraders === undefined ? leaderboard : leaderboard.slice(0, this.maximumTraders);
    const traderAddresses = selected.map((trader) => trader.address);
    await this.traderRepository.saveTraders(this.hyperliquidProxy.provider, traderAddresses);
    await this.persistAccountStats(selected);
    return traderAddresses.length;
  }

  /** 對提供彙總報酬序列的交易員寫入帳戶級彙總（fallback 輸入）；其餘略過。 */
  private async persistAccountStats(traders: LeaderboardTrader[]): Promise<void> {
    const provider = this.hyperliquidProxy.provider;
    const writes = traders.flatMap((trader) => {
      const { address, winRatio, accountReturnSeries } = trader;
      if (winRatio === undefined || accountReturnSeries === undefined) {
        return [];
      }
      return [
        this.traderRepository.saveAccountStats(provider, address, {
          winRatio,
          returnSeries: accountReturnSeries,
        }),
      ];
    });
    await Promise.all(writes);
  }
}
