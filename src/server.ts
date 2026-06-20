import Fastify, { type FastifyInstance } from 'fastify';
import { ListTradersApplication } from './application/listTradersApplication';
import { RiskRankingApplication } from './application/riskRankingApplication';
import { EntrySignalApplication } from './application/entrySignalApplication';
import { SafeCohortConsensusApplication } from './application/safeCohortConsensusApplication';
import { TraderDetailApplication } from './application/traderDetailApplication';
import { EntrySignalController } from './controller/entrySignalController';
import { RiskRankingController } from './controller/riskRankingController';
import { SafeCohortConsensusController } from './controller/safeCohortConsensusController';
import { TraderDetailController } from './controller/traderDetailController';
import { TraderListController } from './controller/traderListController';
import type { IPositionRepository } from './domain/interface/iPositionRepository';
import type { ITraderRepository } from './domain/interface/iTraderRepository';
import { EntrySignalService } from './domain/service/entrySignalService';
import { RiskRankingService } from './domain/service/riskRankingService';
import { SafeCohortConsensusService } from './domain/service/safeCohortConsensusService';
import { TraderDetailService } from './domain/service/traderDetailService';
import { TraderListService } from './domain/service/traderListService';

/** 安全群共識新鮮度窗預設：2 × 預設 POLL_INTERVAL_MS（30s）。 */
const DEFAULT_CONSENSUS_FRESHNESS_WINDOW_MILLISECONDS = 2 * 30_000;

export type BuildServerOptions = {
  logger?: boolean;
  /** 安全群共識新鮮度窗（ms）；組裝根可由 POLL_INTERVAL_MS 推得。 */
  consensusFreshnessWindowMilliseconds?: number;
};

/**
 * 組裝 HTTP server：repository（介面）→ domain service（具體）→ application → controller。
 * service 無介面、以具體實例注入 application（見 CLAUDE.md 測試策略）。
 */
export function buildServer(
  traderRepository: ITraderRepository,
  positionRepository: IPositionRepository,
  options: BuildServerOptions = {},
): FastifyInstance {
  const server = Fastify({ logger: options.logger ?? false });

  server.get('/health', () => ({ status: 'ok' }));

  const riskRankingController = new RiskRankingController(
    new RiskRankingApplication(new RiskRankingService(traderRepository)),
  );
  const traderDetailController = new TraderDetailController(
    new TraderDetailApplication(new TraderDetailService(traderRepository)),
  );
  const traderListController = new TraderListController(
    new ListTradersApplication(new TraderListService(traderRepository)),
  );
  const safeCohortConsensusService = new SafeCohortConsensusService(
    traderRepository,
    positionRepository,
    {
      freshnessWindowMilliseconds:
        options.consensusFreshnessWindowMilliseconds ??
        DEFAULT_CONSENSUS_FRESHNESS_WINDOW_MILLISECONDS,
    },
  );
  const safeCohortConsensusController = new SafeCohortConsensusController(
    new SafeCohortConsensusApplication(safeCohortConsensusService),
  );
  const entrySignalController = new EntrySignalController(
    new EntrySignalApplication(safeCohortConsensusService, new EntrySignalService()),
  );
  riskRankingController.register(server);
  traderListController.register(server);
  traderDetailController.register(server);
  safeCohortConsensusController.register(server);
  entrySignalController.register(server);

  return server;
}
