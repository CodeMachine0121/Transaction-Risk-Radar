import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7：CLI / Migrate 的連線 URL 在此提供（schema.prisma 不再放 url）。
// 執行時的連線由 @prisma/adapter-pg 處理（見 src/infrastructure/persistence）。
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
