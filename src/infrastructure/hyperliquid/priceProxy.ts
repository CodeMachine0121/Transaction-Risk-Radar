import Decimal from 'decimal.js';
import type { IPriceProxy } from '../../domain/interface/iPriceProxy';
import type { PricePoint } from '../../domain/vo/pricePoint';
import { type BackoffOptions, defaultBackoff } from './backoff';
import { sendWithRetryOn429 } from './sendWithRetryOn429';
import type { RawCandle } from './hyperliquidWire';

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
    const response = await sendWithRetryOn429(
      () =>
        this.fetchFunction(`${this.infoApiBaseUrl}/info`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'candleSnapshot',
            req: { coin, interval: this.interval, startTime: since, endTime: this.now() },
          }),
        }),
      { backoff: this.backoff, sleep: this.sleep, random: this.random },
    );
    if (!response.ok) {
      throw new Error(`Hyperliquid candleSnapshot request failed with status ${response.status}`);
    }
    const candles = (await response.json()) as RawCandle[];
    return candles.map((candle) => ({
      timestamp: candle.t,
      price: new Decimal(candle.c),
    }));
  }
}
