import Decimal from 'decimal.js';
import type { ITraderDataProxy } from '../../domain/interface/iTraderDataProxy';
import type { LeaderboardTrader } from '../../domain/vo/leaderboardTrader';
import type { OpenPosition } from '../../domain/vo/openPosition';
import { Provider } from '../../domain/vo/provider';
import type { TraderActivity } from '../../domain/vo/traderActivity';
import type { RequestWeightLimiter } from '../../shared/rateLimit/requestWeightLimiter';
import type {
  RawOkxCurrentSubposition,
  RawOkxLeadTraderRanks,
  RawOkxResponse,
  RawOkxSubposition,
} from './okxWire';

const ZERO = new Decimal(0);

export type OkxBackoffOptions = {
  maximumRetryCount: number;
  baseDelayMilliseconds: number;
  maximumDelayMilliseconds: number;
};

const defaultBackoff: OkxBackoffOptions = {
  maximumRetryCount: 5,
  baseDelayMilliseconds: 500,
  maximumDelayMilliseconds: 30000,
};

const jitterRatio = 0.2;
const tooManyRequestsStatus = 429;
/** OKX copytrading 端點以合約（SWAP）為主。 */
const instType = 'SWAP';
/** 每個請求的 weight（OKX 限流以端點計；此處統一取 1）。 */
const requestWeight = 1;

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export type OkxProxyOptions = {
  apiBaseUrl: string;
  fetchFunction?: typeof fetch;
  requestWeightLimiter?: RequestWeightLimiter;
  backoff?: OkxBackoffOptions;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

/** 以 HTTP 呼叫 OKX 公開 copytrading API（免金鑰），並正規化為 domain 使用的型別。 */
export class OkxProxy implements ITraderDataProxy {
  readonly provider = Provider.Okx;
  private readonly apiBaseUrl: string;
  private readonly fetchFunction: typeof fetch;
  private readonly requestWeightLimiter: RequestWeightLimiter | undefined;
  private readonly backoff: OkxBackoffOptions;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: OkxProxyOptions) {
    this.apiBaseUrl = options.apiBaseUrl;
    this.fetchFunction = options.fetchFunction ?? globalThis.fetch;
    this.requestWeightLimiter = options.requestWeightLimiter;
    this.backoff = options.backoff ?? defaultBackoff;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  async fetchTraderList(): Promise<LeaderboardTrader[]> {
    const data = await this.getJson<RawOkxLeadTraderRanks[]>(
      `/api/v5/copytrading/public-lead-traders?instType=${instType}`,
    );
    const ranks = data[0]?.ranks ?? [];
    return ranks.map((rank) => ({
      address: rank.uniqueCode,
      accountValue: new Decimal(rank.aum),
    }));
  }

  /**
   * 由 public-subpositions-history 的每張 sub-position 映成「open 腿 + close 腿」兩條
   * TraderActivity（依時間排序後交由統一 Position.reconstruct 拼成邏輯倉位、偵測攤平）。
   * 只取 openTime >= since 的 sub-position（整張保留 open+close，避免拆對）。
   */
  async fetchPositionActivities(address: string, since: number): Promise<TraderActivity[]> {
    const subPositions = await this.getJson<RawOkxSubposition[]>(
      `/api/v5/copytrading/public-subpositions-history?instType=${instType}&uniqueCode=${address}`,
    );
    const activities: TraderActivity[] = [];
    for (const subPosition of subPositions) {
      if (Number(subPosition.openTime) < since) {
        continue;
      }
      // OKX 偶有「net 模式」殘缺列（instId/價量為空）→ 無法重建,略過。
      if (
        subPosition.instId === '' ||
        subPosition.openAvgPx === '' ||
        subPosition.subPos === '' ||
        subPosition.closeAvgPx === '' ||
        subPosition.closeTime === ''
      ) {
        continue;
      }
      const size = new Decimal(subPosition.subPos);
      const longSide = subPosition.posSide === 'long';
      const openSignedSize = longSide ? size : size.negated();
      activities.push({
        coin: subPosition.instId,
        price: new Decimal(subPosition.openAvgPx),
        signedSize: openSignedSize,
        signedSizeBefore: ZERO,
        realizedProfitAndLoss: ZERO,
        occurredAt: Number(subPosition.openTime),
        sourceReference: `${subPosition.subPosId}:open`,
      });
      activities.push({
        coin: subPosition.instId,
        price: new Decimal(subPosition.closeAvgPx),
        signedSize: openSignedSize.negated(),
        signedSizeBefore: ZERO,
        realizedProfitAndLoss: new Decimal(subPosition.pnl),
        occurredAt: Number(subPosition.closeTime),
        sourceReference: `${subPosition.subPosId}:close`,
      });
    }
    return activities;
  }

  /**
   * 由 public-current-subpositions 正規化為 OpenPosition。markPx × size 當 positionValue，
   * 使既有 toSnapshotRecord 推得的 markPrice = markPx、未實現% 與 Hyperliquid 同口徑（ROI on notional）。
   */
  async fetchOpenPositions(address: string): Promise<OpenPosition[]> {
    const subPositions = await this.getJson<RawOkxCurrentSubposition[]>(
      `/api/v5/copytrading/public-current-subpositions?instType=${instType}&uniqueCode=${address}`,
    );
    return subPositions
      .filter(
        (subPosition) =>
          // OKX 偶有「net 模式」殘缺列（instId/價量為空）→ 無法成倉,略過。
          subPosition.instId !== '' &&
          subPosition.openAvgPx !== '' &&
          subPosition.subPos !== '' &&
          subPosition.markPx !== '',
      )
      .map((subPosition) => {
        const size = new Decimal(subPosition.subPos);
        const longSide = subPosition.posSide === 'long';
        const markPrice = new Decimal(subPosition.markPx);
      return {
        coin: subPosition.instId,
        signedSize: longSide ? size : size.negated(),
        entryPrice: new Decimal(subPosition.openAvgPx),
        leverage: new Decimal(subPosition.lever),
        unrealizedProfitAndLoss: new Decimal(subPosition.upl),
        positionValue: markPrice.times(size),
        marginUsed: new Decimal(subPosition.margin),
      };
    });
  }

  private async getJson<TData>(path: string): Promise<TData> {
    const response = await this.fetchWithRetry(`${this.apiBaseUrl}${path}`);
    if (!response.ok) {
      throw new Error(`OKX request failed with status ${response.status}`);
    }
    const body = (await response.json()) as RawOkxResponse<TData>;
    if (body.code !== '0') {
      throw new Error(`OKX request failed with code ${body.code}: ${body.msg}`);
    }
    return body.data;
  }

  /** 限流後 GET；遇 429 依 Retry-After / exponential backoff + jitter 重試至上限。 */
  private async fetchWithRetry(url: string): Promise<Response> {
    let attempt = 0;
    for (;;) {
      if (this.requestWeightLimiter !== undefined) {
        await this.requestWeightLimiter.acquire(requestWeight);
      }
      const response = await this.fetchFunction(url);
      if (response.status !== tooManyRequestsStatus || attempt >= this.backoff.maximumRetryCount) {
        return response;
      }
      await this.sleep(this.retryDelayMilliseconds(response, attempt));
      attempt += 1;
    }
  }

  private retryDelayMilliseconds(response: Response, attempt: number): number {
    const retryAfter = Number(response.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return retryAfter * 1000;
    }
    const exponential = Math.min(
      this.backoff.baseDelayMilliseconds * 2 ** attempt,
      this.backoff.maximumDelayMilliseconds,
    );
    return Math.round(exponential * (1 + jitterRatio * this.random()));
  }
}
