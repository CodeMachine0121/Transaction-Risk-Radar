import Decimal from 'decimal.js';
import { median } from '../../shared/math/median';
import type {
  BacktestAdequacyLevel,
  BacktestDataAdequacy,
  HorizonResultDto,
} from '../dto/backtestReportDto';
import type { BacktestAdequacyThresholds } from '../vo/backtestAdequacyThresholds';

const ZERO = new Decimal(0);

/**
 * 充血實體：單一 horizon 的回測累加器。逐筆 `add` 有效樣本（已對齊方向的前向報酬），
 * 內部吸收命中率、獨立樣本（非重疊窗）、日曆跨度、參與深度等統計，`toDto` 投影為
 * 含資料充足度分級的回傳形狀。跨序列的編排（過濾 directional、配對價格）由
 * BacktestEvaluatorService 負責。
 */
export class HorizonEvaluation {
  private readonly horizonMilliseconds: number;
  private readonly thresholds: BacktestAdequacyThresholds;
  private sampleCount = 0;
  private hitCount = 0;
  private alignedReturnSum = ZERO;
  private independentSampleEstimate = 0;
  private nextIndependentEligibleAt = -Infinity; // 非重疊窗：下一個獨立樣本的最早允許時間
  private firstSampledAt = 0;
  private lastSampledAt = 0;
  private readonly sampledParticipantCounts: number[] = [];

  constructor(horizonMilliseconds: number, thresholds: BacktestAdequacyThresholds) {
    this.horizonMilliseconds = horizonMilliseconds;
    this.thresholds = thresholds;
  }

  /** 納入一筆有效樣本（兩端皆有對照價）；更新命中、獨立樣本、跨度與參與深度。 */
  add(capturedAt: number, isLong: boolean, participantCount: number, forwardReturn: Decimal): void {
    const aligned = isLong ? forwardReturn : forwardReturn.negated();
    if (this.sampleCount === 0) {
      this.firstSampledAt = capturedAt;
    }
    this.lastSampledAt = capturedAt;
    this.sampledParticipantCounts.push(participantCount);
    this.sampleCount += 1;
    this.alignedReturnSum = this.alignedReturnSum.plus(aligned);
    if (aligned.greaterThan(ZERO)) {
      this.hitCount += 1;
    }
    if (capturedAt >= this.nextIndependentEligibleAt) {
      this.independentSampleEstimate += 1;
      this.nextIndependentEligibleAt = capturedAt + this.horizonMilliseconds;
    }
  }

  /** 投影為回傳 DTO（含資料充足度分級）。 */
  toDto(): HorizonResultDto {
    const count = new Decimal(this.sampleCount);
    return {
      horizonMilliseconds: this.horizonMilliseconds,
      sampleCount: this.sampleCount,
      independentSampleEstimate: this.independentSampleEstimate,
      signalHitRate:
        this.sampleCount === 0 ? '0' : new Decimal(this.hitCount).dividedBy(count).toString(),
      averageForwardReturn:
        this.sampleCount === 0 ? '0' : this.alignedReturnSum.dividedBy(count).toString(),
      dataAdequacy: this.dataAdequacy(),
    };
  }

  /**
   * 三軸（獨立樣本／日曆跨度／參與深度）合成充足度分級，採**木桶短板**：
   * 樣本數 + 跨度定基礎級別，典型參與人數低於下限再封頂至 smoke-test。reasons 必填。
   */
  private dataAdequacy(): BacktestDataAdequacy {
    const thresholds = this.thresholds;
    const spanMilliseconds = this.sampleCount === 0 ? 0 : this.lastSampledAt - this.firstSampledAt;
    const typicalParticipantCount = median(this.sampledParticipantCounts);
    const bySamples: BacktestAdequacyLevel =
      this.independentSampleEstimate < thresholds.smokeTestMinimum
        ? 'insufficient'
        : this.independentSampleEstimate < thresholds.trustworthyMinimum
          ? 'smoke-test'
          : spanMilliseconds >= thresholds.adequateSpanMilliseconds
            ? 'adequate'
            : 'preliminary';
    const thinParticipation = typicalParticipantCount < thresholds.participationFloor;
    const level = thinParticipation ? this.capAtSmokeTest(bySamples) : bySamples;
    const reasons = [
      `獨立樣本 ${this.independentSampleEstimate}（smoke ${thresholds.smokeTestMinimum} / trust ${thresholds.trustworthyMinimum}）`,
      `日曆跨度 ${spanMilliseconds}ms（adequate 門檻 ${thresholds.adequateSpanMilliseconds}ms）`,
      `典型參與人數 ${typicalParticipantCount}（下限 ${thresholds.participationFloor}${thinParticipation ? '，已封頂 smoke-test' : ''}）`,
    ];
    return { level, reasons };
  }

  /** 木桶封頂：級別不得高於 smoke-test（insufficient 維持不動）。 */
  private capAtSmokeTest(level: BacktestAdequacyLevel): BacktestAdequacyLevel {
    return level === 'preliminary' || level === 'adequate' ? 'smoke-test' : level;
  }
}
