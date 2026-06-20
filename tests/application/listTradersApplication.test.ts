import { describe, expect, it, vi } from 'vitest';
import { ListTradersApplication } from '@/application/listTradersApplication';
import { TraderListService } from '@/domain/service/traderListService';
import { Provider } from '@/domain/vo/provider';
import { buildTrader, createMockTraderRepository } from './support/mockTraderRepository';

// 注入真實 TraderListService（連帶真實 entity），只 mock repository 介面。
describe('ListTradersApplication', () => {
  it('lists all traders including insufficientData ones (no rankable filter)', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findAllTraders).mockResolvedValue([
      buildTrader('A', 70),
      buildTrader('B', null), // insufficientData
    ]);
    const application = new ListTradersApplication(new TraderListService(repository));

    const list = await application.list({});

    expect(list.map((dto) => dto.traderAddress).sort()).toEqual(['A', 'B']);
    expect(list.find((dto) => dto.traderAddress === 'B')?.insufficientData).toBe(true);
  });

  it('sorts rankable by ascending riskScore, with insufficientData last', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findAllTraders).mockResolvedValue([
      buildTrader('A', 70),
      buildTrader('I', null),
      buildTrader('B', 30),
    ]);
    const application = new ListTradersApplication(new TraderListService(repository));

    const list = await application.list({});

    expect(list.map((dto) => dto.traderAddress)).toEqual(['B', 'A', 'I']);
  });

  it('applies the provider filter and pagination', async () => {
    const repository = createMockTraderRepository();
    vi.mocked(repository.findAllTraders).mockResolvedValue([
      buildTrader('B', 30),
      buildTrader('A', 70),
      buildTrader('C', 90),
    ]);
    const application = new ListTradersApplication(new TraderListService(repository));

    const list = await application.list({ provider: Provider.Okx, offset: 1, limit: 1 });

    expect(repository.findAllTraders).toHaveBeenCalledWith(Provider.Okx);
    expect(list.map((dto) => dto.traderAddress)).toEqual(['A']); // sorted B,A,C → offset1 limit1 → A
  });
});
