import { describe, expect, it, vi } from 'vitest';
import { OkxProxy } from '@/infrastructure/okx/okxProxy';

const okxResponse = <TData>(data: TData): Response =>
  new Response(JSON.stringify({ code: '0', msg: '', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const buildProxy = (fetchFunction: typeof fetch): OkxProxy =>
  new OkxProxy({ apiBaseUrl: 'https://www.okx.com', fetchFunction });

describe('OkxProxy', () => {
  it('identifies its provider as okx', () => {
    expect(buildProxy(vi.fn()).provider).toBe('okx');
  });

  it('fetches and normalizes the lead-trader list', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okxResponse([
        {
          ranks: [
            { uniqueCode: '0A3CF5287316F730', aum: '154626.43', nickName: 'Steady first' },
            { uniqueCode: 'BBBB', aum: '2000', nickName: 'b' },
          ],
        },
      ]),
    );

    const traders = await buildProxy(fetchMock).fetchTraderList();

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/api/v5/copytrading/public-lead-traders');
    expect(url).toContain('instType=SWAP');
    expect(traders).toHaveLength(2);
    expect(traders[0]?.address).toBe('0A3CF5287316F730');
    expect(traders[0]?.accountValue.toString()).toBe('154626.43');
  });

  it('carries account return series (chronological) and winRatio from the ranking', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okxResponse([
        {
          ranks: [
            {
              uniqueCode: 'A',
              aum: '1000',
              nickName: 'a',
              winRatio: '0.6',
              // OKX 回傳 newest-first；正規化後應為依時間遞增（chronological）
              pnlRatios: [
                { beginTs: '3000', pnlRatio: '0.03' },
                { beginTs: '2000', pnlRatio: '0.02' },
                { beginTs: '1000', pnlRatio: '0.01' },
              ],
            },
          ],
        },
      ]),
    );

    const traders = await buildProxy(fetchMock).fetchTraderList();

    expect(traders[0]?.winRatio?.toString()).toBe('0.6');
    // ratio→percent（×100）且 chronological（beginTs 1000→3000）
    expect(traders[0]?.accountReturnSeries?.map((value) => value.toString())).toEqual(['1', '2', '3']);
  });

  it('maps each sub-position into open and close activity legs', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okxResponse([
        {
          instId: 'BTC-USDT-SWAP',
          posSide: 'short',
          openAvgPx: '80000',
          subPos: '2',
          openTime: '2000',
          closeAvgPx: '78000',
          closeTime: '3000',
          pnl: '4000',
          lever: '10',
          subPosId: 'S1',
        },
      ]),
    );

    const activities = await buildProxy(fetchMock).fetchPositionActivities('CODE', 0);

    expect(activities).toHaveLength(2);
    const open = activities.find((a) => a.sourceReference === 'S1:open');
    expect(open?.signedSize.toString()).toBe('-2'); // short 開倉 → 負
    expect(open?.price.toString()).toBe('80000');
    expect(open?.occurredAt).toBe(2000);
    const close = activities.find((a) => a.sourceReference === 'S1:close');
    expect(close?.signedSize.toString()).toBe('2'); // 平 short → 正
    expect(close?.price.toString()).toBe('78000');
    expect(close?.realizedProfitAndLoss.toString()).toBe('4000');
    expect(close?.occurredAt).toBe(3000);
  });

  it('filters out sub-positions opened before the since watermark', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okxResponse([
        {
          instId: 'BTC-USDT-SWAP',
          posSide: 'long',
          openAvgPx: '100',
          subPos: '1',
          openTime: '1000',
          closeAvgPx: '110',
          closeTime: '1500',
          pnl: '10',
          lever: '5',
          subPosId: 'OLD',
        },
        {
          instId: 'BTC-USDT-SWAP',
          posSide: 'long',
          openAvgPx: '120',
          subPos: '1',
          openTime: '5000',
          closeAvgPx: '130',
          closeTime: '5500',
          pnl: '10',
          lever: '5',
          subPosId: 'NEW',
        },
      ]),
    );

    const activities = await buildProxy(fetchMock).fetchPositionActivities('CODE', 3000);

    expect(activities.every((a) => a.sourceReference.startsWith('NEW'))).toBe(true);
  });

  it('skips incomplete history sub-positions (empty fields, e.g. net mode)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okxResponse([
        {
          instId: '',
          posSide: 'net',
          openAvgPx: '',
          subPos: '',
          openTime: '2000',
          closeAvgPx: '',
          closeTime: '',
          pnl: '',
          lever: '1',
          subPosId: 'BAD',
        },
        {
          instId: 'BTC-USDT-SWAP',
          posSide: 'short',
          openAvgPx: '80000',
          subPos: '2',
          openTime: '2000',
          closeAvgPx: '78000',
          closeTime: '3000',
          pnl: '4000',
          lever: '10',
          subPosId: 'S1',
        },
      ]),
    );

    const activities = await buildProxy(fetchMock).fetchPositionActivities('CODE', 0);

    expect(activities).toHaveLength(2);
    expect(activities.every((a) => a.sourceReference.startsWith('S1'))).toBe(true);
  });

  it('skips incomplete current sub-positions (empty fields, e.g. net mode)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okxResponse([
        {
          instId: '',
          posSide: 'net',
          openAvgPx: '',
          subPos: '',
          lever: '100',
          margin: '55',
          markPx: '',
          upl: '204',
          uplRatio: '3.7',
          subPosId: 'BAD',
        },
        {
          instId: 'ETH-USDT-SWAP',
          posSide: 'long',
          openAvgPx: '100',
          subPos: '2',
          lever: '10',
          margin: '20',
          markPx: '120',
          upl: '40',
          uplRatio: '0.2',
          subPosId: 'C1',
        },
      ]),
    );

    const positions = await buildProxy(fetchMock).fetchOpenPositions('CODE');

    expect(positions).toHaveLength(1);
    expect(positions[0]?.coin).toBe('ETH-USDT-SWAP');
  });

  it('normalizes current sub-positions into open positions (markPrice = markPx)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      okxResponse([
        {
          instId: 'ETH-USDT-SWAP',
          posSide: 'long',
          openAvgPx: '100',
          subPos: '2',
          lever: '10',
          margin: '20',
          markPx: '120',
          upl: '40',
          uplRatio: '0.2',
          subPosId: 'C1',
        },
      ]),
    );

    const positions = await buildProxy(fetchMock).fetchOpenPositions('CODE');

    expect(positions[0]?.coin).toBe('ETH-USDT-SWAP');
    expect(positions[0]?.signedSize.toString()).toBe('2');
    expect(positions[0]?.entryPrice.toString()).toBe('100');
    expect(positions[0]?.positionValue.toString()).toBe('240'); // markPx × subPos
    expect(positions[0]?.unrealizedProfitAndLoss.toString()).toBe('40');
    expect(positions[0]?.leverage.toString()).toBe('10');
  });
});
