import Decimal from 'decimal.js';

/**
 * 進場訊號規則門檻（皆可注入，待 B2 回測校準）。v1 為保守未校準預設。
 * 注意：薄樣本/單人主導以 `minimumSignalParticipants` 處理；`maxConvictionShare` 僅作描述，
 * 不作 gate（conviction 加權後，專注型安全交易員的高佔比屬正常，不應誤殺）。
 */
export type EntrySignalThresholds = {
  /** consensusStrength 須 ≥ 此值才給方向（否則 no-signal）。 */
  strengthThreshold: Decimal;
  /** convictionWeightedDirectionBias 絕對值須 > 此值才算有方向。 */
  directionEpsilon: Decimal;
  /** participantCount 須 ≥ 此值（否則樣本過薄 → no-signal）。 */
  minimumSignalParticipants: number;
  /** averageLeverage 超過此值 → 降級為 avoid。 */
  leverageCeiling: Decimal;
  /** consensusStrength ≥ 此值視為擁擠 → 降級為 avoid（只降級不反向）。 */
  crowdedThreshold: Decimal;
};

export const DEFAULT_ENTRY_SIGNAL_THRESHOLDS: EntrySignalThresholds = {
  strengthThreshold: new Decimal('0.5'),
  directionEpsilon: new Decimal('0.05'),
  minimumSignalParticipants: 5,
  leverageCeiling: new Decimal('15'),
  crowdedThreshold: new Decimal('0.95'),
};
