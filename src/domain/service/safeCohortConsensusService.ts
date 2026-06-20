import Decimal from 'decimal.js';
import type { CoinConsensusDto } from '../dto/coinConsensusDto';
import type { SafeCohortConsensusDto } from '../dto/safeCohortConsensusDto';
import type { Trader } from '../entity/trader';
import type { IPositionRepository } from '../interface/iPositionRepository';
import type { ITraderRepository } from '../interface/iTraderRepository';
import type { Provider } from '../vo/provider';
import type { SafeCohortConsensusQuery, Weighting } from '../vo/safeCohortConsensusQuery';

const ZERO = new Decimal(0);
const ONE = new Decimal(1);
const DEFAULT_MAX_RISK_SCORE = new Decimal(40);
const DEFAULT_MINIMUM_CONSENSUS_PARTICIPANTS = 3;
const DEFAULT_LIMIT = 50;
const DEFAULT_WEIGHTING: Weighting = 'conviction';
const DISCLAIMER =
  '本資料為「安全群」當前持倉的描述性共識，非投資建議、亦非價格預測。鏈上永續為負和遊戲，方向一致不代表會獲利，請勿據此重壓。';

/** 安全群於某 coin 的單筆投票（方向 + 兩種權重 + 槓桿）。 */
type Contribution = {
  coin: string;
  isLong: boolean;
  inverseRiskWeight: Decimal; // clamp(1 − riskScore/100)
  convictionShare: Decimal; // positionNotional / 該交易員當前總 notional
  convictionWeight: Decimal; // inverseRiskWeight × convictionShare
  leverage: Decimal;
  isNew: boolean; // firstObservedAt 落在最近一個輪詢間隔內
};

/** 某 coin 聚合中的累加器（risk-加權 與 conviction-加權雙軌）。 */
type CoinAccumulator = {
  longCount: number;
  shortCount: number;
  signedRiskWeight: Decimal; // Σ(side × inverseRiskWeight)
  totalRiskWeight: Decimal; // Σ inverseRiskWeight
  signedConvictionWeight: Decimal; // Σ(side × convictionWeight)
  totalConvictionWeight: Decimal; // Σ convictionWeight
  totalConvictionShare: Decimal; // Σ convictionShare（算平均用）
  maxConvictionShare: Decimal; // max convictionShare（單人主導程度）
  newPositionCount: number; // firstObservedAt 在最近一個輪詢間隔內的人數
  totalLeverage: Decimal;
};

export type SafeCohortConsensusServiceOptions = {
  /** 取現在時刻（ms epoch）；可注入以利測試。 */
  now?: () => number;
  /** 快照須落在此窗內才算當前持倉（ms）。 */
  freshnessWindowMilliseconds: number;
};

/**
 * Domain Service（US-01/US-02）：跨「安全群多位交易員 + 其當前持倉」的方向共識聚合。
 * 安全群 = `findRankableTraders`（已含 `insufficientData=false` + `tier=position`）再以
 * `riskScore ≤ maxRiskScore` 收斂；每人一票、inverse-riskScore 加權。**描述性，非建議。**
 */
export class SafeCohortConsensusService {
  private readonly traderRepository: ITraderRepository;
  private readonly positionRepository: IPositionRepository;
  private readonly now: () => number;
  private readonly freshnessWindowMilliseconds: number;

  constructor(
    traderRepository: ITraderRepository,
    positionRepository: IPositionRepository,
    options: SafeCohortConsensusServiceOptions,
  ) {
    this.traderRepository = traderRepository;
    this.positionRepository = positionRepository;
    this.now = options.now ?? (() => Date.now());
    this.freshnessWindowMilliseconds = options.freshnessWindowMilliseconds;
  }

  async listConsensus(query: SafeCohortConsensusQuery): Promise<SafeCohortConsensusDto> {
    const minimum = query.minimumConsensusParticipants ?? DEFAULT_MINIMUM_CONSENSUS_PARTICIPANTS;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const coins = (await this.computeCoins(query))
      .filter((coin) => coin.participantCount >= minimum)
      .sort((left, right) =>
        new Decimal(right.consensusStrength).comparedTo(new Decimal(left.consensusStrength)),
      )
      .slice(offset, offset + limit);
    return { disclaimer: DISCLAIMER, coins };
  }

  async coinConsensus(
    coin: string,
    query: SafeCohortConsensusQuery,
  ): Promise<SafeCohortConsensusDto | null> {
    const minimum = query.minimumConsensusParticipants ?? DEFAULT_MINIMUM_CONSENSUS_PARTICIPANTS;
    const match = (await this.computeCoins(query)).find((entry) => entry.coin === coin);
    if (match === undefined || match.participantCount < minimum) {
      return null;
    }
    return { disclaimer: DISCLAIMER, coins: [match] };
  }

  private async computeCoins(query: SafeCohortConsensusQuery): Promise<CoinConsensusDto[]> {
    const maxRiskScore =
      query.maxRiskScore === undefined ? DEFAULT_MAX_RISK_SCORE : new Decimal(query.maxRiskScore);
    const cohort = (await this.traderRepository.findRankableTraders(query.provider)).filter(
      (trader) => {
        const riskScore = trader.riskScore();
        return riskScore !== null && riskScore.lessThanOrEqualTo(maxRiskScore);
      },
    );
    if (cohort.length === 0) {
      return [];
    }

    const now = this.now();
    const freshAfter = now - this.freshnessWindowMilliseconds;
    // 一個輪詢間隔 = 新鮮度窗的一半（窗 = 2 × POLL_INTERVAL_MS）；用於判定「新開倉」。
    const newPositionThreshold = this.freshnessWindowMilliseconds / 2;
    const tradersByProvider = new Map<Provider, Trader[]>();
    for (const trader of cohort) {
      const bucket = tradersByProvider.get(trader.provider()) ?? [];
      bucket.push(trader);
      tradersByProvider.set(trader.provider(), bucket);
    }

    const perProvider = await Promise.all(
      [...tradersByProvider].map(([provider, traders]) =>
        this.accumulateProvider(provider, traders, freshAfter, now, newPositionThreshold),
      ),
    );

    const accumulators = new Map<string, CoinAccumulator>();
    for (const contribution of perProvider.flat()) {
      this.applyContribution(accumulators, contribution);
    }
    const weighting = query.weighting ?? DEFAULT_WEIGHTING;
    return [...accumulators].map(([coin, accumulator]) => this.toDto(coin, accumulator, weighting));
  }

  /** 取某 provider 安全群的當前持倉，join 回權重 + 計算 conviction 佔比後產出投票清單。 */
  private async accumulateProvider(
    provider: Provider,
    traders: Trader[],
    freshAfter: number,
    now: number,
    newPositionThreshold: number,
  ): Promise<Contribution[]> {
    const weightByAddress = new Map(traders.map((trader) => [trader.address(), trader.consensusWeight()]));
    const positions = await this.positionRepository.findCurrentOpenPositions(
      provider,
      [...weightByAddress.keys()],
      freshAfter,
    );
    // 每位交易員當前所有持倉的 notional 總和，供 conviction 佔比。
    const totalNotionalByAddress = new Map<string, Decimal>();
    for (const position of positions) {
      if (position.signedSize.isZero()) {
        continue;
      }
      const current = totalNotionalByAddress.get(position.traderAddress) ?? ZERO;
      totalNotionalByAddress.set(position.traderAddress, current.plus(position.positionNotional));
    }
    const contributions: Contribution[] = [];
    for (const position of positions) {
      const inverseRiskWeight = weightByAddress.get(position.traderAddress);
      if (inverseRiskWeight === undefined || position.signedSize.isZero()) {
        continue;
      }
      const totalNotional = totalNotionalByAddress.get(position.traderAddress) ?? ZERO;
      const convictionShare = totalNotional.isZero()
        ? ZERO
        : position.positionNotional.dividedBy(totalNotional);
      contributions.push({
        coin: position.coin,
        isLong: position.signedSize.isPositive(),
        inverseRiskWeight,
        convictionShare,
        convictionWeight: inverseRiskWeight.times(convictionShare),
        leverage: position.leverage,
        isNew: now - position.firstObservedAt <= newPositionThreshold,
      });
    }
    return contributions;
  }

  private applyContribution(
    accumulators: Map<string, CoinAccumulator>,
    contribution: Contribution,
  ): void {
    const current = accumulators.get(contribution.coin) ?? {
      longCount: 0,
      shortCount: 0,
      signedRiskWeight: ZERO,
      totalRiskWeight: ZERO,
      signedConvictionWeight: ZERO,
      totalConvictionWeight: ZERO,
      totalConvictionShare: ZERO,
      maxConvictionShare: ZERO,
      newPositionCount: 0,
      totalLeverage: ZERO,
    };
    const sign = contribution.isLong ? ONE : ONE.negated();
    accumulators.set(contribution.coin, {
      longCount: current.longCount + (contribution.isLong ? 1 : 0),
      shortCount: current.shortCount + (contribution.isLong ? 0 : 1),
      signedRiskWeight: current.signedRiskWeight.plus(sign.times(contribution.inverseRiskWeight)),
      totalRiskWeight: current.totalRiskWeight.plus(contribution.inverseRiskWeight),
      signedConvictionWeight: current.signedConvictionWeight.plus(
        sign.times(contribution.convictionWeight),
      ),
      totalConvictionWeight: current.totalConvictionWeight.plus(contribution.convictionWeight),
      totalConvictionShare: current.totalConvictionShare.plus(contribution.convictionShare),
      maxConvictionShare: contribution.convictionShare.greaterThan(current.maxConvictionShare)
        ? contribution.convictionShare
        : current.maxConvictionShare,
      newPositionCount: current.newPositionCount + (contribution.isNew ? 1 : 0),
      totalLeverage: current.totalLeverage.plus(contribution.leverage),
    });
  }

  private toDto(coin: string, accumulator: CoinAccumulator, weighting: Weighting): CoinConsensusDto {
    const participantCount = accumulator.longCount + accumulator.shortCount;
    const count = new Decimal(participantCount);
    const netDirectionBias = accumulator.totalRiskWeight.isZero()
      ? ZERO
      : accumulator.signedRiskWeight.dividedBy(accumulator.totalRiskWeight);
    const convictionWeightedDirectionBias = accumulator.totalConvictionWeight.isZero()
      ? ZERO
      : accumulator.signedConvictionWeight.dividedBy(accumulator.totalConvictionWeight);
    const selectedBias =
      weighting === 'equal' ? netDirectionBias : convictionWeightedDirectionBias;
    return {
      coin,
      netDirectionBias: netDirectionBias.toString(),
      convictionWeightedDirectionBias: convictionWeightedDirectionBias.toString(),
      consensusStrength: selectedBias.abs().toString(),
      participantCount,
      longCount: accumulator.longCount,
      shortCount: accumulator.shortCount,
      longShareOfParticipants: count.isZero()
        ? '0'
        : new Decimal(accumulator.longCount).dividedBy(count).toString(),
      averageConvictionShare: count.isZero()
        ? '0'
        : accumulator.totalConvictionShare.dividedBy(count).toString(),
      maxConvictionShare: accumulator.maxConvictionShare.toString(),
      newPositionCount: accumulator.newPositionCount,
      averageLeverage: count.isZero() ? '0' : accumulator.totalLeverage.dividedBy(count).toString(),
    };
  }
}
