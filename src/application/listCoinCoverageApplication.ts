import type { CoinCoverageReportDto } from '../domain/dto/coinCoverageReportDto';
import type { RecordedCoinService } from '../domain/service/recordedCoinService';

/** 用例：回傳各 coin 的共識覆蓋度（資料累積期的就緒度儀表）。 */
export class ListCoinCoverageApplication {
  private readonly recordedCoinService: RecordedCoinService;

  constructor(recordedCoinService: RecordedCoinService) {
    this.recordedCoinService = recordedCoinService;
  }

  listCoinCoverage(): Promise<CoinCoverageReportDto> {
    return this.recordedCoinService.listCoinCoverage();
  }
}
