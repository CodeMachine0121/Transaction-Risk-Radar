import Decimal from 'decimal.js';
import type { IPriceProxy } from '../../domain/interface/iPriceProxy';
import type { PricePoint } from '../../domain/vo/pricePoint';
import { type BackoffOptions, defaultBackoff } from './backoff';
import type { RawCandle } from './hyperliquidWire';

/** jitter 佔 exponential delay 的比例（± 由 random 決定，0 → 無 jitter）。 */
const jitterRatio = 0.2;
const tooManyRequestsStatus = 429;

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export type PriceProxyOptions = {
  infoApiBaseUrl: string;
  fetchFunction?: typeof fetch;
  /** K 線週期（預設 1h），決定回測對照價格的解析度。 */
  interval?: string;
  /** 取現在時刻（ms）作 endTime；可注入以利測試。 */
  now?: () => number;
  backoff?: BackoffOptions;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

/** 以 Hyperliquid candleSnapshot 取得收盤價序列，正規化為 domain 的 PricePoint[]（回測對照價格）。 */
export class PriceProxy implements IPriceProxy {
  private readonly infoApiBaseUrl: string;
  private readonly fetchFunction: typeof fetch;
  private readonly interval: string;
  private readonly now: () => number;
  private readonly backoff: BackoffOptions;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: PriceProxyOptions) {
    this.infoApiBaseUrl = options.infoApiBaseUrl;
    this.fetchFunction = options.fetchFunction ?? globalThis.fetch;
    this.interval = options.interval ?? '1h';
    this.now = options.now ?? (() => Date.now());
    this.backoff = options.backoff ?? defaultBackoff;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  async fetchPriceSeries(coin: string, since: number): Promise<PricePoint[]> {
    const response = await this.fetchWithRetry(`${this.infoApiBaseUrl}/info`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: { coin, interval: this.interval, startTime: since, endTime: this.now() },
      }),
    });
    if (!response.ok) {
      throw new Error(`Hyperliquid candleSnapshot request failed with status ${response.status}`);
    }
    const candles = (await response.json()) as RawCandle[];
    return candles.map((candle) => ({
      timestamp: candle.t,
      price: new Decimal(candle.c),
    }));
  }

  /**
   * 送出請求；遇 429 依 Retry-After / exponential backoff + jitter 重試至上限為止。
   * 非 429 的回應（含其他非 ok）直接回傳交由呼叫端處理。
   */
  private async fetchWithRetry(url: string, requestInit: RequestInit): Promise<Response> {
    let attempt = 0;
    for (;;) {
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
