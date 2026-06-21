import type { FastifyInstance, FastifyReply } from 'fastify';
import type { BacktestApplication } from '../application/backtestApplication';
import type { BacktestReportDto } from '../domain/dto/backtestReportDto';
import { parseBacktestRequest, type BacktestRequest } from './parseBacktestRequest';

export type BacktestControllerOptions = {
  /** 設定後，請求須帶相符的 `x-internal-token` 標頭，否則 401（內部/受保護）。 */
  token?: string;
  /** env 解析後的預設評估視窗（小時）；請求未帶 horizonsHours 時採用。 */
  defaultHorizonsHours: number[];
};

const INTERNAL_TOKEN_HEADER = 'x-internal-token';

/**
 * Controller：GET /backtest（B2 回測觸發，內部/受保護、**同步**）。
 * 取代既有「回測無 HTTP 介面」決定（見 PRD 漂移註記）。**非下單指令。**
 */
export class BacktestController {
  private readonly application: BacktestApplication;
  private readonly token: string | undefined;
  private readonly defaultHorizonsHours: number[];

  constructor(application: BacktestApplication, options: BacktestControllerOptions) {
    this.application = application;
    this.token = options.token;
    this.defaultHorizonsHours = options.defaultHorizonsHours;
  }

  register(server: FastifyInstance): void {
    server.get<{ Querystring: BacktestRequest }>(
      '/backtest',
      async (request, reply: FastifyReply): Promise<BacktestReportDto | FastifyReply> => {
        if (this.token !== undefined && request.headers[INTERNAL_TOKEN_HEADER] !== this.token) {
          return reply.code(401).send({ error: 'unauthorized' });
        }
        const parsed = parseBacktestRequest(request.query, this.defaultHorizonsHours);
        if ('error' in parsed) {
          return reply.code(400).send({ error: parsed.error });
        }
        const { coin, since, horizonsMilliseconds } = parsed.query;
        return this.application.evaluate(coin, since, horizonsMilliseconds);
      },
    );
  }
}
