/** Hyperliquid 請求遇 429 的退避設定（hyperliquidProxy 與 priceProxy 共用）。 */
export type BackoffOptions = {
  /** 429 後的最大重試次數。 */
  maximumRetryCount: number;
  /** exponential backoff 基數毫秒。 */
  baseDelayMilliseconds: number;
  /** backoff 上限毫秒。 */
  maximumDelayMilliseconds: number;
};

export const defaultBackoff: BackoffOptions = {
  maximumRetryCount: 5,
  baseDelayMilliseconds: 500,
  maximumDelayMilliseconds: 30000,
};
