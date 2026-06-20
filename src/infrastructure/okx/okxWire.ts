/** OKX REST 回應外層包裝。 */
export type RawOkxResponse<TData> = {
  code: string;
  msg: string;
  data: TData;
};

/** public-lead-traders：data 為陣列，內含 ranks。 */
export type RawOkxLeadTrader = {
  uniqueCode: string;
  aum: string;
  nickName: string;
};

export type RawOkxLeadTraderRanks = {
  ranks: RawOkxLeadTrader[];
};

/** public-subpositions-history：帶單員每張開倉單的已平 sub-position。 */
export type RawOkxSubposition = {
  instId: string;
  posSide: string;
  openAvgPx: string;
  subPos: string;
  openTime: string;
  closeAvgPx: string;
  closeTime: string;
  pnl: string;
  lever: string;
  subPosId: string;
};

/** public-current-subpositions：帶單員當前未平 sub-position。 */
export type RawOkxCurrentSubposition = {
  instId: string;
  posSide: string;
  openAvgPx: string;
  subPos: string;
  lever: string;
  margin: string;
  markPx: string;
  upl: string;
  uplRatio: string;
  subPosId: string;
};
