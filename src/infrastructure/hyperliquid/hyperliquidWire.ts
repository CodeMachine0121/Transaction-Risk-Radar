// Hyperliquid 原始回應形狀（wire format，僅取本專案需要的欄位）。
// 屬 infrastructure 邊際細節，domain 不認識。

export type RawLeaderboardRow = {
  ethAddress: string;
  accountValue: string;
};

export type RawLeaderboardResponse = {
  leaderboardRows: RawLeaderboardRow[];
};

export type RawPosition = {
  coin: string;
  szi: string;
  entryPx: string;
  leverage: { value: number };
  unrealizedPnl: string;
  positionValue: string;
  marginUsed: string;
};

export type RawClearinghouseState = {
  assetPositions: { position: RawPosition }[];
};

export type RawFill = {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  tid: number;
};

/** candleSnapshot 回傳的單根 K 線。`t`=開盤 ms、`c`=收盤價（字串）。 */
export type RawCandle = {
  t: number;
  T: number;
  s: string;
  i: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
};
