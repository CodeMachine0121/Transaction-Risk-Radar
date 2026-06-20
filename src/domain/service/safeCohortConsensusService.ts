import Decimal from 'decimal.js';
import type { CoinConsensusDto } from '../dto/coinConsensusDto';
import type { SafeCohortConsensusDto } from '../dto/safeCohortConsensusDto';
import type { Trader } from '../entity/trader';
import type { IPositionRepository } from '../interface/iPositionRepository';
import type { ITraderRepository } from '../interface/iTraderRepository';
import type { Provider } from '../vo/provider';
import type { SafeCohortConsensusQuery } from '../vo/safeCohortConsensusQuery';

const ZERO = new Decimal(0);
const DEFAULT_MAX_RISK_SCORE = new Decimal(40);
const DEFAULT_MINIMUM_CONSENSUS_PARTICIPANTS = 3;
const DEFAULT_LIMIT = 50;
const DISCLAIMER =
  '本資料為「安全群」當前持倉的描述性共識，非投資建議、亦非價格預測。鏈上永續為負和遊戲，方向一致不代表會獲利，請勿據此重壓。';

/** 安全群於某 coin 的單筆投票（方向 + 權重 + 槓桿）。 */
type Contribution = { coin: string; isLong: boolean; weight: Decimal; leverage: Decimal };

/** 某 coin 聚合中的累加器。 */
type CoinAccumulator = {
  longCount: number;
  shortCount: number;
  signedWeight: Decimal; // Σ(side × weight)
  totalWeight: Decimal; // Σ weight
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

    const freshAfter = this.now() - this.freshnessWindowMilliseconds;
    const tradersByProvider = new Map<Provider, Trader[]>();
    for (const trader of cohort) {
      const bucket = tradersByProvider.get(trader.provider()) ?? [];
      bucket.push(trader);
      tradersByProvider.set(trader.provider(), bucket);
    }

    const perProvider = await Promise.all(
      [...tradersByProvider].map(([provider, traders]) =>
        this.accumulateProvider(provider, traders, freshAfter),
      ),
    );

    const accumulators = new Map<string, CoinAccumulator>();
    for (const contribution of perProvider.flat()) {
      this.applyContribution(accumulators, contribution);
    }
    return [...accumulators].map(([coin, accumulator]) => this.toDto(coin, accumulator));
  }

  /** 取某 provider 安全群的當前持倉，join 回權重後產出投票清單。 */
  private async accumulateProvider(
    provider: Provider,
    traders: Trader[],
    freshAfter: number,
  ): Promise<Contribution[]> {
    const weightByAddress = new Map(traders.map((trader) => [trader.address(), trader.consensusWeight()]));
    const positions = await this.positionRepository.findCurrentOpenPositions(
      provider,
      [...weightByAddress.keys()],
      freshAfter,
    );
    const contributions: Contribution[] = [];
    for (const position of positions) {
      const weight = weightByAddress.get(position.traderAddress);
      if (weight === undefined || position.signedSize.isZero()) {
        continue;
      }
      contributions.push({
        coin: position.coin,
        isLong: position.signedSize.isPositive(),
        weight,
        leverage: position.leverage,
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
      signedWeight: ZERO,
      totalWeight: ZERO,
      totalLeverage: ZERO,
    };
    const signedWeight = contribution.isLong ? contribution.weight : contribution.weight.negated();
    accumulators.set(contribution.coin, {
      longCount: current.longCount + (contribution.isLong ? 1 : 0),
      shortCount: current.shortCount + (contribution.isLong ? 0 : 1),
      signedWeight: current.signedWeight.plus(signedWeight),
      totalWeight: current.totalWeight.plus(contribution.weight),
      totalLeverage: current.totalLeverage.plus(contribution.leverage),
    });
  }

  private toDto(coin: string, accumulator: CoinAccumulator): CoinConsensusDto {
    const participantCount = accumulator.longCount + accumulator.shortCount;
    const count = new Decimal(participantCount);
    const netDirectionBias = accumulator.totalWeight.isZero()
      ? ZERO
      : accumulator.signedWeight.dividedBy(accumulator.totalWeight);
    return {
      coin,
      netDirectionBias: netDirectionBias.toString(),
      consensusStrength: netDirectionBias.abs().toString(),
      participantCount,
      longCount: accumulator.longCount,
      shortCount: accumulator.shortCount,
      longShareOfParticipants: count.isZero()
        ? '0'
        : new Decimal(accumulator.longCount).dividedBy(count).toString(),
      averageLeverage: count.isZero() ? '0' : accumulator.totalLeverage.dividedBy(count).toString(),
    };
  }
}
