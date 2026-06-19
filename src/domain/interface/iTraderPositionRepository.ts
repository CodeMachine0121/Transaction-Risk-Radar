import type { Position } from '../entity/position';

/** 載入某交易員的倉位（由 infrastructure 從 position_events + position_snapshots 建出 Position）。 */
export interface ITraderPositionRepository {
  findPositions(traderAddress: string): Promise<Position[]>;
}
