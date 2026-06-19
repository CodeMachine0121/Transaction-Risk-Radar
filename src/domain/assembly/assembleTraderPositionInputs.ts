import Decimal from 'decimal.js';
import type { TraderPositionInput } from '../metrics/traderMetrics';
import type { ReconstructedPosition } from '../reconstruction/reconstructPositions';

/** 一個倉位的 snapshot 輸入（來自 poll clearinghouseState）。 */
export type PositionSnapshotInput = {
  unrealizedProfitAndLossPercentage: Decimal;
  leverage: Decimal;
};

/** 重建出的倉位 + 其浮虧/槓桿 snapshot 序列。 */
export type AssemblyPosition = {
  reconstructed: ReconstructedPosition;
  snapshots: PositionSnapshotInput[];
};

/**
 * 把「重建倉位 + 其 snapshots」組裝成 computeTraderMetrics 的輸入。
 * - unrealizedProfitAndLossPercentages 取自 snapshots（算 MAE）。
 * - averageLeverage = snapshots 的槓桿平均。
 * - 沒有任何 snapshot 的倉位（從未被觀測到開倉）會被排除，因無法計算 MAE/槓桿。
 */
export function assembleTraderPositionInputs(positions: AssemblyPosition[]): TraderPositionInput[] {
  return positions
    .filter((position) => position.snapshots.length > 0)
    .map(({ reconstructed, snapshots }) => {
      const totalLeverage = snapshots.reduce(
        (sum, snapshot) => sum.plus(snapshot.leverage),
        new Decimal(0),
      );
      return {
        side: reconstructed.side,
        events: reconstructed.events,
        unrealizedProfitAndLossPercentages: snapshots.map(
          (snapshot) => snapshot.unrealizedProfitAndLossPercentage,
        ),
        averageLeverage: totalLeverage.dividedBy(snapshots.length),
        closed: reconstructed.isClosed
          ? {
              realizedReturnPercentage: reconstructed.realizedReturnPercentage,
              realizedProfitAndLoss: reconstructed.realizedProfitAndLoss,
            }
          : null,
      };
    });
}
