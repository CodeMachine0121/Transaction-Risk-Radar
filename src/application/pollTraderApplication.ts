import Decimal from 'decimal.js';
import type { IHyperliquidProxy, IOpenPosition } from './ports/iHyperliquidProxy';
import type { IPositionRepository, IPositionSnapshotRecord } from './ports/iPositionRepository';

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

const toSnapshotRecord = (position: IOpenPosition): IPositionSnapshotRecord => {
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
};

/**
 * 用例（US-04）：輪詢單一交易員。抓取成交寫入（→ events，repository 以 tradeId 去重），
 * 並對當前開倉拍下浮虧快照（ROI 法的未實現報酬率 + 由 positionValue 推得的 markPrice）。
 */
export class PollTraderApplication {
  private readonly proxy: IHyperliquidProxy;
  private readonly positionRepository: IPositionRepository;

  constructor(proxy: IHyperliquidProxy, positionRepository: IPositionRepository) {
    this.proxy = proxy;
    this.positionRepository = positionRepository;
  }

  async poll(traderAddress: string, fillsSince: number): Promise<void> {
    const fills = await this.proxy.fetchUserFills(traderAddress, fillsSince);
    await this.positionRepository.saveFills(traderAddress, fills);

    const openPositions = await this.proxy.fetchOpenPositions(traderAddress);
    await this.positionRepository.saveSnapshots(traderAddress, openPositions.map(toSnapshotRecord));
  }
}
