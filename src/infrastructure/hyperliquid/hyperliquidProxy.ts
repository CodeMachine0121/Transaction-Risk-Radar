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

export type BackoffOptions = {
  /** 429 後的最大重試次數。 */
  maximumRetryCount: number;
  /** exponential backoff 基數毫秒。 */
  baseDelayMilliseconds: number;
  /** backoff 上限毫秒。 */
  maximumDelayMilliseconds: number;
};

const defaultBackoff: BackoffOptions = {
  maximumRetryCount: 5,
  baseDelayMilliseconds: 500,
  maximumDelayMilliseconds: 30000,
};

/** jitter 佔 exponential delay 的比例（± 由 random 決定，0 → 無 jitter）。 */
const jitterRatio = 0.2;
const tooManyRequestsStatus = 429;

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
export class HyperliquidProxy implements IHyperliquidProxy {
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

  async fetchLeaderboard(): Promise<LeaderboardTrader[]> {
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
   * 限流（依 weight，未提供則不計）後送出請求；遇 429 依 Retry-After / exponential
   * backoff + jitter 重試，至上限為止。非 429 的回應（含其他非 ok）直接回傳交由呼叫端處理。
   */
  private async fetchWithRetry(
    url: string,
    requestInit?: RequestInit,
    weight?: number,
  ): Promise<Response> {
    let attempt = 0;
    for (;;) {
      if (weight !== undefined && this.requestWeightLimiter !== undefined) {
        await this.requestWeightLimiter.acquire(weight);
      }
      const response = await this.fetchFunction(url, requestInit);
      if (response.status !== tooManyRequestsStatus || attempt >= this.backoff.maximumRetryCount) {
        return response;
      }
      await this.sleep(this.retryDelayMilliseconds(response, attempt));
      attempt += 1;
    }
  }

  private retryDelayMilliseconds(response: Response, attempt: number): number {
    const retryAfter = Number(response.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return retryAfter * 1000;
    }
    const exponential = Math.min(
      this.backoff.baseDelayMilliseconds * 2 ** attempt,
      this.backoff.maximumDelayMilliseconds,
    );
    return Math.round(exponential * (1 + jitterRatio * this.random()));
  }
}
