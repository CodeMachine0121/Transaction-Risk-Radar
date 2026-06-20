export type RequestWeightLimiterOptions = {
  /** 一個 interval 內可用的 aggregate weight 上限（token bucket 容量）。 */
  maximumWeightPerInterval: number;
  /** weight 回填一輪所需的毫秒數（如 60000 = 每分鐘回滿）。 */
  intervalMilliseconds: number;
  /** 取目前時間（毫秒）；可注入以利測試。 */
  now?: () => number;
  /** 等待指定毫秒；可注入以利測試。 */
  sleep?: (milliseconds: number) => Promise<void>;
};

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Weight-aware token bucket：每個請求依其 weight 取 token，
 * 額度不足時 block-and-wait 等回填（不丟棄請求），讓總 weight 結構性壓在 per-IP 預算內。
 */
export class RequestWeightLimiter {
  private readonly maximumWeightPerInterval: number;
  private readonly intervalMilliseconds: number;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private availableWeight: number;
  private lastRefillAt: number;

  constructor(options: RequestWeightLimiterOptions) {
    this.maximumWeightPerInterval = options.maximumWeightPerInterval;
    this.intervalMilliseconds = options.intervalMilliseconds;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? defaultSleep;
    this.availableWeight = options.maximumWeightPerInterval;
    this.lastRefillAt = this.now();
  }

  async acquire(weight: number): Promise<void> {
    this.refill();
    if (weight > this.availableWeight) {
      const deficit = weight - this.availableWeight;
      const waitMilliseconds = Math.ceil(deficit / this.refillRatePerMillisecond());
      await this.sleep(waitMilliseconds);
      this.refill();
    }
    this.availableWeight -= weight;
  }

  private refill(): void {
    const currentTime = this.now();
    const elapsed = currentTime - this.lastRefillAt;
    if (elapsed <= 0) {
      return;
    }
    const refilled = elapsed * this.refillRatePerMillisecond();
    this.availableWeight = Math.min(
      this.maximumWeightPerInterval,
      this.availableWeight + refilled,
    );
    this.lastRefillAt = currentTime;
  }

  private refillRatePerMillisecond(): number {
    return this.maximumWeightPerInterval / this.intervalMilliseconds;
  }
}
