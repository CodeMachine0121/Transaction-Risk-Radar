import Fastify from 'fastify';

// 組裝根 (composition root)：在此建立各層實作並注入介面依賴。
// 第一版先提供 health 路由，業務路由將於 /tdd 階段逐步接上。
const server = Fastify({ logger: true });

server.get('/health', () => {
  return { status: 'ok' };
});

const port = Number(process.env.PORT ?? '3000');

try {
  await server.listen({ port, host: '0.0.0.0' });
} catch (error) {
  server.log.error({ error }, 'failed to start server');
  process.exit(1);
}
