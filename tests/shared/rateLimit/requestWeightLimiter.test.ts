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
});
