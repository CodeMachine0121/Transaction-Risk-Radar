import type { PrismaClient } from '@prisma/client';
import type { ITraderRepository } from '../../domain/interface/iTraderRepository';

/** Repository：以 Prisma 維護被追蹤交易員清單（traders）。 */
export class TraderRepository implements ITraderRepository {
  private readonly prismaClient: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient;
  }

  async saveTraders(traderAddresses: string[]): Promise<void> {
    if (traderAddresses.length === 0) {
      return;
    }
    await this.prismaClient.trader.createMany({
      data: traderAddresses.map((address) => ({ address })),
      skipDuplicates: true,
    });
  }

  async findAllAddresses(): Promise<string[]> {
    const rows = await this.prismaClient.trader.findMany({ select: { address: true } });
    return rows.map((row) => row.address);
  }
}
