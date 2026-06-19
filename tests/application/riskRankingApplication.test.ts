import { describe, expect, it, vi } from 'vitest';
import { RiskRankingApplication } from '@/application/riskRankingApplication';
import {
  buildSummary,
  createMockTraderMetricsRepository,
} from './support/mockTraderMetricsRepository';

describe('RiskRankingApplication', () => {
  it('returns traders ranked by ascending risk score by default', async () => {
    const repository = createMockTraderMetricsRepository();
    vi.mocked(repository.findRankableSummaries).mockResolvedValue([
      buildSummary('A', 70),
      buildSummary('B', 30),
      buildSummary('C', 50),
    ]);
    const application = new RiskRankingApplication(repository);

    const ranking = await application.listRanking({});

    expect(ranking.map((trader) => trader.traderAddress)).toEqual(['B', 'C', 'A']);
  });

  it('passes the ranking direction through to the ranking logic', async () => {
    const repository = createMockTraderMetricsRepository();
    vi.mocked(repository.findRankableSummaries).mockResolvedValue([
      buildSummary('A', 70),
      buildSummary('B', 30),
    ]);
    const application = new RiskRankingApplication(repository);

    const ranking = await application.listRanking({ direction: 'descending' });

    expect(ranking.map((trader) => trader.traderAddress)).toEqual(['A', 'B']);
  });
});
