import Decimal from 'decimal.js';
import type { IHyperliquidProxy } from '../interface/iHyperliquidProxy';
import type { IPositionRepository } from '../interface/iPositionRepository';
import type { OpenPosition } from '../vo/openPosition';
import type { PositionSnapshotRecord } from '../vo/positionSnapshotRecord';

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

export type PollTraderServiceOptions = {
  /** 無歷史成交時的首次回看時間窗（ms）。 */
  lookbackMilliseconds: number;
  /** 取目前時間（ms epoch）；可注入以利測試。 */
  now?: () => number;
};

/**
 * Domain Service（US-04）：輪詢單一交易員——以 high-watermark 增量抓成交寫入
 * （repository 以 tradeId 去重），並對當前開倉拍下浮虧快照
 * （ROI 未實現報酬率 + 由 positionValue 推得的 markPrice）。
 */
export class PollTraderService {
  private readonly hyperliquidProxy: IHyperliquidProxy;
  private readonly positionRepository: IPositionRepository;
  private readonly lookbackMilliseconds: number;
  private readonly now: () => number;

  constructor(
    hyperliquidProxy: IHyperliquidProxy,
    positionRepository: IPositionRepository,
    options: PollTraderServiceOptions,
  ) {
    this.hyperliquidProxy = hyperliquidProxy;
    this.positionRepository = positionRepository;
    this.lookbackMilliseconds = options.lookbackMilliseconds;
    this.now = options.now ?? (() => Date.now());
  }

  async poll(traderAddress: string): Promise<void> {
    const latest = await this.positionRepository.latestObservedFillTimestamp(traderAddress);
    const startTime = latest ?? this.now() - this.lookbackMilliseconds;
    const fills = await this.hyperliquidProxy.fetchUserFills(traderAddress, startTime);
    await this.positionRepository.saveFills(traderAddress, fills);

    const openPositions = await this.hyperliquidProxy.fetchOpenPositions(traderAddress);
    await this.positionRepository.saveSnapshots(
      traderAddress,
      openPositions.map((position) => this.toSnapshotRecord(position)),
    );
  }

  private toSnapshotRecord(position: OpenPosition): PositionSnapshotRecord {
    const absoluteSize = position.signedSize.abs();
    const entryNotional = position.entryPrice.times(absoluteSize);
    return {
      coin: position.coin,
      markPrice: absoluteSize.isZero() ? ZERO : position.positionValue.dividedBy(absoluteSize),
      unrealizedProfitAndLossPercentage: entryNotional.isZero()
        ? ZERO
        : position.unrealizedProfitAndLoss.dividedBy(entryNotional).times(HUNDRED),
      margin: position.marginUsed,
      leverage: position.leverage,
    };
  }
}
