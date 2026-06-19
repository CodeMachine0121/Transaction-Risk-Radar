import Decimal from 'decimal.js';
import type {
  HyperliquidProxy,
  LeaderboardTrader,
  OpenPosition,
  TraderFill,
} from '../../application/ports/hyperliquidProxy';

// Hyperliquid 原始回應形狀（僅取本專案需要的欄位）。
interface RawLeaderboardRow {
  ethAddress: string;
  accountValue: string;
}
interface RawLeaderboardResponse {
  leaderboardRows: RawLeaderboardRow[];
}
interface RawPosition {
  coin: string;
  szi: string;
  entryPx: string;
  leverage: { value: number };
  unrealizedPnl: string;
  positionValue: string;
  marginUsed: string;
}
interface RawClearinghouseState {
  assetPositions: { position: RawPosition }[];
}
interface RawFill {
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
}

export interface HyperliquidHttpProxyOptions {
  infoApiBaseUrl: string;
  statsDataBaseUrl: string;
  fetchFunction?: typeof fetch;
}

/** Proxy：以 HTTP 呼叫 Hyperliquid 公開讀取 API，並正規化為 domain/application 使用的型別。 */
export class HyperliquidHttpProxy implements HyperliquidProxy {
  private readonly infoApiBaseUrl: string;
  private readonly statsDataBaseUrl: string;
  private readonly fetchFunction: typeof fetch;

  constructor(options: HyperliquidHttpProxyOptions) {
    this.infoApiBaseUrl = options.infoApiBaseUrl;
    this.statsDataBaseUrl = options.statsDataBaseUrl;
    this.fetchFunction = options.fetchFunction ?? globalThis.fetch;
  }

  async fetchLeaderboard(): Promise<LeaderboardTrader[]> {
    const response = await this.fetchFunction(`${this.statsDataBaseUrl}/Mainnet/leaderboard`);
    if (!response.ok) {
      throw new Error(`Hyperliquid leaderboard request failed with status ${response.status}`);
    }
    const data = (await response.json()) as RawLeaderboardResponse;
    return data.leaderboardRows.map((row) => ({
      address: row.ethAddress,
      accountValue: new Decimal(row.accountValue),
    }));
  }

  async fetchOpenPositions(address: string): Promise<OpenPosition[]> {
    const data = await this.postInfo<RawClearinghouseState>({
      type: 'clearinghouseState',
      user: address,
    });
    return data.assetPositions.map((entry) => ({
      coin: entry.position.coin,
      signedSize: new Decimal(entry.position.szi),
      entryPrice: new Decimal(entry.position.entryPx),
      leverage: new Decimal(entry.position.leverage.value),
      unrealizedProfitAndLoss: new Decimal(entry.position.unrealizedPnl),
      positionValue: new Decimal(entry.position.positionValue),
      marginUsed: new Decimal(entry.position.marginUsed),
    }));
  }

  async fetchUserFills(address: string, startTime: number): Promise<TraderFill[]> {
    const data = await this.postInfo<RawFill[]>({
      type: 'userFillsByTime',
      user: address,
      startTime,
    });
    return data.map((fill) => ({
      coin: fill.coin,
      price: new Decimal(fill.px),
      size: new Decimal(fill.sz),
      side: fill.side === 'B' ? 'buy' : 'sell',
      timestamp: fill.time,
      startPosition: new Decimal(fill.startPosition),
      direction: fill.dir,
      closedProfitAndLoss: new Decimal(fill.closedPnl),
      tradeId: fill.tid,
      hash: fill.hash,
    }));
  }

  private async postInfo<TResponse>(requestBody: object): Promise<TResponse> {
    const response = await this.fetchFunction(`${this.infoApiBaseUrl}/info`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      throw new Error(`Hyperliquid info request failed with status ${response.status}`);
    }
    const data = (await response.json()) as TResponse;
    return data;
  }
}
