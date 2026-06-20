/**
 * 單一 coin 的安全群持倉共識（Decimal 一律序列化為字串，避免 JSON 浮點精度損失）。
 * 描述性：陳述安全群此刻在此 coin 偏多/偏空到什麼程度，非買賣建議。
 */
export type CoinConsensusDto = {
  coin: string;
  /** Σ(side × weight) / Σ(weight)，−1…+1（long=+1/short=−1）。 */
  netDirectionBias: string;
  /** |netDirectionBias|，0…1。 */
  consensusStrength: string;
  participantCount: number;
  longCount: number;
  shortCount: number;
  /** longCount / participantCount。 */
  longShareOfParticipants: string;
  averageLeverage: string;
};
