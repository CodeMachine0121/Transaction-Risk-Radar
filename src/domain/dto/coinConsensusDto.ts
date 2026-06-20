/**
 * 單一 coin 的安全群持倉共識（Decimal 一律序列化為字串，避免 JSON 浮點精度損失）。
 * 描述性：陳述安全群此刻在此 coin 偏多/偏空到什麼程度，非買賣建議。
 */
export type CoinConsensusDto = {
  coin: string;
  /** Σ(side × inverseRiskScoreWeight) / Σ(inverseRiskScoreWeight)，−1…+1（long=+1/short=−1）。 */
  netDirectionBias: string;
  /** conviction 加權方向：權重再乘 positionConvictionShare，分散巨鯨被降權。−1…+1。 */
  convictionWeightedDirectionBias: string;
  /** |selectedBias|（依 weighting 選定），0…1。 */
  consensusStrength: string;
  participantCount: number;
  longCount: number;
  shortCount: number;
  /** longCount / participantCount。 */
  longShareOfParticipants: string;
  /** 該 coin 參與者 positionConvictionShare 的平均；低代表參與者多為分散書。 */
  averageConvictionShare: string;
  /** 該 coin 參與者中最大的單一 positionConvictionShare；高代表被單一重押者主導。 */
  maxConvictionShare: string;
  /** firstObservedAt 落在最近一個輪詢間隔內的參與者數（窗內粗略代理，僅描述）。 */
  newPositionCount: number;
  averageLeverage: string;
};
