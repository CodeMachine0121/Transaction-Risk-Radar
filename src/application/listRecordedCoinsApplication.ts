import type { RecordedCoinsDto } from '../domain/dto/recordedCoinsDto';
import type { RecordedCoinService } from '../domain/service/recordedCoinService';

/** 用例：回傳有共識紀錄的 coin 清單（/backtest 的可查詢標的字典）。 */
export class ListRecordedCoinsApplication {
  private readonly recordedCoinService: RecordedCoinService;

  constructor(recordedCoinService: RecordedCoinService) {
    this.recordedCoinService = recordedCoinService;
  }

  listRecordedCoins(): Promise<RecordedCoinsDto> {
    return this.recordedCoinService.listRecordedCoins();
  }
}
