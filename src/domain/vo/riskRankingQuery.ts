import type { Provider } from './provider';

export type RiskRankingDirection = 'ascending' | 'descending';

export type RiskRankingQuery = {
  provider?: Provider;
  direction?: RiskRankingDirection;
  offset?: number;
  limit?: number;
};
