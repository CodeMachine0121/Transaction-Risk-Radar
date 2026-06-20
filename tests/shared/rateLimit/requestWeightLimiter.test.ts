import { describe, expect, it, vi } from 'vitest';
import { RequestWeightLimiter } from '@/shared/rateLimit/requestWeightLimiter';

/** 可控假時鐘：now() 讀目前時間，sleep(ms) 直接推進時間並立即 resolve（不依賴真實等待）。 */
const createFakeClock = (start = 0) => {
  let current = start;
  return {
    now: () => current,
    sleep: async (milliseconds: number): Promise<void> => {
      current += milliseconds;
    },
    advance: (milliseconds: number): void => {
      current += milliseconds;
    },
  };
};

describe('RequestWeightLimiter', () => {
  it('returns immediately when the weight is within the available budget', async () => {
    const clock = createFakeClock();
    const sleepSpy = vi.fn(clock.sleep);
    const limiter = new RequestWeightLimiter({
      maximumWeightPerInterval: 1200,
      intervalMilliseconds: 60000,
      now: clock.now,
      sleep: sleepSpy,
    });

    await limiter.acquire(20);

    expect(sleepSpy).not.toHaveBeenCalled();
  });

  it('blocks until refill when the budget is exhausted, then proceeds without dropping', async () => {
    const clock = createFakeClock();
    const sleepSpy = vi.fn(clock.sleep);
    const limiter = new RequestWeightLimiter({
      maximumWeightPerInterval: 20,
      intervalMilliseconds: 1000,
      now: clock.now,
      sleep: sleepSpy,
    });

    await limiter.acquire(20); // 取光預算
    await limiter.acquire(20); // 需等一整輪回填才能放行

    expect(sleepSpy).toHaveBeenCalledTimes(1);
    expect(sleepSpy).toHaveBeenCalledWith(1000);
  });

  it('refills weight over elapsed time at the configured rate', async () => {
    const clock = createFakeClock();
    const sleepSpy = vi.fn(clock.sleep);
    const limiter = new RequestWeightLimiter({
      maximumWeightPerInterval: 20,
      intervalMilliseconds: 1000,
      now: clock.now,
      sleep: sleepSpy,
    });

    await limiter.acquire(20); // 取光預算
    clock.advance(500); // 半輪 → 回填 10 weight
    await limiter.acquire(10); // 剛好等於回填量 → 不需等待

    expect(sleepSpy).not.toHaveBeenCalled();
  });
});
