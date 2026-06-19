import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '@/server';
import type { TraderRiskResponse } from '@/controller/traderRiskResponse';
import {
  buildSummary,
  createMockTraderMetricsRepository,
} from './application/support/mockTraderMetricsRepository';

let server: FastifyInstance | null = null;

afterEach(async () => {
  if (server !== null) {
    await server.close();
    server = null;
  }
});

describe('HTTP API', () => {
  it('GET /rankings returns rankable traders ascending by risk score', async () => {
    const repository = createMockTraderMetricsRepository();
    vi.mocked(repository.findRankableSummaries).mockResolvedValue([
      buildSummary('A', 70),
      buildSummary('B', 30),
    ]);
    server = buildServer(repository);

    const response = await server.inject({ method: 'GET', url: '/rankings' });

    expect(response.statusCode).toBe(200);
    const body = response.json<TraderRiskResponse[]>();
    expect(body.map((trader) => trader.traderAddress)).toEqual(['B', 'A']);
    expect(body[0]?.riskScore).toBe('30');
  });

  it('GET /rankings honours the direction query parameter', async () => {
    const repository = createMockTraderMetricsRepository();
    vi.mocked(repository.findRankableSummaries).mockResolvedValue([
      buildSummary('A', 70),
      buildSummary('B', 30),
    ]);
    server = buildServer(repository);

    const response = await server.inject({ method: 'GET', url: '/rankings?direction=descending' });

    const body = response.json<TraderRiskResponse[]>();
    expect(body.map((trader) => trader.traderAddress)).toEqual(['A', 'B']);
  });

  it('GET /traders/:address returns the trader detail', async () => {
    const repository = createMockTraderMetricsRepository();
    vi.mocked(repository.findSummaryByAddress).mockResolvedValue(buildSummary('A', 70));
    server = buildServer(repository);

    const response = await server.inject({ method: 'GET', url: '/traders/A' });

    expect(response.statusCode).toBe(200);
    expect(response.json<TraderRiskResponse>().traderAddress).toBe('A');
  });

  it('GET /traders/:address returns 404 when the trader is unknown', async () => {
    const repository = createMockTraderMetricsRepository();
    vi.mocked(repository.findSummaryByAddress).mockResolvedValue(null);
    server = buildServer(repository);

    const response = await server.inject({ method: 'GET', url: '/traders/Z' });

    expect(response.statusCode).toBe(404);
  });
});
