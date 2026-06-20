/** 方向傾向：由 convictionWeightedDirectionBias 號 + directionEpsilon 決定。 */
export type EntryLean = 'long' | 'short' | 'neutral';

/** 進場判定：值得考慮 / 迴避（擁擠或高槓桿，只降級不反向）/ 無訊號（方向不明或樣本過薄）。 */
export type EntryVerdict = 'worth-considering' | 'avoid' | 'no-signal';

/**
 * 單一 coin 的進場訊號（決策輔助，**非下單指令**）。由安全群共識經規則導出。
 * **experimental：未經回測校準前不可信。**
 */
export type EntrySignalDto = {
  coin: string;
  lean: EntryLean;
  /** 0..1 的規則綜合分（**非獲利機率**）。 */
  setupQuality: string;
  verdict: EntryVerdict;
  /** 逐條人類可讀的判斷依據（必填、非空）。 */
  reasons: string[];
};
