import type { IHyperliquidProxy } from './ports/iHyperliquidProxy';
import type { ITraderRepository } from './ports/iTraderRepository';

export interface ISyncLeaderboardOptions {
  /** 同步的交易員數量上限（取 leaderboard 前 N 名）；未設定則全部同步。 */
  maximumTraders?: number;
}

/** 用例（US-03）：從 Hyperliquid leaderboard 同步追蹤名單。回傳同步的交易員數。 */
export class SyncLeaderboardApplication {
  private readonly proxy: IHyperliquidProxy;
  private readonly traderRepository: ITraderRepository;
  private readonly maximumTraders: number | undefined;

  constructor(
    proxy: IHyperliquidProxy,
    traderRepository: ITraderRepository,
    options: ISyncLeaderboardOptions = {},
  ) {
    this.proxy = proxy;
    this.traderRepository = traderRepository;
    this.maximumTraders = options.maximumTraders;
  }

  async sync(): Promise<number> {
    const leaderboard = await this.proxy.fetchLeaderboard();
    const selected =
      this.maximumTraders === undefined ? leaderboard : leaderboard.slice(0, this.maximumTraders);
    const traderAddresses = selected.map((trader) => trader.address);
    await this.traderRepository.saveTraders(traderAddresses);
    return traderAddresses.length;
  }
}
