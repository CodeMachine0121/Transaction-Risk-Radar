import type { FastifyInstance } from 'fastify';
import type { ListRecordedCoinsApplication } from '../application/listRecordedCoinsApplication';
import type { RecordedCoinsDto } from '../domain/dto/recordedCoinsDto';

/** Controller：GET /coins（有共識紀錄的標的清單，公開）。/backtest 的可查詢標的字典。 */
export class RecordedCoinController {
  private readonly application: ListRecordedCoinsApplication;

  constructor(application: ListRecordedCoinsApplication) {
    this.application = application;
  }

  register(server: FastifyInstance): void {
    server.get('/coins', (): Promise<RecordedCoinsDto> => this.application.listRecordedCoins());
  }
}
