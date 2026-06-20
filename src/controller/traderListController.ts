import type { FastifyInstance } from 'fastify';
import type { ListTradersApplication } from '../application/listTradersApplication';
import type { TraderRiskDto } from '../domain/dto/traderRiskDto';
import type { RiskRankingQuery } from '../domain/vo/riskRankingQuery';
import { parseProvider } from './parseProvider';

type ListTradersRequest = {
  provider?: string;
  offset?: string;
  limit?: string;
};

const parseOptionalInteger = (raw: string | undefined): number | undefined => {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseListQuery = (raw: ListTradersRequest): RiskRankingQuery => {
  const query: RiskRankingQuery = {};
  const provider = parseProvider(raw.provider);
  if (provider !== undefined) {
    query.provider = provider;
  }
  const offset = parseOptionalInteger(raw.offset);
  if (offset !== undefined) {
    query.offset = offset;
  }
  const limit = parseOptionalInteger(raw.limit);
  if (limit !== undefined) {
    query.limit = limit;
  }
  return query;
};

/** Controller：GET /traders（列出全部追蹤交易員，含 insufficientData）。 */
export class TraderListController {
  private readonly application: ListTradersApplication;

  constructor(application: ListTradersApplication) {
    this.application = application;
  }

  register(server: FastifyInstance): void {
    server.get<{ Querystring: ListTradersRequest }>(
      '/traders',
      (request): Promise<TraderRiskDto[]> => this.application.list(parseListQuery(request.query)),
    );
  }
}
