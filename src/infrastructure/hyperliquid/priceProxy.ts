import Decimal from 'decimal.js';
import type { IPriceProxy } from '../../domain/interface/iPriceProxy';
import type { PricePoint } from '../../domain/vo/pricePoint';
import type { RawCandle } from './hyperliquidWire';

export type PriceProxyOptions = {
  infoApiBaseUrl: string;
  fetchFunction?: typeof fetch;
  /** K 線週期（預設 1h），決定回測對照價格的解析度。 */
  interval?: string;
  /** 取現在時刻（ms）作 endTime；可注入以利測試。 */
  now?: () => number;
};

/** 以 Hyperliquid candleSnapshot 取得收盤價序列，正規化為 domain 的 PricePoint[]（回測對照價格）。 */
export class PriceProxy implements IPriceProxy {
  private readonly infoApiBaseUrl: string;
  private readonly fetchFunction: typeof fetch;
  private readonly interval: string;
  private readonly now: () => number;

  constructor(options: PriceProxyOptions) {
    this.infoApiBaseUrl = options.infoApiBaseUrl;
    this.fetchFunction = options.fetchFunction ?? globalThis.fetch;
    this.interval = options.interval ?? '1h';
    this.now = options.now ?? (() => Date.now());
  }

  async fetchPriceSeries(coin: string, since: number): Promise<PricePoint[]> {
    const response = await this.fetchFunction(`${this.infoApiBaseUrl}/info`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: { coin, interval: this.interval, startTime: since, endTime: this.now() },
      }),
    });
    const candles = (await response.json()) as RawCandle[];
    return candles.map((candle) => ({
      timestamp: candle.t,
      price: new Decimal(candle.c),
    }));
  }
}
