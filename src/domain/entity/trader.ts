import Decimal from 'decimal.js';
import type { TraderRiskDto } from '../dto/traderRiskDto';
import type { TraderMetrics } from '../vo/traderMetrics';
import type { Provider } from '../vo/provider';
import { DEFAULT_RISK_SCORE_WEIGHTS, type RiskScoreWeights } from '../vo/riskScoreWeights';
import type { Position } from './position';

const ZERO = new Decimal(0);
const ONE = new Decimal(1);
const HUNDRED = new Decimal(100);
const PERCENTILE_90 = new Decimal('0.9');
const MAX_ADVERSE_EXCURSION_CAP = new Decimal(50);
const AVERAGE_LEVERAGE_CAP = new Decimal(20);
const RETURN_DOWNSIDE_DEVIATION_CAP = new Decimal(30);
const DEFAULT_MINIMUM_CLOSED_POSITIONS = 20;
const DEFAULT_METRICS_WINDOW_DAYS = 90;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export type TraderReconstructOptions = {
  minimumClosedPositions?: number;
  weights?: RiskScoreWeights;
  /** 盈虧/勝率/下行標準差的回看時間窗（天），預設 90（見 PRD 第 4 章）。 */
  windowDays?: number;
  /** 時間窗的基準時刻（ms），預設為現在；供測試注入固定時間。 */
  asOf?: number;
};

/**
 * 充血實體：一位交易員（aggregate）。彙總指標（riskScore 等）為其行為。
 * 兩種建構：`reconstruct`（由倉位重算）與 `fromStoredMetrics`（由 DB 既有指標 hydrate）；
 * 兩者都化為統一的 TraderMetrics 內部表示，方法一致回傳。
 */
export class Trader {
  private readonly traderProvider: Provider;
  private readonly traderAddress: string;
  private readonly metrics: TraderMetrics;

  private constructor(provider: Provider, traderAddress: string, metrics: TraderMetrics) {
    this.traderProvider = provider;
    this.traderAddress = traderAddress;
    this.metrics = metrics;
  }

  static fromStoredMetrics(
    provider: Provider,
    traderAddress: string,
    metrics: TraderMetrics,
  ): Trader {
    return new Trader(provider, traderAddress, metrics);
  }

  static reconstruct(
    provider: Provider,
    traderAddress: string,
    positions: Position[],
    options: TraderReconstructOptions = {},
  ): Trader {
    const minimumClosedPositions =
      options.minimumClosedPositions ?? DEFAULT_MINIMUM_CLOSED_POSITIONS;
    const weights = options.weights ?? DEFAULT_RISK_SCORE_WEIGHTS;
    const asOf = options.asOf ?? Date.now();
    const windowStart =
      asOf - (options.windowDays ?? DEFAULT_METRICS_WINDOW_DAYS) * MILLISECONDS_PER_DAY;

    // 只有被觀測到開倉（有 snapshot）的倉位才能貢獻指標。
    const considered = positions.filter((position) => position.hasSnapshots());
    // 盈虧/勝率/下行標準差只看時間窗內的已平倉位（PRD 第 4 章「近 90 天」口徑）；
    // 平倉時間未知者保守視為窗內，不靜默丟棄。
    const closed = considered.filter((position) => {
      if (!position.isClosed()) {
        return false;
      }
      const closedAt = position.closedAt();
      return closedAt === null || closedAt >= windowStart;
    });
    const closedPositionCount = closed.length;

    if (closedPositionCount < minimumClosedPositions) {
      return new Trader(provider, traderAddress, {
        maxAdverseExcursionPercentile90: null,
        averagingDownRatio: null,
        winRate: null,
        realizedProfitAndLoss: null,
        returnDownsideDeviation: null,
        averageLeverage: null,
        trapSignal: null,
        riskScore: null,
        closedPositionCount,
        insufficientData: true,
      });
    }

    const percentile90 = (values: Decimal[]): Decimal => {
      const sorted = [...values].sort((left, right) => left.comparedTo(right));
      const lastIndex = sorted.length - 1;
      const rank = new Decimal(lastIndex).times(PERCENTILE_90);
      const lowerIndex = rank.floor().toNumber();
      const fraction = rank.minus(lowerIndex);
      const lower = sorted[lowerIndex];
      if (lower === undefined) {
        throw new RangeError('percentile rank out of range');
      }
      if (fraction.isZero()) {
        return lower;
      }
      const upper = sorted[lowerIndex + 1] ?? lower;
      return lower.plus(upper.minus(lower).times(fraction));
    };

    const downsideDeviation = (returns: Decimal[]): Decimal => {
      const negatives = returns.filter((value) => value.lessThan(ZERO));
      if (negatives.length === 0) {
        return ZERO;
      }
      const count = new Decimal(negatives.length);
      const mean = negatives.reduce((total, value) => total.plus(value), ZERO).dividedBy(count);
      const sumSquaredDeviations = negatives.reduce(
        (total, value) => total.plus(value.minus(mean).pow(2)),
        ZERO,
      );
      return sumSquaredDeviations.dividedBy(count).sqrt();
    };

    const normalize = (value: Decimal, cap: Decimal): Decimal => {
      const ratio = value.dividedBy(cap);
      if (ratio.lessThan(ZERO)) {
        return ZERO;
      }
      return ratio.greaterThan(ONE) ? ONE : ratio;
    };

    const maxAdverseExcursionPercentile90 = percentile90(
      considered.map((position) => position.maxAdverseExcursion().abs()),
    );
    const averagingDownRatio = new Decimal(
      considered.filter((position) => position.isAveragingDown()).length,
    ).dividedBy(considered.length);
    const closedReturns = closed.map((position) => position.realizedReturnPercentage());
    const winRate = new Decimal(
      closedReturns.filter((value) => value.greaterThan(ZERO)).length,
    ).dividedBy(closedReturns.length);
    const realizedProfitAndLoss = closed.reduce(
      (total, position) => total.plus(position.realizedProfitAndLoss()),
      ZERO,
    );
    const returnDownsideDeviation = downsideDeviation(closedReturns);
    const averageLeverage = considered
      .reduce((total, position) => total.plus(position.averageLeverage()), ZERO)
      .dividedBy(considered.length);

    const normalizedMaxAdverseExcursion = normalize(
      maxAdverseExcursionPercentile90,
      MAX_ADVERSE_EXCURSION_CAP,
    );
    const trapSignal = winRate.times(normalizedMaxAdverseExcursion);
    const riskScore = normalizedMaxAdverseExcursion
      .times(weights.maxAdverseExcursion)
      .plus(averagingDownRatio.times(weights.averagingDown))
      .plus(trapSignal.times(weights.trapSignal))
      .plus(
        normalize(returnDownsideDeviation, RETURN_DOWNSIDE_DEVIATION_CAP).times(
          weights.returnDownsideDeviation,
        ),
      )
      .plus(normalize(averageLeverage, AVERAGE_LEVERAGE_CAP).times(weights.leverage))
      .times(HUNDRED);

    return new Trader(provider, traderAddress, {
      maxAdverseExcursionPercentile90,
      averagingDownRatio,
      winRate,
      realizedProfitAndLoss,
      returnDownsideDeviation,
      averageLeverage,
      trapSignal,
      riskScore,
      closedPositionCount,
      insufficientData: false,
    });
  }

  provider(): Provider {
    return this.traderProvider;
  }

  address(): string {
    return this.traderAddress;
  }

  riskScore(): Decimal | null {
    return this.metrics.riskScore;
  }

  isInsufficientData(): boolean {
    return this.metrics.insufficientData;
  }

  /** 取得彙總指標快照供持久化（由 repository 寫入 trader_metrics）。 */
  metricsSnapshot(): TraderMetrics {
    return this.metrics;
  }

  toRiskDto(): TraderRiskDto {
    const asText = (value: Decimal | null): string | null =>
      value === null ? null : value.toString();
    return {
      provider: this.traderProvider,
      traderAddress: this.traderAddress,
      insufficientData: this.metrics.insufficientData,
      closedPositionCount: this.metrics.closedPositionCount,
      riskScore: asText(this.metrics.riskScore),
      maxAdverseExcursionPercentile90: asText(this.metrics.maxAdverseExcursionPercentile90),
      averagingDownRatio: asText(this.metrics.averagingDownRatio),
      winRate: asText(this.metrics.winRate),
      realizedProfitAndLoss: asText(this.metrics.realizedProfitAndLoss),
      returnDownsideDeviation: asText(this.metrics.returnDownsideDeviation),
      averageLeverage: asText(this.metrics.averageLeverage),
      trapSignal: asText(this.metrics.trapSignal),
    };
  }
}
