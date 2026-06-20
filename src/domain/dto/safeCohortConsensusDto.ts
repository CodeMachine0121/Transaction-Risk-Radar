import type { CoinConsensusDto } from './coinConsensusDto';

/**
 * 安全群共識回應信封（service 回傳邊界）：附免責聲明 + 各 coin 共識。
 * 遵守「回應不另立 Response」慣例——以 DTO 承載免責，直接回傳。
 */
export type SafeCohortConsensusDto = {
  disclaimer: string;
  coins: CoinConsensusDto[];
};
