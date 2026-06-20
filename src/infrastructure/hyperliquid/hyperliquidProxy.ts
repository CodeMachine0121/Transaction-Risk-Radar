import Decimal from 'decimal.js';
import type { IHyperliquidProxy } from '../../domain/interface/iHyperliquidProxy';
import type { LeaderboardTrader } from '../../domain/vo/leaderboardTrader';
import type { OpenPosition } from '../../domain/vo/openPosition';
import type { TraderFill } from '../../domain/vo/traderFill';
import type { RequestWeightLimiter } from '../../shared/rateLimit/requestWeightLimiter';
import type { RawClearinghouseState, RawFill, RawLeaderboardResponse } from './hyperliquidWire';

/** 各 /info 請求類型的預設 weight（per-IP 預算消耗；動工前對官方 docs 校準）。 */
export const defaultRequestWeights = {
  clearinghouseState: 2,
  userFillsByTime: 20,
} as const;

export type HyperliquidProxyOptions = {
  infoApiBaseUrl: string;
  statsDataBaseUrl: string;
  fetchFunction?: typeof fetch;
  /** weight 限流器；未注入則不限流（leaderboard 不計 weight，亦走此路徑但不取 token）。 */
  requestWeightLimiter?: RequestWeightLimiter;
};

/** 以 HTTP 呼叫 Hyperliquid 公開讀取 API，並正規化為 domain 使用的型別。 */
export class HyperliquidProxy implements IHyperliquidProxy {
  private readonly infoApiBaseUrl: string;
  private readonly statsDataBaseUrl: string;
  private readonly fetchFunction: typeof fetch;
  private readonly requestWeightLimiter: RequestWeightLimiter | undefined;

  constructor(options: HyperliquidProxyOptions) {
    this.infoApiBaseUrl = options.infoApiBaseUrl;
    this.statsDataBaseUrl = options.statsDataBaseUrl;
    this.fetchFunction = options.fetchFunction ?? globalThis.fetch;
    this.requestWeightLimiter = options.requestWeightLimiter;
  }

  async fetchLeaderboard(): Promise<LeaderboardTrader[]> {
    const response = await this.fetchFunction(`${this.statsDataBaseUrl}/Mainnet/leaderboard`);
    if (!response.ok) {
      throw new Error(`Hyperliquid leaderboard request failed with status ${response.status}`);
    }
    const data = (await response.json()) as RawLeaderboardResponse;
    return data.leaderboardRows.map((row) => ({
      address: row.ethAddress,
      accountValue: new Decimal(row.accountValue),
    }));
  }

  async fetchOpenPositions(address: string): Promise<OpenPosition[]> {
    const data = await this.postInfo<RawClearinghouseState>(
      {
        type: 'clearinghouseState',
        user: address,
      },
      defaultRequestWeights.clearinghouseState,
    );
    return data.assetPositions.map((entry) => ({
      coin: entry.position.coin,
      signedSize: new Decimal(entry.position.szi),
      entryPrice: new Decimal(entry.position.entryPx),
      leverage: new Decimal(entry.position.leverage.value),
      unrealizedProfitAndLoss: new Decimal(entry.position.unrealizedPnl),
      positionValue: new Decimal(entry.position.positionValue),
      marginUsed: new Decimal(entry.position.marginUsed),
    }));
  }

  async fetchUserFills(address: string, startTime: number): Promise<TraderFill[]> {
    const data = await this.postInfo<RawFill[]>(
      {
        type: 'userFillsByTime',
        user: address,
        startTime,
      },
      defaultRequestWeights.userFillsByTime,
    );
    return data.map((fill) => ({
      coin: fill.coin,
      price: new Decimal(fill.px),
      size: new Decimal(fill.sz),
      side: fill.side === 'B' ? 'buy' : 'sell',
      timestamp: fill.time,
      startPosition: new Decimal(fill.startPosition),
      direction: fill.dir,
      closedProfitAndLoss: new Decimal(fill.closedPnl),
      tradeId: fill.tid,
      hash: fill.hash,
    }));
  }

  private async postInfo<TResponse>(requestBody: object, weight: number): Promise<TResponse> {
    if (this.requestWeightLimiter !== undefined) {
      await this.requestWeightLimiter.acquire(weight);
    }
    const response = await this.fetchFunction(`${this.infoApiBaseUrl}/info`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      throw new Error(`Hyperliquid info request failed with status ${response.status}`);
    }
    const data = (await response.json()) as TResponse;
    return data;
  }
}
