import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * 建立 PrismaClient（Prisma 7：透過 pg driver adapter 連線）。
 * connectionString 由組裝根 (composition root) 從環境變數讀取後傳入，
 * 本模組不直接存取 process.env，以維持可測試性。
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
