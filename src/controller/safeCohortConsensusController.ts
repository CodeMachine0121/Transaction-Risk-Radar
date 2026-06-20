import type { FastifyInstance, FastifyReply } from 'fastify';
import type { SafeCohortConsensusApplication } from '../application/safeCohortConsensusApplication';
import type { SafeCohortConsensusDto } from '../domain/dto/safeCohortConsensusDto';
import type { SafeCohortConsensusQuery } from '../domain/vo/safeCohortConsensusQuery';
import { parseProvider } from './parseProvider';

type SafeCohortConsensusRequest = {
  provider?: string;
  maxRiskScore?: string;
  minParticipants?: string;
  offset?: string;
  limit?: string;
};

type CoinParams = {
  coin: string;
};

type ParseResult = { query: SafeCohortConsensusQuery } | { error: string };

/** 解析並校驗 querystring；非法回 error（controller 轉 400）。 */
const parseConsensusRequest = (raw: SafeCohortConsensusRequest): ParseResult => {
  const query: SafeCohortConsensusQuery = {};
  const provider = parseProvider(raw.provider);
  if (provider !== undefined) {
    query.provider = provider;
  }
  if (raw.maxRiskScore !== undefined) {
    const value = Number(raw.maxRiskScore);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return { error: 'maxRiskScore must be a number between 0 and 100' };
    }
    query.maxRiskScore = value;
  }
  if (raw.minParticipants !== undefined) {
    const value = Number(raw.minParticipants);
    if (!Number.isInteger(value) || value < 1) {
      return { error: 'minParticipants must be an integer >= 1' };
    }
    query.minimumConsensusParticipants = value;
  }
  if (raw.offset !== undefined) {
    const value = Number(raw.offset);
    if (!Number.isInteger(value) || value < 0) {
      return { error: 'offset must be an integer >= 0' };
    }
    query.offset = value;
  }
  if (raw.limit !== undefined) {
    const value = Number(raw.limit);
    if (!Number.isInteger(value) || value < 1) {
      return { error: 'limit must be an integer >= 1' };
    }
    query.limit = value;
  }
  return { query };
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
