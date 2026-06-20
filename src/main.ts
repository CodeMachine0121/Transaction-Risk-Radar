import { PositionRepository } from './infrastructure/persistence/positionRepository';
import { createPrismaClient } from './infrastructure/persistence/prismaClient';
import { TraderRepository } from './infrastructure/persistence/traderRepository';
import { buildServer } from './server';

// 組裝根 (composition root)：在此選定具體實作並注入。
const connectionString = process.env.DATABASE_URL ?? '';
const prismaClient = createPrismaClient(connectionString);
const repository = new TraderRepository(prismaClient);
const positionRepository = new PositionRepository(prismaClient);
const pollIntervalMilliseconds = Number(process.env.POLL_INTERVAL_MS ?? `${30 * 1000}`);
const server = buildServer(repository, positionRepository, {
  logger: true,
  consensusFreshnessWindowMilliseconds: 2 * pollIntervalMilliseconds,
});

const port = Number(process.env.PORT ?? '3000');

try {
  await server.listen({ port, host: '0.0.0.0' });
} catch (error) {
  server.log.error({ error }, 'failed to start server');
  process.exit(1);
}
