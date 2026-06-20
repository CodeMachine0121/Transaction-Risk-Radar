import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { SafeCohortConsensusApplication } from '@/application/safeCohortConsensusApplication';
import { SafeCohortConsensusService } from '@/domain/service/safeCohortConsensusService';
import type { CurrentOpenPosition } from '@/domain/vo/currentOpenPosition';
import { buildTrader, createMockTraderRepository } from './support/mockTraderRepository';
import { createMockPositionRepository } from './support/mockPositionRepository';

const position = (
  traderAddress: string,
  coin: string,
  signedSize: number,
  leverage: number,
  capturedAt = 1000,
): CurrentOpenPosition => ({
  traderAddress,
  coin,
  signedSize: new Decimal(signedSize),
  leverage: new Decimal(leverage),
  capturedAt,
});

const buildApplication = (
  traders: ReturnType<typeof createMockTraderRepository>,
  positions: ReturnType<typeof createMockPositionRepository>,
): SafeCohortConsensusApplication =>
  new SafeCohortConsensusApplication(
    new SafeCohortConsensusService(traders, positions, { freshnessWindowMilliseconds: 60_000 }),
  );

describe('SafeCohortConsensusApplication', () => {
  it('aggregates net direction, counts and average leverage for a coin (equal weight)', async () => {
    const traders = createMockTraderRepository();
    vi.mocked(traders.findRankableTraders).mockResolvedValue([
      buildTrader('A', 0),
      buildTrader('B', 0),
      buildTrader('C', 0),
      buildTrader('D', 0),
    ]);
    const positions = createMockPositionRepository();
    vi.mocked(positions.findCurrentOpenPositions).mockResolvedValue([
      position('A', 'BTC', 5, 10),
      position('B', 'BTC', 3, 10),
      position('C', 'BTC', 1, 10),
      position('D', 'BTC', -2, 10),
    ]);
    const application = buildApplication(traders, positions);

    const result = await application.listConsensus({});

    expect(result.coins).toHaveLength(1);
    const btc = result.coins[0];
    expect(btc?.coin).toBe('BTC');
    expect(btc?.participantCount).toBe(4);
    expect(btc?.longCount).toBe(3);
    expect(btc?.shortCount).toBe(1);
    expect(btc?.netDirectionBias).toBe('0.5'); // (3 - 1) / 4
    expect(btc?.consensusStrength).toBe('0.5');
    expect(btc?.longShareOfParticipants).toBe('0.75');
    expect(btc?.averageLeverage).toBe('10');
    expect(result.disclaimer.length).toBeGreaterThan(0);
  });

  it('weights each vote inverse to riskScore', async () => {
    const traders = createMockTraderRepository();
    vi.mocked(traders.findRankableTraders).mockResolvedValue([
      buildTrader('SAFE', 0), // weight 1, long
      buildTrader('RISKY', 40), // weight 0.6, short
    ]);
    const positions = createMockPositionRepository();
    vi.mocked(positions.findCurrentOpenPositions).mockResolvedValue([
      position('SAFE', 'ETH', 4, 10),
      position('RISKY', 'ETH', -1, 6),
    ]);
    const application = buildApplication(traders, positions);

    const result = await application.listConsensus({ minimumConsensusParticipants: 1 });

    const eth = result.coins[0];
    expect(eth?.netDirectionBias).toBe('0.25'); // (1 - 0.6) / (1 + 0.6)
    expect(eth?.consensusStrength).toBe('0.25');
    expect(eth?.averageLeverage).toBe('8'); // (10 + 6) / 2
  });
});
