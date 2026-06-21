import Decimal from 'decimal.js';
import { HorizonEvaluation } from '../entity/horizonEvaluation';
import type { BacktestReportDto, HorizonResultDto } from '../dto/backtestReportDto';
import {
  DEFAULT_BACKTEST_ADEQUACY_THRESHOLDS,
  type BacktestAdequacyThresholds,
} from '../vo/backtestAdequacyThresholds';
import type { ConsensusSnapshotPoint } from '../vo/consensusSnapshotPoint';
import type { PricePoint } from '../vo/pricePoint';

const ZERO = new Decimal(0);
const DISCLAIMER =
  '【experimental／未經回測校準】本回測為規則預測力的離線評估，非下單指令、非倉位建議、非獲利保證。樣本高度自相關，請以 dataAdequacy 與 independentSampleEstimate 判讀可信度；多數 coin × horizon 資料不足屬正常。';

type Lean = 'long' | 'short' | 'neutral';

/**
 * Domain Service（B2-US-05）：純函式回測評估。過濾出有方向的共識點、為每個 horizon
 * 配對前向價格並餵給 HorizonEvaluation 實體累加，收回各 horizon 的 DTO。
 * **離線、可注入價格、無 I/O；逐 horizon 的統計與充足度分級由實體負責。**
 */
export class BacktestEvaluatorService {
  private readonly directionEpsilon: Decimal;
  private readonly adequacyThresholds: BacktestAdequacyThresholds;

  constructor(
    options: {
      directionEpsilon?: Decimal;
      adequacyThresholds?: BacktestAdequacyThresholds;
    } = {},
  ) {
    this.directionEpsilon = options.directionEpsilon ?? ZERO;
    this.adequacyThresholds = options.adequacyThresholds ?? DEFAULT_BACKTEST_ADEQUACY_THRESHOLDS;
  }

  evaluate(
    coin: string,
    series: ConsensusSnapshotPoint[],
    priceSeries: PricePoint[],
    horizonsMilliseconds: number[],
  ): BacktestReportDto {
    const sortedPrices = [...priceSeries].sort((left, right) => left.timestamp - right.timestamp);
    const directional = series
      .filter((point) => this.leanOf(point) !== 'neutral')
      .sort((left, right) => left.capturedAt - right.capturedAt);
    return {
      coin,
      disclaimer: DISCLAIMER,
      experimental: true,
      evaluatedSignalCount: directional.length,
      horizons: horizonsMilliseconds.map((horizon) =>
        this.evaluateHorizon(directional, sortedPrices, horizon),
      ),
    };
  }

  /** 為單一 horizon 配對前向價格，逐筆餵給實體累加後投影為 DTO。 */
  private evaluateHorizon(
    directional: ConsensusSnapshotPoint[],
    sortedPrices: PricePoint[],
    horizonMilliseconds: number,
  ): HorizonResultDto {
    const evaluation = new HorizonEvaluation(horizonMilliseconds, this.adequacyThresholds);
    for (const point of directional) {
      const entry = this.priceAtOrAfter(sortedPrices, point.capturedAt);
      const exit = this.priceAtOrAfter(sortedPrices, point.capturedAt + horizonMilliseconds);
      if (entry === undefined || exit === undefined || entry.isZero()) {
        continue;
      }
      const forwardReturn = exit.minus(entry).dividedBy(entry);
      evaluation.add(point.capturedAt, this.leanOf(point) === 'long', point.participantCount, forwardReturn);
    }
    return evaluation.toDto();
  }

  private leanOf(point: ConsensusSnapshotPoint): Lean {
    if (point.convictionWeightedDirectionBias.greaterThan(this.directionEpsilon)) {
      return 'long';
    }
    if (point.convictionWeightedDirectionBias.lessThan(this.directionEpsilon.negated())) {
      return 'short';
    }
    return 'neutral';
  }

  /** 取 timestamp ≥ target 的最早價格（PRD：最接近且不早於）。無則 undefined。 */
  private priceAtOrAfter(sortedPrices: PricePoint[], target: number): Decimal | undefined {
    for (const point of sortedPrices) {
      if (point.timestamp >= target) {
        return point.price;
      }
    }
    return undefined;
  }
}
