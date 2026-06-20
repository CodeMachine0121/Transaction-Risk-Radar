import Decimal from 'decimal.js';
import type { CoinConsensusDto } from '../dto/coinConsensusDto';
import type { EntryLean, EntrySignalDto, EntryVerdict } from '../dto/entrySignalDto';
import type { EntrySignalReportDto } from '../dto/entrySignalReportDto';
import type { SafeCohortConsensusDto } from '../dto/safeCohortConsensusDto';
import {
  DEFAULT_ENTRY_SIGNAL_THRESHOLDS,
  type EntrySignalThresholds,
} from '../vo/entrySignalThresholds';

const ZERO = new Decimal(0);
const ONE = new Decimal(1);
const AVOID_QUALITY_FACTOR = new Decimal('0.3');
const DISCLAIMER =
  '【experimental／未經回測校準】本訊號為安全群共識經規則導出的決策輔助，非下單指令、非倉位建議、非獲利保證。鏈上永續為負和遊戲，方向一致不代表會獲利；規則的預測力尚待回測驗證，請勿據此重壓。';

/**
 * Domain Service（B1）：把每個 coin 的安全群共識轉成可解釋、分級的進場傾向訊號。
 * 規則門檻可注入（待 B2 回測校準）；輸出恆帶 experimental。**描述→半建議的決策層，非下單。**
 */
export class EntrySignalService {
  private readonly thresholds: EntrySignalThresholds;

  constructor(thresholds: EntrySignalThresholds = DEFAULT_ENTRY_SIGNAL_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  evaluate(consensus: SafeCohortConsensusDto): EntrySignalReportDto {
    return {
      disclaimer: DISCLAIMER,
      experimental: true,
      signals: consensus.coins.map((coin) => this.evaluateCoin(coin)),
    };
  }

  private evaluateCoin(coin: CoinConsensusDto): EntrySignalDto {
    const thresholds = this.thresholds;
    const bias = new Decimal(coin.convictionWeightedDirectionBias);
    const strength = new Decimal(coin.consensusStrength);
    const averageLeverage = new Decimal(coin.averageLeverage);
    const reasons: string[] = [];

    const lean: EntryLean = bias.greaterThan(thresholds.directionEpsilon)
      ? 'long'
      : bias.lessThan(thresholds.directionEpsilon.negated())
        ? 'short'
        : 'neutral';

    const verdict = this.decideVerdict(coin, lean, strength, averageLeverage, reasons);
    const setupQuality = this.scoreSetupQuality(verdict, strength);

    return { coin: coin.coin, lean, setupQuality: setupQuality.toString(), verdict, reasons };
  }

  private decideVerdict(
    coin: CoinConsensusDto,
    lean: EntryLean,
    strength: Decimal,
    averageLeverage: Decimal,
    reasons: string[],
  ): EntryVerdict {
    const thresholds = this.thresholds;
    if (lean === 'neutral' || strength.lessThan(thresholds.strengthThreshold)) {
      reasons.push(`方向不明或強度 ${strength} < 門檻 ${thresholds.strengthThreshold}`);
      return 'no-signal';
    }
    if (coin.participantCount < thresholds.minimumSignalParticipants) {
      reasons.push(
        `參與人數 ${coin.participantCount} < ${thresholds.minimumSignalParticipants}（樣本過薄）`,
      );
      return 'no-signal';
    }
    const overLeveraged = averageLeverage.greaterThan(thresholds.leverageCeiling);
    const crowded = strength.greaterThanOrEqualTo(thresholds.crowdedThreshold);
    if (overLeveraged || crowded) {
      if (overLeveraged) {
        reasons.push(`平均槓桿 ${averageLeverage} > 上限 ${thresholds.leverageCeiling}`);
      }
      if (crowded) {
        reasons.push(`一致度極端 ${strength} ≥ ${thresholds.crowdedThreshold}（擁擠反指標）`);
      }
      return 'avoid';
    }
    reasons.push(`${lean} 方向、強度 ${strength}、平均槓桿 ${averageLeverage} 適中`);
    return 'worth-considering';
  }

  private scoreSetupQuality(verdict: EntryVerdict, strength: Decimal): Decimal {
    if (verdict === 'no-signal') {
      return ZERO;
    }
    const quality = verdict === 'avoid' ? strength.times(AVOID_QUALITY_FACTOR) : strength;
    if (quality.greaterThan(ONE)) {
      return ONE;
    }
    return quality.lessThan(ZERO) ? ZERO : quality;
  }
}
