import Decimal from 'decimal.js';
import { CoinConsensus } from '../entity/coinConsensus';
import type { CoinConsensusDto } from '../dto/coinConsensusDto';
import type { SafeCohortConsensusDto } from '../dto/safeCohortConsensusDto';
import type { Trader } from '../entity/trader';
import type { IPositionRepository } from '../interface/iPositionRepository';
import type { ITraderRepository } from '../interface/iTraderRepository';
import type { ConsensusContribution } from '../vo/consensusContribution';
import type { Provider } from '../vo/provider';
import type { SafeCohortConsensusQuery, Weighting } from '../vo/safeCohortConsensusQuery';

const ZERO = new Decimal(0);
const DEFAULT_MAX_RISK_SCORE = new Decimal(40);
const DEFAULT_MINIMUM_CONSENSUS_PARTICIPANTS = 3;
const DEFAULT_LIMIT = 50;
const DEFAULT_WEIGHTING: Weighting = 'conviction';
const DISCLAIMER =
  '本資料為「安全群」當前持倉的描述性共識，非投資建議、亦非價格預測。鏈上永續為負和遊戲，方向一致不代表會獲利，請勿據此重壓。';

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

    const consensusByCoin = new Map<string, CoinConsensus>();
    for (const contribution of perProvider.flat()) {
      const consensus = consensusByCoin.get(contribution.coin) ?? new CoinConsensus(contribution.coin);
      consensus.add(contribution);
      consensusByCoin.set(contribution.coin, consensus);
    }
    const weighting = query.weighting ?? DEFAULT_WEIGHTING;
    return [...consensusByCoin.values()].map((consensus) => consensus.toDto(weighting));
  }

  /** 取某 provider 安全群的當前持倉，join 回權重 + 計算 conviction 佔比後產出投票清單。 */
  private async accumulateProvider(
    provider: Provider,
    traders: Trader[],
    freshAfter: number,
    now: number,
    newPositionThreshold: number,
  ): Promise<ConsensusContribution[]> {
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
    const contributions: ConsensusContribution[] = [];
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
}
