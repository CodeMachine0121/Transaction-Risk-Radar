import { createPrismaClient } from './infrastructure/persistence/prismaClient';
import { TraderRepository } from './infrastructure/persistence/traderRepository';
import { buildServer } from './server';

// 組裝根 (composition root)：在此選定具體實作並注入。
const connectionString = process.env.DATABASE_URL ?? '';
const prismaClient = createPrismaClient(connectionString);
const repository = new TraderRepository(prismaClient);
const server = buildServer(repository, { logger: true });

const port = Number(process.env.PORT ?? '3000');

try {
  await server.listen({ port, host: '0.0.0.0' });
} catch (error) {
  server.log.error({ error }, 'failed to start server');
  process.exit(1);
}
