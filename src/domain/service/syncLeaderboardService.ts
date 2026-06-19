import type { IHyperliquidProxy } from '../interface/iHyperliquidProxy';
import type { ITraderRepository } from '../interface/iTraderRepository';

export type SyncLeaderboardOptions = {
  /** 同步的交易員數量上限（取 leaderboard 前 N 名）；未設定則全部同步。 */
  maximumTraders?: number;
};

/** Domain Service（US-03）：從 Hyperliquid leaderboard 同步追蹤名單。回傳同步的交易員數。 */
export class SyncLeaderboardService {
  private readonly hyperliquidProxy: IHyperliquidProxy;
  private readonly traderRepository: ITraderRepository;
  private readonly maximumTraders: number | undefined;

  constructor(
    hyperliquidProxy: IHyperliquidProxy,
    traderRepository: ITraderRepository,
    options: SyncLeaderboardOptions = {},
  ) {
    this.hyperliquidProxy = hyperliquidProxy;
    this.traderRepository = traderRepository;
    this.maximumTraders = options.maximumTraders;
  }

  async sync(): Promise<number> {
    const leaderboard = await this.hyperliquidProxy.fetchLeaderboard();
    const selected =
      this.maximumTraders === undefined ? leaderboard : leaderboard.slice(0, this.maximumTraders);
    const traderAddresses = selected.map((trader) => trader.address);
    await this.traderRepository.saveTraders(traderAddresses);
    return traderAddresses.length;
  }
}
