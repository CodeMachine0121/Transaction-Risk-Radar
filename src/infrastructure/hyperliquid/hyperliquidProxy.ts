import Decimal from 'decimal.js';
import type { ITraderDataProxy } from '../../domain/interface/iTraderDataProxy';
import type { LeaderboardTrader } from '../../domain/vo/leaderboardTrader';
import type { OpenPosition } from '../../domain/vo/openPosition';
import { Provider } from '../../domain/vo/provider';
import type { TraderActivity } from '../../domain/vo/traderActivity';
import type { RequestWeightLimiter } from '../../shared/rateLimit/requestWeightLimiter';
import { type BackoffOptions, defaultBackoff } from './backoff';
import { sendWithRetryOn429 } from './sendWithRetryOn429';
import type { RawClearinghouseState, RawFill, RawLeaderboardResponse } from './hyperliquidWire';

export type { BackoffOptions };

/** 各 /info 請求類型的預設 weight（per-IP 預算消耗；動工前對官方 docs 校準）。 */
export const defaultRequestWeights = {
  clearinghouseState: 2,
  userFillsByTime: 20,
} as const;

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export type HyperliquidProxyOptions = {
  infoApiBaseUrl: string;
  statsDataBaseUrl: string;
  fetchFunction?: typeof fetch;
  /** weight 限流器；未注入則不限流（leaderboard 不計 weight，亦走此路徑但不取 token）。 */
  requestWeightLimiter?: RequestWeightLimiter;
  backoff?: BackoffOptions;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

/** 以 HTTP 呼叫 Hyperliquid 公開讀取 API，並正規化為 domain 使用的型別。 */
export class HyperliquidProxy implements ITraderDataProxy {
  readonly provider = Provider.Hyperliquid;
  private readonly infoApiBaseUrl: string;
  private readonly statsDataBaseUrl: string;
  private readonly fetchFunction: typeof fetch;
  private readonly requestWeightLimiter: RequestWeightLimiter | undefined;
  private readonly backoff: BackoffOptions;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: HyperliquidProxyOptions) {
    this.infoApiBaseUrl = options.infoApiBaseUrl;
    this.statsDataBaseUrl = options.statsDataBaseUrl;
    this.fetchFunction = options.fetchFunction ?? globalThis.fetch;
    this.requestWeightLimiter = options.requestWeightLimiter;
    this.backoff = options.backoff ?? defaultBackoff;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  async fetchTraderList(): Promise<LeaderboardTrader[]> {
    const response = await this.fetchWithRetry(`${this.statsDataBaseUrl}/Mainnet/leaderboard`);
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

  async fetchPositionActivities(address: string, startTime: number): Promise<TraderActivity[]> {
    const data = await this.postInfo<RawFill[]>(
      {
        type: 'userFillsByTime',
        user: address,
        startTime,
      },
      defaultRequestWeights.userFillsByTime,
    );
    return data.map((fill) => {
      const size = new Decimal(fill.sz);
      return {
        coin: fill.coin,
        price: new Decimal(fill.px),
        signedSize: fill.side === 'B' ? size : size.negated(),
        signedSizeBefore: new Decimal(fill.startPosition),
        realizedProfitAndLoss: new Decimal(fill.closedPnl),
        occurredAt: fill.time,
        sourceReference: String(fill.tid),
      };
    });
  }

  private async postInfo<TResponse>(requestBody: object, weight: number): Promise<TResponse> {
    const response = await this.fetchWithRetry(
      `${this.infoApiBaseUrl}/info`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
      weight,
    );
    if (!response.ok) {
      throw new Error(`Hyperliquid info request failed with status ${response.status}`);
    }
    const data = (await response.json()) as TResponse;
    return data;
  }

  /**
   * 限流（依 weight，未提供則不計）後送出請求；遇 429 委由 sendWithRetryOn429 依
   * Retry-After / exponential backoff + jitter 重試。weight token 於每次嘗試前在 thunk 內取得。
   */
  private fetchWithRetry(
    url: string,
    requestInit?: RequestInit,
    weight?: number,
  ): Promise<Response> {
    return sendWithRetryOn429(
      async () => {
        if (weight !== undefined && this.requestWeightLimiter !== undefined) {
          await this.requestWeightLimiter.acquire(weight);
        }
        return this.fetchFunction(url, requestInit);
      },
      { backoff: this.backoff, sleep: this.sleep, random: this.random },
    );
  }
}
