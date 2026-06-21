import type { FastifyInstance } from 'fastify';
import type { ListCoinCoverageApplication } from '../application/listCoinCoverageApplication';
import type { CoinCoverageReportDto } from '../domain/dto/coinCoverageReportDto';

/** Controller：GET /coins/coverage（各 coin 的共識覆蓋度，公開）。/backtest 的就緒度儀表。 */
export class CoinCoverageController {
  private readonly application: ListCoinCoverageApplication;

  constructor(application: ListCoinCoverageApplication) {
    this.application = application;
  }

  register(server: FastifyInstance): void {
    server.get(
      '/coins/coverage',
      (): Promise<CoinCoverageReportDto> => this.application.listCoinCoverage(),
    );
  }
}
