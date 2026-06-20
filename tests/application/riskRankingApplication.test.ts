import { describe, expect, it, vi } from 'vitest';
import { RiskRankingApplication } from '@/application/riskRankingApplication';
import { RiskRankingService } from '@/domain/service/riskRankingService';
import { Provider } from '@/domain/vo/provider';
import { buildTrader, createMockTraderRepository } from './support/mockTraderRepository';

// 測 application 時注入「真實的 domain service + entity」，只 mock repository 介面。
describe('RiskRankingApplication', () => {
  it('returns traders ranked by ascending risk score by default', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findRankableTraders).mockResolvedValue([
      buildTrader('A', 70),
      buildTrader('B', 30),
      buildTrader('C', 50),
    ]);
    const application = new RiskRankingApplication(new RiskRankingService(repository));

    const ranking = await application.listRanking({});

    expect(ranking.map((dto) => dto.traderAddress)).toEqual(['B', 'C', 'A']);
    expect(ranking[0]?.riskScore).toBe('30');
  });

  it('ranks descending when requested', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findRankableTraders).mockResolvedValue([
      buildTrader('A', 70),
      buildTrader('B', 30),
    ]);
    const application = new RiskRankingApplication(new RiskRankingService(repository));

    const ranking = await application.listRanking({ direction: 'descending' });

    expect(ranking.map((dto) => dto.traderAddress)).toEqual(['A', 'B']);
  });

  it('filters the ranking by provider when given', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findRankableTraders).mockResolvedValue([buildTrader('A', 70)]);
    const application = new RiskRankingApplication(new RiskRankingService(repository));

    await application.listRanking({ provider: Provider.Okx });

    expect(repository.findRankableTraders).toHaveBeenCalledWith(Provider.Okx);
  });
});
