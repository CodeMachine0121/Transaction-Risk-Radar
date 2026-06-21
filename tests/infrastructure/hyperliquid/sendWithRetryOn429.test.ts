import { describe, expect, it, vi } from 'vitest';
import { sendWithRetryOn429 } from '@/infrastructure/hyperliquid/sendWithRetryOn429';

const deps = (sleep = vi.fn().mockResolvedValue(undefined)) => ({
  backoff: { maximumRetryCount: 3, baseDelayMilliseconds: 100, maximumDelayMilliseconds: 1000 },
  sleep,
  random: () => 0,
});

describe('sendWithRetryOn429', () => {
  it('returns immediately on a non-429 response without sleeping', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const attempt = vi.fn<() => Promise<Response>>().mockResolvedValue(new Response('ok'));

    const response = await sendWithRetryOn429(attempt, deps(sleep));

    expect(response.status).toBe(200);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries on 429 then returns the eventual success', async () => {
    const attempt = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok'));

    const response = await sendWithRetryOn429(attempt, deps());

    expect(response.status).toBe(200);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('gives up after maximumRetryCount and returns the last 429', async () => {
    const attempt = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(new Response('rate limited', { status: 429 }));

    const response = await sendWithRetryOn429(attempt, deps());

    expect(response.status).toBe(429);
    expect(attempt).toHaveBeenCalledTimes(4); // initial + 3 retries
  });

  it('honours a Retry-After header for the delay', async () => {
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);
    const attempt = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(new Response('ok'));

    await sendWithRetryOn429(attempt, deps(sleep));

    expect(sleep).toHaveBeenCalledWith(2000);
  });
});
