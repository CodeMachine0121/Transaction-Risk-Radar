import type { BacktestReportDto } from '../domain/dto/backtestReportDto';
import type { IConsensusSnapshotRepository } from '../domain/interface/iConsensusSnapshotRepository';
import type { IPriceProxy } from '../domain/interface/iPriceProxy';
import type { BacktestEvaluatorService } from '../domain/service/backtestEvaluatorService';

/** 用例（B2-US-05）：離線回測——載入歷史共識序列 + 對照價格，委派 evaluator 算預測力。 */
export class BacktestApplication {
  private readonly consensusSnapshotRepository: IConsensusSnapshotRepository;
  private readonly priceProxy: IPriceProxy;
  private readonly backtestEvaluatorService: BacktestEvaluatorService;

  constructor(
    consensusSnapshotRepository: IConsensusSnapshotRepository,
    priceProxy: IPriceProxy,
    backtestEvaluatorService: BacktestEvaluatorService,
  ) {
    this.consensusSnapshotRepository = consensusSnapshotRepository;
    this.priceProxy = priceProxy;
    this.backtestEvaluatorService = backtestEvaluatorService;
  }

  async evaluate(coin: string, since: number, horizonsMilliseconds: number[]): Promise<BacktestReportDto> {
    const series = await this.consensusSnapshotRepository.loadConsensusSeries(coin, since);
    const priceSeries = await this.priceProxy.fetchPriceSeries(coin, since);
    return this.backtestEvaluatorService.evaluate(coin, series, priceSeries, horizonsMilliseconds);
  }
}
