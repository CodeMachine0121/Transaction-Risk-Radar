import { describe, expect, it, vi } from 'vitest';
import { HyperliquidProxy } from '@/infrastructure/hyperliquid/hyperliquidProxy';
import { RequestWeightLimiter } from '@/shared/rateLimit/requestWeightLimiter';

const buildLimiter = (): RequestWeightLimiter =>
  new RequestWeightLimiter({ maximumWeightPerInterval: 1200, intervalMilliseconds: 60000 });

const jsonResponse = (body: object): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const buildProxy = (fetchFunction: typeof fetch): HyperliquidProxy =>
  new HyperliquidProxy({
    infoApiBaseUrl: 'https://api.hyperliquid.xyz',
    statsDataBaseUrl: 'https://stats-data.hyperliquid.xyz',
    fetchFunction,
  });

describe('HyperliquidProxy', () => {
  it('fetches and normalizes the leaderboard', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        leaderboardRows: [
          { ethAddress: '0x1', accountValue: '1000.5' },
          { ethAddress: '0x2', accountValue: '2000' },
        ],
      }),
    );

    const traders = await buildProxy(fetchMock).fetchLeaderboard();

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard',
    );
    expect(traders).toHaveLength(2);
    expect(traders[0]?.address).toBe('0x1');
    expect(traders[0]?.accountValue.toString()).toBe('1000.5');
  });

  it('posts clearinghouseState and normalizes open positions', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        assetPositions: [
          {
            type: 'oneWay',
            position: {
              coin: 'ETH',
              szi: '2.0',
              entryPx: '3000',
              leverage: { type: 'cross', value: 10, rawUsd: '0' },
              unrealizedPnl: '50',
              positionValue: '6000',
              marginUsed: '600',
            },
          },
        ],
      }),
    );

    const positions = await buildProxy(fetchMock).fetchOpenPositions('0xabc');

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.hyperliquid.xyz/info');
    expect(requestBody.type).toBe('clearinghouseState');
    expect(requestBody.user).toBe('0xabc');
    expect(positions[0]?.coin).toBe('ETH');
    expect(positions[0]?.signedSize.toString()).toBe('2');
    expect(positions[0]?.entryPrice.toString()).toBe('3000');
    expect(positions[0]?.leverage.toString()).toBe('10');
  });

  it('posts userFillsByTime and normalizes fills', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse([
        {
          coin: 'AVAX',
          px: '18.435',
          sz: '93.53',
          side: 'B',
          time: 1681222254710,
          startPosition: '26.86',
          dir: 'Open Long',
          closedPnl: '0.0',
          hash: '0xhash',
          oid: 90542681,
          tid: 118906512037719,
        },
      ]),
    );

    const fills = await buildProxy(fetchMock).fetchUserFills('0xabc', 1681222254000);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.type).toBe('userFillsByTime');
    expect(requestBody.user).toBe('0xabc');
    expect(requestBody.startTime).toBe(1681222254000);
    expect(fills[0]?.side).toBe('buy');
    expect(fills[0]?.price.toString()).toBe('18.435');
    expect(fills[0]?.tradeId).toBe(118906512037719);
  });

  it('throws when the info endpoint responds with a non-ok status', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('error', { status: 500 }));

    await expect(buildProxy(fetchMock).fetchOpenPositions('0xabc')).rejects.toThrow();
  });

  it('acquires clearinghouseState weight before requesting open positions', async () => {
    const limiter = buildLimiter();
    const acquireSpy = vi.spyOn(limiter, 'acquire');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ assetPositions: [] }));
    const proxy = new HyperliquidProxy({
      infoApiBaseUrl: 'https://api.hyperliquid.xyz',
      statsDataBaseUrl: 'https://stats-data.hyperliquid.xyz',
      fetchFunction: fetchMock,
      requestWeightLimiter: limiter,
    });

    await proxy.fetchOpenPositions('0xabc');

    expect(acquireSpy).toHaveBeenCalledWith(2);
  });

  it('acquires userFillsByTime weight before requesting fills', async () => {
    const limiter = buildLimiter();
    const acquireSpy = vi.spyOn(limiter, 'acquire');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([]));
    const proxy = new HyperliquidProxy({
      infoApiBaseUrl: 'https://api.hyperliquid.xyz',
      statsDataBaseUrl: 'https://stats-data.hyperliquid.xyz',
      fetchFunction: fetchMock,
      requestWeightLimiter: limiter,
    });

    await proxy.fetchUserFills('0xabc', 1000);

    expect(acquireSpy).toHaveBeenCalledWith(20);
  });

  it('does not consume weight budget for the leaderboard request', async () => {
    const limiter = buildLimiter();
    const acquireSpy = vi.spyOn(limiter, 'acquire');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ leaderboardRows: [] }));
    const proxy = new HyperliquidProxy({
      infoApiBaseUrl: 'https://api.hyperliquid.xyz',
      statsDataBaseUrl: 'https://stats-data.hyperliquid.xyz',
      fetchFunction: fetchMock,
      requestWeightLimiter: limiter,
    });

    await proxy.fetchLeaderboard();

    expect(acquireSpy).not.toHaveBeenCalled();
  });
});

const tooManyRequests = (headers: Record<string, string> = {}): Response =>
  new Response('', { status: 429, headers });

type BackoffTestOptions = {
  fetchFunction: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  backoff?: {
    maximumRetryCount: number;
    baseDelayMilliseconds: number;
    maximumDelayMilliseconds: number;
  };
  requestWeightLimiter?: RequestWeightLimiter;
};

const buildBackoffProxy = (options: BackoffTestOptions): HyperliquidProxy =>
  new HyperliquidProxy({
    infoApiBaseUrl: 'https://api.hyperliquid.xyz',
    statsDataBaseUrl: 'https://stats-data.hyperliquid.xyz',
    fetchFunction: options.fetchFunction,
    sleep: options.sleep,
    random: options.random,
    backoff: options.backoff,
    requestWeightLimiter: options.requestWeightLimiter,
  });

describe('HyperliquidProxy 429 backoff', () => {
  it('retries on 429 then returns the successful response', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tooManyRequests())
      .mockResolvedValueOnce(jsonResponse({ assetPositions: [] }));
    const proxy = buildBackoffProxy({ fetchFunction: fetchMock, sleep: vi.fn() });

    const positions = await proxy.fetchOpenPositions('0xabc');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(positions).toEqual([]);
  });

  it('waits for the Retry-After header duration', async () => {
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tooManyRequests({ 'retry-after': '3' }))
      .mockResolvedValueOnce(jsonResponse({ assetPositions: [] }));
    const proxy = buildBackoffProxy({ fetchFunction: fetchMock, sleep });

    await proxy.fetchOpenPositions('0xabc');

    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it('uses exponential backoff with jitter when no Retry-After header is present', async () => {
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tooManyRequests())
      .mockResolvedValueOnce(tooManyRequests())
      .mockResolvedValueOnce(jsonResponse({ assetPositions: [] }));
    const proxy = buildBackoffProxy({
      fetchFunction: fetchMock,
      sleep,
      random: () => 1, // jitter 取最大：delay = exponential × (1 + 0.2)
      backoff: { maximumRetryCount: 5, baseDelayMilliseconds: 500, maximumDelayMilliseconds: 30000 },
    });

    await proxy.fetchOpenPositions('0xabc');

    // attempt 0: 500×1.2=600；attempt 1: 1000×1.2=1200
    expect(sleep.mock.calls).toEqual([[600], [1200]]);
  });

  it('throws after exceeding the maximum retry count', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(tooManyRequests());
    const proxy = buildBackoffProxy({
      fetchFunction: fetchMock,
      sleep: vi.fn(),
      backoff: { maximumRetryCount: 2, baseDelayMilliseconds: 500, maximumDelayMilliseconds: 30000 },
    });

    await expect(proxy.fetchOpenPositions('0xabc')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3); // 初次 + 2 retries
  });

  it('throws immediately on a non-429 error without retrying', async () => {
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('error', { status: 500 }));
    const proxy = buildBackoffProxy({ fetchFunction: fetchMock, sleep });

    await expect(proxy.fetchOpenPositions('0xabc')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries the leaderboard on 429 without consuming weight', async () => {
    const limiter = buildLimiter();
    const acquireSpy = vi.spyOn(limiter, 'acquire');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tooManyRequests())
      .mockResolvedValueOnce(jsonResponse({ leaderboardRows: [] }));
    const proxy = buildBackoffProxy({
      fetchFunction: fetchMock,
      sleep: vi.fn(),
      requestWeightLimiter: limiter,
    });

    await proxy.fetchLeaderboard();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(acquireSpy).not.toHaveBeenCalled();
  });
});
