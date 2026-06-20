import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '@/server';
import type { TraderRiskDto } from '@/domain/dto/traderRiskDto';
import { Provider } from '@/domain/vo/provider';
import {
  buildTrader,
  createMockTraderRepository,
} from './application/support/mockTraderRepository';

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
    server = buildServer(repository);

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
    server = buildServer(repository);

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
    server = buildServer(repository);

    const response = await server.inject({ method: 'GET', url: '/traders' });

    expect(response.statusCode).toBe(200);
    const body = response.json<TraderRiskDto[]>();
    expect(body.map((dto) => dto.traderAddress).sort()).toEqual(['A', 'B']);
  });

  it('GET /traders passes ?provider= to the repository', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findAllTraders).mockResolvedValue([]);
    server = buildServer(repository);

    await server.inject({ method: 'GET', url: '/traders?provider=okx' });

    expect(repository.findAllTraders).toHaveBeenCalledWith(Provider.Okx);
  });

  it('GET /traders/:address returns the trader detail', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findTrader).mockResolvedValue(buildTrader('A', 70));
    server = buildServer(repository);

    const response = await server.inject({ method: 'GET', url: '/traders/A' });

    expect(response.statusCode).toBe(200);
    expect(response.json<TraderRiskDto>().traderAddress).toBe('A');
  });

  it('GET /traders/:address returns 404 when the trader is unknown', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findTrader).mockResolvedValue(null);
    server = buildServer(repository);

    const response = await server.inject({ method: 'GET', url: '/traders/Z' });

    expect(response.statusCode).toBe(404);
  });

  it('GET /traders/:address resolves by ?provider= (defaults hyperliquid)', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findTrader).mockResolvedValue(buildTrader('A', 70));
    server = buildServer(repository);

    await server.inject({ method: 'GET', url: '/traders/A?provider=okx' });
    expect(repository.findTrader).toHaveBeenCalledWith(Provider.Okx, 'A');

    await server.inject({ method: 'GET', url: '/traders/A' });
    expect(repository.findTrader).toHaveBeenCalledWith(Provider.Hyperliquid, 'A');
  });
});
