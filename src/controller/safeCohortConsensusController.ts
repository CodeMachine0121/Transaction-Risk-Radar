import type { FastifyInstance, FastifyReply } from 'fastify';
import type { SafeCohortConsensusApplication } from '../application/safeCohortConsensusApplication';
import type { SafeCohortConsensusDto } from '../domain/dto/safeCohortConsensusDto';
import {
  parseConsensusRequest,
  type SafeCohortConsensusRequest,
} from './parseConsensusRequest';

type CoinParams = {
  coin: string;
};

/**
 * Controller：GET /consensus（各 coin 安全群持倉共識）與 GET /consensus/:coin（單一 coin）。
 * 描述性共識，非買賣建議；不足量共識回 404，參數非法回 400。
 */
export class SafeCohortConsensusController {
  private readonly application: SafeCohortConsensusApplication;

  constructor(application: SafeCohortConsensusApplication) {
    this.application = application;
  }

  register(server: FastifyInstance): void {
    server.get<{ Querystring: SafeCohortConsensusRequest }>(
      '/consensus',
      async (request, reply: FastifyReply): Promise<SafeCohortConsensusDto | FastifyReply> => {
        const parsed = parseConsensusRequest(request.query);
        if ('error' in parsed) {
          return reply.code(400).send({ error: parsed.error });
        }
        return this.application.listConsensus(parsed.query);
      },
    );

    server.get<{ Params: CoinParams; Querystring: SafeCohortConsensusRequest }>(
      '/consensus/:coin',
      async (request, reply: FastifyReply): Promise<SafeCohortConsensusDto | FastifyReply> => {
        const parsed = parseConsensusRequest(request.query);
        if ('error' in parsed) {
          return reply.code(400).send({ error: parsed.error });
        }
        const consensus = await this.application.coinConsensus(request.params.coin, parsed.query);
        if (consensus === null) {
          return reply.code(404).send({ error: 'no qualifying consensus for coin' });
        }
        return consensus;
      },
    );
  }
}
