/**
 * Domain Service 回傳給 application 的交易員風險摘要 DTO。
 * Decimal 一律序列化為字串，避免 JSON 浮點精度損失；entity 不外漏。
 */
export type TraderRiskDto = {
  provider: string;
  traderAddress: string;
  insufficientData: boolean;
  closedPositionCount: number;
  riskScore: string | null;
  maxAdverseExcursionPercentile90: string | null;
  averagingDownRatio: string | null;
  winRate: string | null;
  realizedProfitAndLoss: string | null;
  returnDownsideDeviation: string | null;
  averageLeverage: string | null;
  trapSignal: string | null;
};
