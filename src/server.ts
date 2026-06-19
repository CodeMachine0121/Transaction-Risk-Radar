import Fastify, { type FastifyInstance } from 'fastify';
import type { ITraderMetricsRepository } from './application/ports/traderMetricsRepository';
import { RiskRankingApplication } from './application/riskRankingApplication';
import { TraderDetailApplication } from './application/traderDetailApplication';
import { RiskRankingController } from './controller/riskRankingController';
import { TraderDetailController } from './controller/traderDetailController';

export interface IBuildServerOptions {
  logger?: boolean;
}

/**
 * 組裝 HTTP server：注入 repository → applications → controllers。
 * repository 為介面，由呼叫端（組裝根或測試）決定具體實作（DIP）。
 */
export function buildServer(
  repository: ITraderMetricsRepository,
  options: IBuildServerOptions = {},
): FastifyInstance {
  const server = Fastify({ logger: options.logger ?? false });

  server.get('/health', () => ({ status: 'ok' }));

  const riskRankingController = new RiskRankingController(new RiskRankingApplication(repository));
  const traderDetailController = new TraderDetailController(new TraderDetailApplication(repository));
  riskRankingController.register(server);
  traderDetailController.register(server);

  return server;
}
