import Decimal from 'decimal.js';
import type { BacktestReportDto, HorizonResultDto } from '../dto/backtestReportDto';
import type { ConsensusSnapshotPoint } from '../vo/consensusSnapshotPoint';
import type { PricePoint } from '../vo/pricePoint';

const ZERO = new Decimal(0);

type Lean = 'long' | 'short' | 'neutral';

/**
 * Domain Service（B2-US-05）：純函式回測評估。給定歷史共識序列 + 對照價格序列，
 * 算每個 horizon 的方向命中率與對齊前向報酬。**離線、可注入價格、無 I/O。**
 */
export class BacktestEvaluatorService {
  private readonly directionEpsilon: Decimal;

  constructor(options: { directionEpsilon?: Decimal } = {}) {
    this.directionEpsilon = options.directionEpsilon ?? ZERO;
  }

  evaluate(
    coin: string,
    series: ConsensusSnapshotPoint[],
    priceSeries: PricePoint[],
    horizonsMilliseconds: number[],
  ): BacktestReportDto {
    const sortedPrices = [...priceSeries].sort((left, right) => left.timestamp - right.timestamp);
    const directional = series.filter((point) => this.leanOf(point) !== 'neutral');
    return {
      coin,
      evaluatedSignalCount: directional.length,
      horizons: horizonsMilliseconds.map((horizon) =>
        this.evaluateHorizon(directional, sortedPrices, horizon),
      ),
    };
  }

  private evaluateHorizon(
    directional: ConsensusSnapshotPoint[],
    sortedPrices: PricePoint[],
    horizonMilliseconds: number,
  ): HorizonResultDto {
    let sampleCount = 0;
    let hitCount = 0;
    let alignedReturnSum = ZERO;
    for (const point of directional) {
      const entry = this.priceAtOrAfter(sortedPrices, point.capturedAt);
      const exit = this.priceAtOrAfter(sortedPrices, point.capturedAt + horizonMilliseconds);
      if (entry === undefined || exit === undefined || entry.isZero()) {
        continue;
      }
      const forwardReturn = exit.minus(entry).dividedBy(entry);
      const aligned = this.leanOf(point) === 'long' ? forwardReturn : forwardReturn.negated();
      sampleCount += 1;
      alignedReturnSum = alignedReturnSum.plus(aligned);
      if (aligned.greaterThan(ZERO)) {
        hitCount += 1;
      }
    }
    const count = new Decimal(sampleCount);
    return {
      horizonMilliseconds,
      sampleCount,
      signalHitRate: sampleCount === 0 ? '0' : new Decimal(hitCount).dividedBy(count).toString(),
      averageForwardReturn: sampleCount === 0 ? '0' : alignedReturnSum.dividedBy(count).toString(),
    };
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
