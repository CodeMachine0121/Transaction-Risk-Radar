import type { FastifyInstance, FastifyReply } from 'fastify';
import type { TraderDetailApplication } from '../application/traderDetailApplication';
import { toTraderRiskResponse, type TraderRiskResponse } from './traderRiskResponse';

interface TraderDetailParams {
  address: string;
}

/** Controller：GET /traders/:address（交易員風險詳情，US-02）。 */
export class TraderDetailController {
  private readonly application: TraderDetailApplication;

  constructor(application: TraderDetailApplication) {
    this.application = application;
  }

  register(server: FastifyInstance): void {
    server.get<{ Params: TraderDetailParams }>(
      '/traders/:address',
      async (request, reply: FastifyReply): Promise<TraderRiskResponse | FastifyReply> => {
        const detail = await this.application.getTraderDetail(request.params.address);
        if (detail === null) {
          return reply.code(404).send({ error: 'trader not found' });
        }
        return toTraderRiskResponse(detail);
      },
    );
  }
}
