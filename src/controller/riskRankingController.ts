import type { FastifyInstance } from 'fastify';
import type { RiskRankingApplication } from '../application/riskRankingApplication';
import type { IRiskRankingQuery } from '../domain/ranking/rankByRiskScore';
import { toTraderRiskDto, type ITraderRiskDto } from './traderRiskDto';

interface IRiskRankingRequest {
  direction?: string;
  offset?: string;
  limit?: string;
}

const parseOptionalInteger = (raw: string | undefined): number | undefined => {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseRankingQuery = (raw: IRiskRankingRequest): IRiskRankingQuery => {
  const query: IRiskRankingQuery = {};
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

/** Controller：GET /rankings（風險導向排行，US-01）。 */
export class RiskRankingController {
  private readonly application: RiskRankingApplication;

  constructor(application: RiskRankingApplication) {
    this.application = application;
  }

  register(server: FastifyInstance): void {
    server.get<{ Querystring: IRiskRankingRequest }>(
      '/rankings',
      async (request): Promise<ITraderRiskDto[]> => {
        const ranking = await this.application.listRanking(parseRankingQuery(request.query));
        return ranking.map(toTraderRiskDto);
      },
    );
  }
}
