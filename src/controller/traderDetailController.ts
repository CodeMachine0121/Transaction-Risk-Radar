import type { FastifyInstance, FastifyReply } from 'fastify';
import type { TraderDetailApplication } from '../application/traderDetailApplication';
import type { TraderRiskDto } from '../domain/dto/traderRiskDto';
import { Provider } from '../domain/vo/provider';
import { parseProvider } from './parseProvider';

type TraderDetailRequest = {
  address: string;
};

type TraderDetailQuery = {
  provider?: string;
};

/** Controller：GET /traders/:address（交易員風險詳情，US-02）。provider 缺漏預設 hyperliquid。 */
export class TraderDetailController {
  private readonly application: TraderDetailApplication;

  constructor(application: TraderDetailApplication) {
    this.application = application;
  }

  register(server: FastifyInstance): void {
    server.get<{ Params: TraderDetailRequest; Querystring: TraderDetailQuery }>(
      '/traders/:address',
      async (request, reply: FastifyReply): Promise<TraderRiskDto | FastifyReply> => {
        const provider = parseProvider(request.query.provider) ?? Provider.Hyperliquid;
        const detail = await this.application.getTraderDetail(provider, request.params.address);
        if (detail === null) {
          return reply.code(404).send({ error: 'trader not found' });
        }
        return detail;
      },
    );
  }
}
