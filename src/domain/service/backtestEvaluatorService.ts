import Decimal from 'decimal.js';
import type {
  BacktestAdequacyLevel,
  BacktestReportDto,
  HorizonResultDto,
} from '../dto/backtestReportDto';
import {
  DEFAULT_BACKTEST_ADEQUACY_THRESHOLDS,
  type BacktestAdequacyThresholds,
} from '../vo/backtestAdequacyThresholds';
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
    // 獨立樣本：依時間掃描，每納入一個有效樣本後跳過其 horizon 窗內的後續點，避免重疊高估。
    let independentSampleEstimate = 0;
    let nextIndependentEligibleAt = -Infinity;
    let firstSampledAt = 0;
    let lastSampledAt = 0;
    const sampledParticipantCounts: number[] = [];
    for (const point of directional) {
      const entry = this.priceAtOrAfter(sortedPrices, point.capturedAt);
      const exit = this.priceAtOrAfter(sortedPrices, point.capturedAt + horizonMilliseconds);
      if (entry === undefined || exit === undefined || entry.isZero()) {
        continue;
      }
      const forwardReturn = exit.minus(entry).dividedBy(entry);
      const aligned = this.leanOf(point) === 'long' ? forwardReturn : forwardReturn.negated();
      if (sampleCount === 0) {
        firstSampledAt = point.capturedAt;
      }
      lastSampledAt = point.capturedAt;
      sampledParticipantCounts.push(point.participantCount);
      sampleCount += 1;
      alignedReturnSum = alignedReturnSum.plus(aligned);
      if (aligned.greaterThan(ZERO)) {
        hitCount += 1;
      }
      if (point.capturedAt >= nextIndependentEligibleAt) {
        independentSampleEstimate += 1;
        nextIndependentEligibleAt = point.capturedAt + horizonMilliseconds;
      }
    }
    const count = new Decimal(sampleCount);
    const spanMilliseconds = sampleCount === 0 ? 0 : lastSampledAt - firstSampledAt;
    const typicalParticipantCount = this.median(sampledParticipantCounts);
    return {
      horizonMilliseconds,
      sampleCount,
      independentSampleEstimate,
      signalHitRate: sampleCount === 0 ? '0' : new Decimal(hitCount).dividedBy(count).toString(),
      averageForwardReturn: sampleCount === 0 ? '0' : alignedReturnSum.dividedBy(count).toString(),
      dataAdequacy: this.computeDataAdequacy(
        independentSampleEstimate,
        spanMilliseconds,
        typicalParticipantCount,
      ),
    };
  }

  /**
   * 三軸（獨立樣本／日曆跨度／參與深度）合成充足度分級，採**木桶短板**：
   * 樣本數 + 跨度定基礎級別，典型參與人數低於下限再封頂至 smoke-test。reasons 必填。
   */
  private computeDataAdequacy(
    independentSampleEstimate: number,
    spanMilliseconds: number,
    typicalParticipantCount: number,
  ): { level: BacktestAdequacyLevel; reasons: string[] } {
    const thresholds = this.adequacyThresholds;
    const bySamples: BacktestAdequacyLevel =
      independentSampleEstimate < thresholds.smokeTestMinimum
        ? 'insufficient'
        : independentSampleEstimate < thresholds.trustworthyMinimum
          ? 'smoke-test'
          : spanMilliseconds >= thresholds.adequateSpanMilliseconds
            ? 'adequate'
            : 'preliminary';
    const thinParticipation = typicalParticipantCount < thresholds.participationFloor;
    const level = thinParticipation ? this.capAtSmokeTest(bySamples) : bySamples;
    const reasons = [
      `獨立樣本 ${independentSampleEstimate}（smoke ${thresholds.smokeTestMinimum} / trust ${thresholds.trustworthyMinimum}）`,
      `日曆跨度 ${spanMilliseconds}ms（adequate 門檻 ${thresholds.adequateSpanMilliseconds}ms）`,
      `典型參與人數 ${typicalParticipantCount}（下限 ${thresholds.participationFloor}${thinParticipation ? '，已封頂 smoke-test' : ''}）`,
    ];
    return { level, reasons };
  }

  /** 木桶封頂：級別不得高於 smoke-test（insufficient 維持不動）。 */
  private capAtSmokeTest(level: BacktestAdequacyLevel): BacktestAdequacyLevel {
    return level === 'preliminary' || level === 'adequate' ? 'smoke-test' : level;
  }

  /** 整數序列中位數；空序列回 0。 */
  private median(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
      return sorted[middle] ?? 0;
    }
    return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
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
