import type { EntrySignalDto } from './entrySignalDto';

/**
 * 進場訊號回應信封：附重免責 + experimental 旗標 + 各 coin 訊號。
 * experimental 恆為 true，直到 B2 回測校準完成（v1 不 gate、明示未驗證）。
 */
export type EntrySignalReportDto = {
  disclaimer: string;
  experimental: boolean;
  signals: EntrySignalDto[];
};
