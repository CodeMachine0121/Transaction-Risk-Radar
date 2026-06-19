export type RiskRankingDirection = 'ascending' | 'descending';

export type RiskRankingQuery = {
  direction?: RiskRankingDirection;
  offset?: number;
  limit?: number;
};
