import type { FastifyInstance, FastifyReply } from 'fastify';
import type { EntrySignalApplication } from '../application/entrySignalApplication';
import type { EntrySignalReportDto } from '../domain/dto/entrySignalReportDto';
import {
  parseConsensusRequest,
  type SafeCohortConsensusRequest,
} from './parseConsensusRequest';

/**
 * Controller：GET /signals（安全群共識導出的進場訊號，B1）。
 * opt-in、experimental；沿用 /consensus 的 querystring；參數非法回 400。**非下單指令。**
 */
export class EntrySignalController {
  private readonly application: EntrySignalApplication;

  constructor(application: EntrySignalApplication) {
    this.application = application;
  }

  register(server: FastifyInstance): void {
    server.get<{ Querystring: SafeCohortConsensusRequest }>(
      '/signals',
      async (request, reply: FastifyReply): Promise<EntrySignalReportDto | FastifyReply> => {
        const parsed = parseConsensusRequest(request.query);
        if ('error' in parsed) {
          return reply.code(400).send({ error: parsed.error });
        }
        return this.application.evaluateEntrySignals(parsed.query);
      },
    );
  }
}
