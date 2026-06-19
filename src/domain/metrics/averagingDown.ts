import Decimal from 'decimal.js';

export type PositionSide = 'long' | 'short';

export interface PositionLifecycleEvent {
  type: 'open' | 'add' | 'reduce' | 'close';
  price: Decimal;
  size: Decimal;
}

/**
 * 偵測倉位是否為「攤平 / 加倉」型（martingale）：
 * 沿生命週期維護加權平均進場價，當出現 `add` 事件、且其價格相對該方向不利
 * （多單加在低於均價、空單加在高於均價）時，視為「往虧損裡加倉」→ 判定為攤平。
 * 僅 open / add 計入均價；reduce / close 不改變平均進場價。
 */
export function detectAveragingDown(side: PositionSide, events: PositionLifecycleEvent[]): boolean {
  let entryCost = new Decimal(0);
  let entrySize = new Decimal(0);

  for (const lifecycleEvent of events) {
    if (lifecycleEvent.type !== 'open' && lifecycleEvent.type !== 'add') {
      continue;
    }
    if (lifecycleEvent.type === 'add' && entrySize.greaterThan(0)) {
      const averageEntryPrice = entryCost.dividedBy(entrySize);
      const addsIntoLoss =
        side === 'long'
          ? lifecycleEvent.price.lessThan(averageEntryPrice)
          : lifecycleEvent.price.greaterThan(averageEntryPrice);
      if (addsIntoLoss) {
        return true;
      }
    }
    entryCost = entryCost.plus(lifecycleEvent.price.times(lifecycleEvent.size));
    entrySize = entrySize.plus(lifecycleEvent.size);
  }

  return false;
}

/**
 * 計算交易員的攤平比例：被判定為攤平的倉位數 / 總倉位數。
 * 比例越高代表越偏馬丁格爾，是 riskScore 的危險因子之一。
 * @param positionFlags 各倉位的 detectAveragingDown 結果
 */
export function computeAveragingDownRatio(positionFlags: boolean[]): Decimal {
  if (positionFlags.length === 0) {
    throw new RangeError('at least one position is required');
  }
  const flaggedCount = positionFlags.filter((isAveragingDown) => isAveragingDown).length;
  return new Decimal(flaggedCount).dividedBy(positionFlags.length);
}
