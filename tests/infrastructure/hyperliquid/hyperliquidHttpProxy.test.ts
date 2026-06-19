import { describe, expect, it, vi } from 'vitest';
import { HyperliquidHttpProxy } from '@/infrastructure/hyperliquid/hyperliquidHttpProxy';

const jsonResponse = (body: object): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const buildProxy = (fetchFunction: typeof fetch): HyperliquidHttpProxy =>
  new HyperliquidHttpProxy({
    infoApiBaseUrl: 'https://api.hyperliquid.xyz',
    statsDataBaseUrl: 'https://stats-data.hyperliquid.xyz',
    fetchFunction,
  });

describe('HyperliquidHttpProxy', () => {
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

    expect(fetchMock).toHaveBeenCalledWith('https://stats-data.hyperliquid.xyz/Mainnet/leaderboard');
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
});
