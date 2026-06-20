import type { FastifyInstance } from 'fastify';
import type { RiskRankingApplication } from '../application/riskRankingApplication';
import type { TraderRiskDto } from '../domain/dto/traderRiskDto';
import type { RiskRankingQuery } from '../domain/vo/riskRankingQuery';
import { parseProvider } from './parseProvider';

type RiskRankingRequest = {
  provider?: string;
  direction?: string;
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

const parseRankingQuery = (raw: RiskRankingRequest): RiskRankingQuery => {
  const query: RiskRankingQuery = {};
  const provider = parseProvider(raw.provider);
  if (provider !== undefined) {
    query.provider = provider;
  }
  if (raw.direction === 'ascending' || raw.direction === 'descending') {
    query.direction = raw.direction;
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

/** Controller：GET /rankings（風險導向排行，US-01）。回傳 DTO（由 application/service 產出）。 */
export class RiskRankingController {
  private readonly application: RiskRankingApplication;

  constructor(application: RiskRankingApplication) {
    this.application = application;
  }

  register(server: FastifyInstance): void {
    server.get<{ Querystring: RiskRankingRequest }>(
      '/rankings',
      (request): Promise<TraderRiskDto[]> =>
        this.application.listRanking(parseRankingQuery(request.query)),
    );
  }
}
