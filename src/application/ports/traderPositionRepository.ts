import type { IAssemblyPosition } from '../../domain/assembly/assembleTraderPositionInputs';

/**
 * Repository port：載入某交易員「重建倉位 + 其 snapshot 序列」的組裝輸入。
 * 由 infrastructure 從 position_events / position_snapshots 重建並 join 後提供。
 */
export interface ITraderPositionRepository {
  findAssemblyPositions(traderAddress: string): Promise<IAssemblyPosition[]>;
}
