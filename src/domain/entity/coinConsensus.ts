import Decimal from 'decimal.js';
import type { CoinConsensusDto } from '../dto/coinConsensusDto';
import type { ConsensusContribution } from '../vo/consensusContribution';
import type { Weighting } from '../vo/safeCohortConsensusQuery';

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

/**
 * 充血實體：某一個 coin 的安全群持倉共識。逐筆 `add` 安全群成員的投票，內部吸收
 * risk-加權 與 conviction-加權雙軌的方向聚合，最後 `toDto` 投影為回傳形狀。
 * 跨交易員的編排（抓資料、分組）由 SafeCohortConsensusService 負責。
 */
export class CoinConsensus {
  private readonly coin: string;
  private longCount = 0;
  private shortCount = 0;
  private signedRiskWeight = ZERO; // Σ(side × inverseRiskWeight)
  private totalRiskWeight = ZERO; // Σ inverseRiskWeight
  private signedConvictionWeight = ZERO; // Σ(side × convictionWeight)
  private totalConvictionWeight = ZERO; // Σ convictionWeight
  private totalConvictionShare = ZERO; // Σ convictionShare（算平均用）
  private maxConvictionShare = ZERO; // max convictionShare（單人主導程度）
  private totalLeverage = ZERO;
  private newPositionCount = 0;

  constructor(coin: string) {
    this.coin = coin;
  }

  /** 納入一筆投票，更新雙軌加權與描述統計。 */
  add(contribution: ConsensusContribution): void {
    const sign = contribution.isLong ? ONE : ONE.negated();
    this.longCount += contribution.isLong ? 1 : 0;
    this.shortCount += contribution.isLong ? 0 : 1;
    this.signedRiskWeight = this.signedRiskWeight.plus(sign.times(contribution.inverseRiskWeight));
    this.totalRiskWeight = this.totalRiskWeight.plus(contribution.inverseRiskWeight);
    this.signedConvictionWeight = this.signedConvictionWeight.plus(
      sign.times(contribution.convictionWeight),
    );
    this.totalConvictionWeight = this.totalConvictionWeight.plus(contribution.convictionWeight);
    this.totalConvictionShare = this.totalConvictionShare.plus(contribution.convictionShare);
    if (contribution.convictionShare.greaterThan(this.maxConvictionShare)) {
      this.maxConvictionShare = contribution.convictionShare;
    }
    this.totalLeverage = this.totalLeverage.plus(contribution.leverage);
    this.newPositionCount += contribution.isNew ? 1 : 0;
  }

  participantCount(): number {
    return this.longCount + this.shortCount;
  }

  /** 投影為回傳 DTO；`weighting` 決定 consensusStrength 採哪一軌的方向偏向。 */
  toDto(weighting: Weighting): CoinConsensusDto {
    const participantCount = this.participantCount();
    const count = new Decimal(participantCount);
    const netDirectionBias = this.totalRiskWeight.isZero()
      ? ZERO
      : this.signedRiskWeight.dividedBy(this.totalRiskWeight);
    const convictionWeightedDirectionBias = this.totalConvictionWeight.isZero()
      ? ZERO
      : this.signedConvictionWeight.dividedBy(this.totalConvictionWeight);
    const selectedBias = weighting === 'equal' ? netDirectionBias : convictionWeightedDirectionBias;
    return {
      coin: this.coin,
      netDirectionBias: netDirectionBias.toString(),
      convictionWeightedDirectionBias: convictionWeightedDirectionBias.toString(),
      consensusStrength: selectedBias.abs().toString(),
      participantCount,
      longCount: this.longCount,
      shortCount: this.shortCount,
      longShareOfParticipants: count.isZero()
        ? '0'
        : new Decimal(this.longCount).dividedBy(count).toString(),
      averageConvictionShare: count.isZero()
        ? '0'
        : this.totalConvictionShare.dividedBy(count).toString(),
      maxConvictionShare: this.maxConvictionShare.toString(),
      newPositionCount: this.newPositionCount,
      averageLeverage: count.isZero() ? '0' : this.totalLeverage.dividedBy(count).toString(),
    };
  }
}
