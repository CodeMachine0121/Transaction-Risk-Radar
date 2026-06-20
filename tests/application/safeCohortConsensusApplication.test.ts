import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { SafeCohortConsensusApplication } from '@/application/safeCohortConsensusApplication';
import { SafeCohortConsensusService } from '@/domain/service/safeCohortConsensusService';
import type { CurrentOpenPosition } from '@/domain/vo/currentOpenPosition';
import { Provider } from '@/domain/vo/provider';
import { buildTrader, createMockTraderRepository } from './support/mockTraderRepository';
import { createMockPositionRepository } from './support/mockPositionRepository';

const position = (
  traderAddress: string,
  coin: string,
  signedSize: number,
  leverage: number,
  positionNotional = Math.abs(signedSize) * 100,
  capturedAt = 1000,
  firstObservedAt = capturedAt,
): CurrentOpenPosition => ({
  traderAddress,
  coin,
  signedSize: new Decimal(signedSize),
  leverage: new Decimal(leverage),
  positionNotional: new Decimal(positionNotional),
  capturedAt,
  firstObservedAt,
});

const buildApplication = (
  traders: ReturnType<typeof createMockTraderRepository>,
  positions: ReturnType<typeof createMockPositionRepository>,
): SafeCohortConsensusApplication =>
  new SafeCohortConsensusApplication(
    new SafeCohortConsensusService(traders, positions, { freshnessWindowMilliseconds: 60_000 }),
  );

describe('SafeCohortConsensusApplication', () => {
  it('aggregates net direction, counts and average leverage for a coin (equal weight)', async () => {
    const traders = createMockTraderRepository();
    vi.mocked(traders.findRankableTraders).mockResolvedValue([
      buildTrader('A', 0),
      buildTrader('B', 0),
      buildTrader('C', 0),
      buildTrader('D', 0),
    ]);
    const positions = createMockPositionRepository();
    vi.mocked(positions.findCurrentOpenPositions).mockResolvedValue([
      position('A', 'BTC', 5, 10),
      position('B', 'BTC', 3, 10),
      position('C', 'BTC', 1, 10),
      position('D', 'BTC', -2, 10),
    ]);
    const application = buildApplication(traders, positions);

    const result = await application.listConsensus({});

    expect(result.coins).toHaveLength(1);
    const btc = result.coins[0];
    expect(btc?.coin).toBe('BTC');
    expect(btc?.participantCount).toBe(4);
    expect(btc?.longCount).toBe(3);
    expect(btc?.shortCount).toBe(1);
    expect(btc?.netDirectionBias).toBe('0.5'); // (3 - 1) / 4
    expect(btc?.consensusStrength).toBe('0.5');
    expect(btc?.longShareOfParticipants).toBe('0.75');
    expect(btc?.averageLeverage).toBe('10');
    expect(result.disclaimer.length).toBeGreaterThan(0);
  });

  it('weights each vote inverse to riskScore', async () => {
    const traders = createMockTraderRepository();
    vi.mocked(traders.findRankableTraders).mockResolvedValue([
      buildTrader('SAFE', 0), // weight 1, long
      buildTrader('RISKY', 40), // weight 0.6, short
    ]);
    const positions = createMockPositionRepository();
    vi.mocked(positions.findCurrentOpenPositions).mockResolvedValue([
      position('SAFE', 'ETH', 4, 10),
      position('RISKY', 'ETH', -1, 6),
    ]);
    const application = buildApplication(traders, positions);

    const result = await application.listConsensus({ minimumConsensusParticipants: 1 });

    const eth = result.coins[0];
    expect(eth?.netDirectionBias).toBe('0.25'); // (1 - 0.6) / (1 + 0.6)
    expect(eth?.consensusStrength).toBe('0.25');
    expect(eth?.averageLeverage).toBe('8'); // (10 + 6) / 2
  });

  it('deweights diversified whale books via conviction weighting (can flip the lean)', async () => {
    const traders = createMockTraderRepository();
    vi.mocked(traders.findRankableTraders).mockResolvedValue([
      buildTrader('FOCUS', 0),
      buildTrader('WHALE1', 0),
      buildTrader('WHALE2', 0),
    ]);
    const positions = createMockPositionRepository();
    vi.mocked(positions.findCurrentOpenPositions).mockResolvedValue([
      position('FOCUS', 'BTC', 1, 10, 1000), // 只押 BTC → convictionShare 1
      position('WHALE1', 'BTC', -1, 10, 100), // BTC 佔其書 100/1000 = 0.1
      position('WHALE1', 'ALT1', 1, 10, 900),
      position('WHALE2', 'BTC', -1, 10, 100),
      position('WHALE2', 'ALT2', 1, 10, 900),
    ]);
    const application = buildApplication(traders, positions);

    const btc = (await application.listConsensus({})).coins.find((c) => c.coin === 'BTC');

    expect(btc?.participantCount).toBe(3);
    expect(Number(btc?.netDirectionBias)).toBeLessThan(0); // 人頭/risk 加權：2 空 1 多 → 偏空
    expect(Number(btc?.convictionWeightedDirectionBias)).toBeGreaterThan(0); // conviction：聚焦多單勝出
    expect(Number(btc?.convictionWeightedDirectionBias)).toBeCloseTo(2 / 3, 4); // 0.8 / 1.2
  });

  it('excludes traders above maxRiskScore from the cohort and from the query to positions', async () => {
    const traders = createMockTraderRepository();
    vi.mocked(traders.findRankableTraders).mockResolvedValue([
      buildTrader('S1', 10),
      buildTrader('S2', 10),
      buildTrader('S3', 10),
      buildTrader('RISKY', 60), // > default maxRiskScore 40 → excluded
    ]);
    const positions = createMockPositionRepository();
    vi.mocked(positions.findCurrentOpenPositions).mockResolvedValue([
      position('S1', 'BTC', 1, 10),
      position('S2', 'BTC', 1, 10),
      position('S3', 'BTC', 1, 10),
      position('RISKY', 'BTC', -1, 10), // even if returned, no weight → not counted
    ]);
    const application = buildApplication(traders, positions);

    const result = await application.listConsensus({});

    expect(positions.findCurrentOpenPositions).toHaveBeenCalledWith(
      Provider.Hyperliquid,
      ['S1', 'S2', 'S3'],
      expect.any(Number),
    );
    expect(result.coins[0]?.participantCount).toBe(3);
    expect(result.coins[0]?.netDirectionBias).toBe('1');
  });

  it('drops coins below the minimum participant threshold (default 3)', async () => {
    const traders = createMockTraderRepository();
    vi.mocked(traders.findRankableTraders).mockResolvedValue([buildTrader('A', 0), buildTrader('B', 0)]);
    const positions = createMockPositionRepository();
    vi.mocked(positions.findCurrentOpenPositions).mockResolvedValue([
      position('A', 'BTC', 1, 10),
      position('B', 'BTC', 1, 10),
    ]);
    const application = buildApplication(traders, positions);

    expect((await application.listConsensus({})).coins).toHaveLength(0); // 2 < 3
    expect((await application.listConsensus({ minimumConsensusParticipants: 2 })).coins).toHaveLength(1);
  });

  it('derives freshAfter from injected now minus the freshness window', async () => {
    const traders = createMockTraderRepository();
    vi.mocked(traders.findRankableTraders).mockResolvedValue([buildTrader('A', 0)]);
    const positions = createMockPositionRepository();
    const service = new SafeCohortConsensusService(traders, positions, {
      now: () => 100_000,
      freshnessWindowMilliseconds: 60_000,
    });

    await service.listConsensus({});

    expect(positions.findCurrentOpenPositions).toHaveBeenCalledWith(Provider.Hyperliquid, ['A'], 40_000);
  });

  it('excludes flat positions (signedSize 0)', async () => {
    const traders = createMockTraderRepository();
    vi.mocked(traders.findRankableTraders).mockResolvedValue([
      buildTrader('A', 0),
      buildTrader('B', 0),
      buildTrader('C', 0),
      buildTrader('D', 0),
    ]);
    const positions = createMockPositionRepository();
    vi.mocked(positions.findCurrentOpenPositions).mockResolvedValue([
      position('A', 'BTC', 1, 10),
      position('B', 'BTC', 1, 10),
      position('C', 'BTC', 1, 10),
      position('D', 'BTC', 0, 10), // flat → excluded
    ]);
    const application = buildApplication(traders, positions);

    expect((await application.listConsensus({})).coins[0]?.participantCount).toBe(3);
  });

  it('sorts coins by consensus strength descending and paginates', async () => {
    const traders = createMockTraderRepository();
    vi.mocked(traders.findRankableTraders).mockResolvedValue(
      ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'].map((address) => buildTrader(address, 0)),
    );
    const positions = createMockPositionRepository();
    vi.mocked(positions.findCurrentOpenPositions).mockResolvedValue([
      position('t1', 'STRONG', 1, 10),
      position('t2', 'STRONG', 1, 10), // strength 1
      position('t3', 'MID', 1, 10),
      position('t4', 'MID', 1, 10),
      position('t5', 'MID', 1, 10),
      position('t6', 'MID', -1, 10), // strength 0.5
      position('t7', 'FLAT', 1, 10),
      position('t8', 'FLAT', -1, 10), // strength 0
    ]);
    const application = buildApplication(traders, positions);

    const all = await application.listConsensus({ minimumConsensusParticipants: 1 });
    expect(all.coins.map((coin) => coin.coin)).toEqual(['STRONG', 'MID', 'FLAT']);

    const page = await application.listConsensus({ minimumConsensusParticipants: 1, offset: 1, limit: 1 });
    expect(page.coins.map((coin) => coin.coin)).toEqual(['MID']);
  });

  it('returns a single coin via coinConsensus, or null below the participant threshold', async () => {
    const traders = createMockTraderRepository();
    vi.mocked(traders.findRankableTraders).mockResolvedValue([
      buildTrader('A', 0),
      buildTrader('B', 0),
      buildTrader('C', 0),
    ]);
    const positions = createMockPositionRepository();
    vi.mocked(positions.findCurrentOpenPositions).mockResolvedValue([
      position('A', 'BTC', 1, 10),
      position('B', 'BTC', 1, 10),
      position('C', 'BTC', 1, 10),
    ]);
    const application = buildApplication(traders, positions);

    const found = await application.coinConsensus('BTC', {});
    expect(found?.coins[0]?.coin).toBe('BTC');
    expect(found?.disclaimer.length).toBeGreaterThan(0);

    expect(await application.coinConsensus('BTC', { minimumConsensusParticipants: 4 })).toBeNull();
    expect(await application.coinConsensus('ETH', {})).toBeNull(); // no positions on ETH
  });
});
