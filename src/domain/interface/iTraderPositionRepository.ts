import type { AssemblyPosition } from '../assembly/assembleTraderPositionInputs';

/** 載入某交易員「重建倉位 + 其 snapshot 序列」的組裝輸入（由 infrastructure 重建並 join）。 */
export interface ITraderPositionRepository {
  findAssemblyPositions(traderAddress: string): Promise<AssemblyPosition[]>;
}
