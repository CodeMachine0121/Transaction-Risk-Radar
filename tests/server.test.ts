import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Decimal from 'decimal.js';
import { buildServer } from '@/server';
import type { BacktestReportDto } from '@/domain/dto/backtestReportDto';
import type { EntrySignalReportDto } from '@/domain/dto/entrySignalReportDto';
import type { SafeCohortConsensusDto } from '@/domain/dto/safeCohortConsensusDto';
import type { TraderRiskDto } from '@/domain/dto/traderRiskDto';
import type { CurrentOpenPosition } from '@/domain/vo/currentOpenPosition';
import { Provider } from '@/domain/vo/provider';
import { createMockConsensusSnapshotRepository } from './application/support/mockConsensusSnapshotRepository';
import { createMockPriceProxy } from './application/support/mockPriceProxy';
import { createMockPositionRepository } from './application/support/mockPositionRepository';
import {
  buildTrader,
  createMockTraderRepository,
} from './application/support/mockTraderRepository';

const currentPosition = (
  traderAddress: string,
  coin: string,
  signedSize: number,
): CurrentOpenPosition => ({
  traderAddress,
  coin,
  signedSize: new Decimal(signedSize),
  leverage: new Decimal(10),
  positionNotional: new Decimal(Math.abs(signedSize) * 100),
  capturedAt: 1000,
  firstObservedAt: 1000,
});

let server: FastifyInstance | null = null;

afterEach(async () => {
  if (server !== null) {
    await server.close();
    server = null;
  }
});

describe('HTTP API', () => {
  it('GET /rankings returns rankable traders ascending by risk score', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findRankableTraders).mockResolvedValue([
      buildTrader('A', 70),
      buildTrader('B', 30),
    ]);
    server = buildServer(repository, createMockPositionRepository());

    const response = await server.inject({ method: 'GET', url: '/rankings' });

    expect(response.statusCode).toBe(200);
    const body = response.json<TraderRiskDto[]>();
    expect(body.map((trader) => trader.traderAddress)).toEqual(['B', 'A']);
    expect(body[0]?.riskScore).toBe('30');
  });

  it('GET /rankings honours the direction query parameter', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findRankableTraders).mockResolvedValue([
      buildTrader('A', 70),
      buildTrader('B', 30),
    ]);
    server = buildServer(repository, createMockPositionRepository());

    const response = await server.inject({ method: 'GET', url: '/rankings?direction=descending' });

    const body = response.json<TraderRiskDto[]>();
    expect(body.map((trader) => trader.traderAddress)).toEqual(['A', 'B']);
  });

  it('GET /traders lists all traders including insufficientData ones', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findAllTraders).mockResolvedValue([
      buildTrader('A', 70),
      buildTrader('B', null),
    ]);
    server = buildServer(repository, createMockPositionRepository());

    const response = await server.inject({ method: 'GET', url: '/traders' });

    expect(response.statusCode).toBe(200);
    const body = response.json<TraderRiskDto[]>();
    expect(body.map((dto) => dto.traderAddress).sort()).toEqual(['A', 'B']);
  });

  it('GET /traders passes ?provider= to the repository', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findAllTraders).mockResolvedValue([]);
    server = buildServer(repository, createMockPositionRepository());

    await server.inject({ method: 'GET', url: '/traders?provider=okx' });

    expect(repository.findAllTraders).toHaveBeenCalledWith(Provider.Okx);
  });

  it('GET /traders/:address returns the trader detail', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findTrader).mockResolvedValue(buildTrader('A', 70));
    server = buildServer(repository, createMockPositionRepository());

    const response = await server.inject({ method: 'GET', url: '/traders/A' });

    expect(response.statusCode).toBe(200);
    expect(response.json<TraderRiskDto>().traderAddress).toBe('A');
  });

  it('GET /traders/:address returns 404 when the trader is unknown', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findTrader).mockResolvedValue(null);
    server = buildServer(repository, createMockPositionRepository());

    const response = await server.inject({ method: 'GET', url: '/traders/Z' });

    expect(response.statusCode).toBe(404);
  });

  it('GET /traders/:address resolves by ?provider= (defaults hyperliquid)', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findTrader).mockResolvedValue(buildTrader('A', 70));
    server = buildServer(repository, createMockPositionRepository());

    await server.inject({ method: 'GET', url: '/traders/A?provider=okx' });
    expect(repository.findTrader).toHaveBeenCalledWith(Provider.Okx, 'A');

    await server.inject({ method: 'GET', url: '/traders/A' });
    expect(repository.findTrader).toHaveBeenCalledWith(Provider.Hyperliquid, 'A');
  });

  it('GET /consensus returns the disclaimer and per-coin consensus', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findRankableTraders).mockResolvedValue([
      buildTrader('A', 0),
      buildTrader('B', 0),
      buildTrader('C', 0),
    ]);
    const positionRepository = createMockPositionRepository();
    vi.mocked(positionRepository.findCurrentOpenPositions).mockResolvedValue([
      currentPosition('A', 'BTC', 1),
      currentPosition('B', 'BTC', 1),
      currentPosition('C', 'BTC', 1),
    ]);
    server = buildServer(repository, positionRepository);

    const response = await server.inject({ method: 'GET', url: '/consensus' });

    expect(response.statusCode).toBe(200);
    const body = response.json<SafeCohortConsensusDto>();
    expect(body.disclaimer.length).toBeGreaterThan(0);
    expect(body.coins[0]?.coin).toBe('BTC');
    expect(body.coins[0]?.netDirectionBias).toBe('1');
  });

  it('GET /consensus/:coin returns 200 for a coin with enough participants', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findRankableTraders).mockResolvedValue([
      buildTrader('A', 0),
      buildTrader('B', 0),
      buildTrader('C', 0),
    ]);
    const positionRepository = createMockPositionRepository();
    vi.mocked(positionRepository.findCurrentOpenPositions).mockResolvedValue([
      currentPosition('A', 'BTC', 1),
      currentPosition('B', 'BTC', 1),
      currentPosition('C', 'BTC', 1),
    ]);
    server = buildServer(repository, positionRepository);

    const response = await server.inject({ method: 'GET', url: '/consensus/BTC' });

    expect(response.statusCode).toBe(200);
    expect(response.json<SafeCohortConsensusDto>().coins[0]?.coin).toBe('BTC');
  });

  it('GET /consensus/:coin returns 404 when there is no qualifying consensus', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findRankableTraders).mockResolvedValue([buildTrader('A', 0)]);
    const positionRepository = createMockPositionRepository();
    vi.mocked(positionRepository.findCurrentOpenPositions).mockResolvedValue([]);
    server = buildServer(repository, positionRepository);

    const response = await server.inject({ method: 'GET', url: '/consensus/BTC' });

    expect(response.statusCode).toBe(404);
  });

  it('GET /consensus rejects an out-of-range maxRiskScore with 400', async () => {
    server = buildServer(createMockTraderRepository(), createMockPositionRepository());

    const response = await server.inject({ method: 'GET', url: '/consensus?maxRiskScore=200' });

    expect(response.statusCode).toBe(400);
  });

  it('GET /consensus rejects a minParticipants below 1 with 400', async () => {
    server = buildServer(createMockTraderRepository(), createMockPositionRepository());

    const response = await server.inject({ method: 'GET', url: '/consensus?minParticipants=0' });

    expect(response.statusCode).toBe(400);
  });

  it('GET /consensus rejects an unknown weighting with 400', async () => {
    server = buildServer(createMockTraderRepository(), createMockPositionRepository());

    const response = await server.inject({ method: 'GET', url: '/consensus?weighting=bogus' });

    expect(response.statusCode).toBe(400);
  });

  it('GET /signals returns experimental entry signals with a disclaimer', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findRankableTraders).mockResolvedValue(
      ['t1', 't2', 't3', 't4', 't5'].map((address) => buildTrader(address, 0)),
    );
    const positionRepository = createMockPositionRepository();
    vi.mocked(positionRepository.findCurrentOpenPositions).mockResolvedValue([
      currentPosition('t1', 'BTC', 1),
      currentPosition('t2', 'BTC', 1),
      currentPosition('t3', 'BTC', 1),
      currentPosition('t4', 'BTC', 1),
      currentPosition('t5', 'BTC', -1), // 4 多 1 空 → worth-considering long
    ]);
    server = buildServer(repository, positionRepository);

    const response = await server.inject({ method: 'GET', url: '/signals' });

    expect(response.statusCode).toBe(200);
    const body = response.json<EntrySignalReportDto>();
    expect(body.experimental).toBe(true);
    expect(body.disclaimer.length).toBeGreaterThan(0);
    const btc = body.signals.find((signal) => signal.coin === 'BTC');
    expect(btc?.lean).toBe('long');
    expect(btc?.verdict).toBe('worth-considering');
  });

  it('GET /signals rejects an unknown weighting with 400', async () => {
    server = buildServer(createMockTraderRepository(), createMockPositionRepository());

    const response = await server.inject({ method: 'GET', url: '/signals?weighting=bogus' });

    expect(response.statusCode).toBe(400);
  });

  const buildServerWithBacktest = (token?: string): FastifyInstance =>
    buildServer(createMockTraderRepository(), createMockPositionRepository(), {
      backtest: {
        consensusSnapshotRepository: createMockConsensusSnapshotRepository(),
        priceProxy: createMockPriceProxy(),
        token,
      },
    });

  it('GET /backtest returns an experimental report with per-horizon dataAdequacy', async () => {
    server = buildServerWithBacktest('secret');

    const response = await server.inject({
      method: 'GET',
      url: '/backtest?coin=BTC&horizonsHours=4',
      headers: { 'x-internal-token': 'secret' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<BacktestReportDto>();
    expect(body.coin).toBe('BTC');
    expect(body.experimental).toBe(true);
    expect(body.disclaimer.length).toBeGreaterThan(0);
    expect(body.horizons).toHaveLength(1);
    expect(body.horizons[0]?.dataAdequacy.level).toBe('insufficient'); // empty series
    expect(body.horizons[0]?.dataAdequacy.reasons.length).toBeGreaterThan(0);
  });

  it('GET /backtest rejects a missing or wrong internal token with 401', async () => {
    server = buildServerWithBacktest('secret');

    const missing = await server.inject({ method: 'GET', url: '/backtest?coin=BTC' });
    const wrong = await server.inject({
      method: 'GET',
      url: '/backtest?coin=BTC',
      headers: { 'x-internal-token': 'nope' },
    });

    expect(missing.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
  });

  it('GET /backtest rejects a missing coin with 400', async () => {
    server = buildServerWithBacktest('secret');

    const response = await server.inject({
      method: 'GET',
      url: '/backtest?horizonsHours=4',
      headers: { 'x-internal-token': 'secret' },
    });

    expect(response.statusCode).toBe(400);
  });
});
