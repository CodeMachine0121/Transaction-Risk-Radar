import Decimal from 'decimal.js';
import type { PositionLifecycleEvent } from '../vo/positionLifecycleEvent';
import type { PositionSide } from '../vo/positionSide';
import type { PositionSnapshot } from '../vo/positionSnapshot';
import type { TraderActivity } from '../vo/traderActivity';

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

const sameSign = (left: Decimal, right: Decimal): boolean =>
  (left.isPositive() && right.isPositive()) || (left.isNegative() && right.isNegative());

export type PositionProps = {
  coin: string;
  side: PositionSide;
  events: PositionLifecycleEvent[];
  snapshots: PositionSnapshot[];
  realizedProfitAndLoss: Decimal;
  closed: boolean;
  /** 開倉時間（ms）。供 repository 依時間窗把 snapshot 掛回對應倉位。 */
  openedAt?: number;
  /** 平倉時間（ms）；仍開倉則為 null。 */
  closedAt?: number | null;
};

/**
 * 充血實體：一個倉位。計算行為（MAE、攤平、ROI、平均槓桿）皆為其方法。
 * `reconstruct` 為靜態工廠：把一位交易員的成交（fills）重建為倉位骨架（不含 snapshot）；
 * snapshot 由 `withSnapshots` 併入（來源為 poll clearinghouseState，於 repository 層 join）。
 */
export class Position {
  private readonly props: PositionProps;

  constructor(props: PositionProps) {
    this.props = props;
  }

  coin(): string {
    return this.props.coin;
  }

  side(): PositionSide {
    return this.props.side;
  }

  isClosed(): boolean {
    return this.props.closed;
  }

  openedAt(): number {
    return this.props.openedAt ?? 0;
  }

  closedAt(): number | null {
    return this.props.closedAt ?? null;
  }

  hasSnapshots(): boolean {
    return this.props.snapshots.length > 0;
  }

  realizedProfitAndLoss(): Decimal {
    return this.props.realizedProfitAndLoss;
  }

  /** 進場總成本 Σ(open/add 的 price × size)，作為 ROI 報酬率的分母。 */
  private entryCost(): Decimal {
    return this.props.events
      .filter((event) => event.type === 'open' || event.type === 'add')
      .reduce((total, event) => total.plus(event.price.times(event.size)), ZERO);
  }

  /** ROI 報酬率：realizedProfitAndLoss / 進場總成本 × 100。 */
  realizedReturnPercentage(): Decimal {
    const cost = this.entryCost();
    return cost.isZero() ? ZERO : this.props.realizedProfitAndLoss.dividedBy(cost).times(HUNDRED);
  }

  /** 最大逆向幅度：所有 snapshot 中最深的浮虧百分比。需至少一筆 snapshot。 */
  maxAdverseExcursion(): Decimal {
    const [first, ...rest] = this.props.snapshots;
    if (first === undefined) {
      throw new RangeError('position has no snapshots');
    }
    return rest.reduce(
      (deepest, snapshot) => Decimal.min(deepest, snapshot.unrealizedProfitAndLossPercentage),
      first.unrealizedProfitAndLossPercentage,
    );
  }

  /** 平均槓桿：snapshot 槓桿平均。需至少一筆 snapshot。 */
  averageLeverage(): Decimal {
    if (this.props.snapshots.length === 0) {
      throw new RangeError('position has no snapshots');
    }
    const total = this.props.snapshots.reduce((sum, snapshot) => sum.plus(snapshot.leverage), ZERO);
    return total.dividedBy(this.props.snapshots.length);
  }

  /** 是否為攤平/加倉型：虧損中以更差價格加倉（多單加在低於均價、空單加在高於均價）。 */
  isAveragingDown(): boolean {
    let entryCost = ZERO;
    let entrySize = ZERO;
    for (const event of this.props.events) {
      if (event.type !== 'open' && event.type !== 'add') {
        continue;
      }
      if (event.type === 'add' && entrySize.greaterThan(0)) {
        const averageEntryPrice = entryCost.dividedBy(entrySize);
        const addsIntoLoss =
          this.props.side === 'long'
            ? event.price.lessThan(averageEntryPrice)
            : event.price.greaterThan(averageEntryPrice);
        if (addsIntoLoss) {
          return true;
        }
      }
      entryCost = entryCost.plus(event.price.times(event.size));
      entrySize = entrySize.plus(event.size);
    }
    return false;
  }

  /** 併入 snapshot 序列，回傳新的 Position（不可變）。 */
  withSnapshots(snapshots: PositionSnapshot[]): Position {
    return new Position({ ...this.props, snapshots });
  }

  /**
   * 靜態工廠：把成交重建為倉位（依標的分組、按時間排序、逐筆分類 open/add/reduce/close；
   * 持倉歸零即閉倉、反向穿越視為「平舊倉＋開新倉」）。回傳的倉位尚未含 snapshot。
   */
  static reconstruct(activities: TraderActivity[]): Position[] {
    const reconstructCoin = (coin: string, coinActivities: TraderActivity[]): Position[] => {
      const ordered = [...coinActivities].sort((left, right) => left.occurredAt - right.occurredAt);
      const coinPositions: Position[] = [];
      let events: PositionLifecycleEvent[] = [];
      // 以第一筆腿的 signedSizeBefore 起算持倉量：抓取窗常從持倉中途開始，
      // 若仍從 0 起算則持倉永遠回不到真正的 0、永遠偵測不到平倉。
      let running = ordered[0]?.signedSizeBefore ?? ZERO;
      // 期初已持有（signedSizeBefore 非零）= 開倉於窗外、進場價未知，視為 carried：
      // 統計時排除（不計入已平倉位），只計窗內完整開→平的倉位。
      let carried = !running.isZero();
      let side: PositionSide = running.isPositive() ? 'long' : 'short';
      let realizedProfitAndLoss = ZERO;
      let open = carried;
      let openedAt = 0;
      let closedAt: number | null = null;

      const finalize = (closed: boolean): void => {
        if (!carried) {
          coinPositions.push(
            new Position({
              coin,
              side,
              events,
              snapshots: [],
              realizedProfitAndLoss,
              closed,
              openedAt,
              closedAt: closed ? closedAt : null,
            }),
          );
        }
        events = [];
        realizedProfitAndLoss = ZERO;
        open = false;
        carried = false;
        closedAt = null;
      };

      for (const activity of ordered) {
        const signedDelta = activity.signedSize;
        const size = activity.signedSize.abs();
        const before = running;
        const after = before.plus(signedDelta);

        if (!open) {
          side = after.isPositive() ? 'long' : 'short';
          events.push({ type: 'open', price: activity.price, size });
          openedAt = activity.occurredAt;
          open = true;
        } else if (!sameSign(before, after) && !after.isZero()) {
          events.push({ type: 'close', price: activity.price, size: before.abs() });
          realizedProfitAndLoss = realizedProfitAndLoss.plus(activity.realizedProfitAndLoss);
          closedAt = activity.occurredAt;
          finalize(true);
          side = after.isPositive() ? 'long' : 'short';
          events.push({ type: 'open', price: activity.price, size: after.abs() });
          openedAt = activity.occurredAt;
          open = true;
        } else if (after.abs().greaterThan(before.abs())) {
          events.push({ type: 'add', price: activity.price, size });
        } else {
          realizedProfitAndLoss = realizedProfitAndLoss.plus(activity.realizedProfitAndLoss);
          if (after.isZero()) {
            events.push({ type: 'close', price: activity.price, size });
            closedAt = activity.occurredAt;
            finalize(true);
          } else {
            events.push({ type: 'reduce', price: activity.price, size });
          }
        }
        running = after;
      }

      if (open) {
        finalize(false);
      }
      return coinPositions;
    };

    const activitiesByCoin = new Map<string, TraderActivity[]>();
    for (const activity of activities) {
      const existing = activitiesByCoin.get(activity.coin) ?? [];
      existing.push(activity);
      activitiesByCoin.set(activity.coin, existing);
    }
    const positions: Position[] = [];
    for (const [coin, coinActivities] of activitiesByCoin) {
      positions.push(...reconstructCoin(coin, coinActivities));
    }
    return positions;
  }
}
