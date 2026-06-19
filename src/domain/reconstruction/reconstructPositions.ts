import Decimal from 'decimal.js';
import type { TraderFill } from '../market/traderFill';
import type { PositionLifecycleEvent, PositionSide } from '../metrics/averagingDown';

export type ReconstructedPosition = {
  coin: string;
  side: PositionSide;
  events: PositionLifecycleEvent[];
  realizedProfitAndLoss: Decimal;
  realizedReturnPercentage: Decimal;
  isClosed: boolean;
};

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

type PositionAccumulator = {
  coin: string;
  side: PositionSide;
  events: PositionLifecycleEvent[];
  /** 進場總成本 Σ(open/add 的 price × size)，作為 ROI 報酬率的分母。 */
  entryCost: Decimal;
  realizedProfitAndLoss: Decimal;
};

const sameSign = (left: Decimal, right: Decimal): boolean =>
  (left.isPositive() && right.isPositive()) || (left.isNegative() && right.isNegative());

const openPosition = (coin: string, signedSize: Decimal): PositionAccumulator => ({
  coin,
  side: signedSize.isPositive() ? 'long' : 'short',
  events: [],
  entryCost: ZERO,
  realizedProfitAndLoss: ZERO,
});

const addEntryEvent = (
  accumulator: PositionAccumulator,
  type: 'open' | 'add',
  price: Decimal,
  size: Decimal,
): void => {
  accumulator.events.push({ type, price, size });
  accumulator.entryCost = accumulator.entryCost.plus(price.times(size));
};

const finalize = (accumulator: PositionAccumulator, isClosed: boolean): ReconstructedPosition => ({
  coin: accumulator.coin,
  side: accumulator.side,
  events: accumulator.events,
  realizedProfitAndLoss: accumulator.realizedProfitAndLoss,
  realizedReturnPercentage: accumulator.entryCost.isZero()
    ? ZERO
    : accumulator.realizedProfitAndLoss.dividedBy(accumulator.entryCost).times(HUNDRED),
  isClosed,
});

const reconstructCoin = (coin: string, coinFills: TraderFill[]): ReconstructedPosition[] => {
  const ordered = [...coinFills].sort((left, right) => left.timestamp - right.timestamp);
  const positions: ReconstructedPosition[] = [];
  let current: PositionAccumulator | null = null;
  let running = ZERO;

  for (const fill of ordered) {
    const signedDelta = fill.side === 'buy' ? fill.size : fill.size.negated();
    const before = running;
    const after = before.plus(signedDelta);

    if (before.isZero()) {
      current = openPosition(coin, after);
      addEntryEvent(current, 'open', fill.price, fill.size);
    } else if (current === null) {
      // 防禦：歷史被截斷（起始即有持倉）時，從這筆 fill 起算一個倉位。
      current = openPosition(coin, after);
      addEntryEvent(current, 'open', fill.price, fill.size);
    } else if (!sameSign(before, after) && !after.isZero()) {
      // 反向穿越：先平掉舊倉，再以剩餘量開反向新倉。
      current.events.push({ type: 'close', price: fill.price, size: before.abs() });
      current.realizedProfitAndLoss = current.realizedProfitAndLoss.plus(fill.closedProfitAndLoss);
      positions.push(finalize(current, true));
      current = openPosition(coin, after);
      addEntryEvent(current, 'open', fill.price, after.abs());
    } else if (after.abs().greaterThan(before.abs())) {
      addEntryEvent(current, 'add', fill.price, fill.size);
    } else {
      current.realizedProfitAndLoss = current.realizedProfitAndLoss.plus(fill.closedProfitAndLoss);
      if (after.isZero()) {
        current.events.push({ type: 'close', price: fill.price, size: fill.size });
        positions.push(finalize(current, true));
        current = null;
      } else {
        current.events.push({ type: 'reduce', price: fill.price, size: fill.size });
      }
    }

    running = after;
  }

  if (current !== null) {
    positions.push(finalize(current, false));
  }
  return positions;
};

/**
 * 將一位交易員的成交（fills）重建為倉位生命週期。
 * 依標的（coin）分組、按時間排序，追蹤帶號持倉量並逐筆分類為 open/add/reduce/close；
 * 持倉歸零即為一個已閉倉位，反向穿越視為「平舊倉＋開新倉」。
 * 報酬率採 ROI 法（realizedProfitAndLoss / 進場總成本 × 100）。
 */
export function reconstructPositions(fills: TraderFill[]): ReconstructedPosition[] {
  const fillsByCoin = new Map<string, TraderFill[]>();
  for (const fill of fills) {
    const existing = fillsByCoin.get(fill.coin) ?? [];
    existing.push(fill);
    fillsByCoin.set(fill.coin, existing);
  }

  const positions: ReconstructedPosition[] = [];
  for (const [coin, coinFills] of fillsByCoin) {
    positions.push(...reconstructCoin(coin, coinFills));
  }
  return positions;
}
