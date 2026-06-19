import Decimal from 'decimal.js';
import type { IHyperliquidProxy } from '../interface/iHyperliquidProxy';
import type { IPositionRepository } from '../interface/iPositionRepository';
import type { OpenPosition } from '../vo/openPosition';
import type { PositionSnapshotRecord } from '../vo/positionSnapshotRecord';

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

/**
 * Domain Service（US-04）：輪詢單一交易員——抓成交寫入（repository 以 tradeId 去重），
 * 並對當前開倉拍下浮虧快照（ROI 未實現報酬率 + 由 positionValue 推得的 markPrice）。
 */
export class PollTraderService {
  private readonly hyperliquidProxy: IHyperliquidProxy;
  private readonly positionRepository: IPositionRepository;

  constructor(hyperliquidProxy: IHyperliquidProxy, positionRepository: IPositionRepository) {
    this.hyperliquidProxy = hyperliquidProxy;
    this.positionRepository = positionRepository;
  }

  async poll(traderAddress: string, fillsSince: number): Promise<void> {
    const fills = await this.hyperliquidProxy.fetchUserFills(traderAddress, fillsSince);
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
