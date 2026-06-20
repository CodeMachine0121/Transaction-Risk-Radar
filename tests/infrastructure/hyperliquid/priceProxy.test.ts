import { describe, expect, it, vi } from 'vitest';
import { PriceProxy } from '@/infrastructure/hyperliquid/priceProxy';

const jsonResponse = (body: object): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('PriceProxy', () => {
  it('parses candleSnapshot close prices into PricePoint[]', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse([
        { t: 1000, T: 2000, s: 'BTC', i: '1h', o: '100', c: '110', h: '120', l: '90', v: '1', n: 1 },
        { t: 2000, T: 3000, s: 'BTC', i: '1h', o: '110', c: '105', h: '115', l: '100', v: '1', n: 1 },
      ]),
    );
    const proxy = new PriceProxy({
      infoApiBaseUrl: 'https://api.hyperliquid.xyz',
      fetchFunction: fetchMock,
      now: () => 9999,
    });

    const series = await proxy.fetchPriceSeries('BTC', 500);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.hyperliquid.xyz/info');
    expect(series).toHaveLength(2);
    expect(series[0]?.timestamp).toBe(1000);
    expect(series[0]?.price.toString()).toBe('110');
    expect(series[1]?.price.toString()).toBe('105');
  });
});
