import Fastify, { type FastifyInstance } from 'fastify';
import { RiskRankingApplication } from './application/riskRankingApplication';
import { TraderDetailApplication } from './application/traderDetailApplication';
import { RiskRankingController } from './controller/riskRankingController';
import { TraderDetailController } from './controller/traderDetailController';
import type { ITraderMetricsRepository } from './domain/interface/iTraderMetricsRepository';
import { RiskRankingService } from './domain/service/riskRankingService';
import { TraderDetailService } from './domain/service/traderDetailService';

export type BuildServerOptions = {
  logger?: boolean;
};

/**
 * 組裝 HTTP server：repository（介面）→ domain service（具體）→ application → controller。
 * service 無介面、以具體實例注入 application（見 CLAUDE.md 測試策略）。
 */
export function buildServer(
  traderMetricsRepository: ITraderMetricsRepository,
  options: BuildServerOptions = {},
): FastifyInstance {
  const server = Fastify({ logger: options.logger ?? false });

  server.get('/health', () => ({ status: 'ok' }));

  const riskRankingController = new RiskRankingController(
    new RiskRankingApplication(new RiskRankingService(traderMetricsRepository)),
  );
  const traderDetailController = new TraderDetailController(
    new TraderDetailApplication(new TraderDetailService(traderMetricsRepository)),
  );
  riskRankingController.register(server);
  traderDetailController.register(server);

  return server;
}
