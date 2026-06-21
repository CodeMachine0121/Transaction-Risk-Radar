import Fastify, { type FastifyInstance } from 'fastify';
import { BacktestApplication } from './application/backtestApplication';
import { ListCoinCoverageApplication } from './application/listCoinCoverageApplication';
import { ListRecordedCoinsApplication } from './application/listRecordedCoinsApplication';
import { ListTradersApplication } from './application/listTradersApplication';
import { RiskRankingApplication } from './application/riskRankingApplication';
import { EntrySignalApplication } from './application/entrySignalApplication';
import { SafeCohortConsensusApplication } from './application/safeCohortConsensusApplication';
import { TraderDetailApplication } from './application/traderDetailApplication';
import { BacktestController } from './controller/backtestController';
import { CoinCoverageController } from './controller/coinCoverageController';
import { RecordedCoinController } from './controller/recordedCoinController';
import { EntrySignalController } from './controller/entrySignalController';
import { RiskRankingController } from './controller/riskRankingController';
import { SafeCohortConsensusController } from './controller/safeCohortConsensusController';
import { TraderDetailController } from './controller/traderDetailController';
import { TraderListController } from './controller/traderListController';
import type { IConsensusSnapshotRepository } from './domain/interface/iConsensusSnapshotRepository';
import type { IPositionRepository } from './domain/interface/iPositionRepository';
import type { IPriceProxy } from './domain/interface/iPriceProxy';
import type { ITraderRepository } from './domain/interface/iTraderRepository';
import { BacktestEvaluatorService } from './domain/service/backtestEvaluatorService';
import { RecordedCoinService } from './domain/service/recordedCoinService';
import { EntrySignalService } from './domain/service/entrySignalService';
import { RiskRankingService } from './domain/service/riskRankingService';
import { SafeCohortConsensusService } from './domain/service/safeCohortConsensusService';
import { TraderDetailService } from './domain/service/traderDetailService';
import { TraderListService } from './domain/service/traderListService';

/** 安全群共識新鮮度窗預設：2 × 預設 POLL_INTERVAL_MS（30s）。 */
const DEFAULT_CONSENSUS_FRESHNESS_WINDOW_MILLISECONDS = 2 * 30_000;

/** /backtest 的依賴與設定；省略則不註冊該（內部/受保護）端點。 */
export type BacktestServerOptions = {
  consensusSnapshotRepository: IConsensusSnapshotRepository;
  priceProxy: IPriceProxy;
  /** 設定後，請求須帶相符的 `x-internal-token` 標頭。 */
  token?: string;
  /** env BACKTEST_HORIZONS_HOURS 解析後的預設視窗（小時）。 */
  defaultHorizonsHours?: number[];
};

export type BuildServerOptions = {
  logger?: boolean;
  /** 安全群共識新鮮度窗（ms）；組裝根可由 POLL_INTERVAL_MS 推得。 */
  consensusFreshnessWindowMilliseconds?: number;
  /** 提供則註冊內部/受保護的 /backtest 端點。 */
  backtest?: BacktestServerOptions;
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

  if (options.backtest !== undefined) {
    const recordedCoinService = new RecordedCoinService(
      options.backtest.consensusSnapshotRepository,
    );
    const recordedCoinController = new RecordedCoinController(
      new ListRecordedCoinsApplication(recordedCoinService),
    );
    recordedCoinController.register(server);

    const coinCoverageController = new CoinCoverageController(
      new ListCoinCoverageApplication(recordedCoinService),
    );
    coinCoverageController.register(server);

    const backtestController = new BacktestController(
      new BacktestApplication(
        options.backtest.consensusSnapshotRepository,
        options.backtest.priceProxy,
        new BacktestEvaluatorService(),
      ),
      {
        token: options.backtest.token,
        defaultHorizonsHours: options.backtest.defaultHorizonsHours ?? [],
      },
    );
    backtestController.register(server);
  }

  return server;
}
