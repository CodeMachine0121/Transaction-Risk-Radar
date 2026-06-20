import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { EntrySignalApplication } from '@/application/entrySignalApplication';
import { EntrySignalService } from '@/domain/service/entrySignalService';
import { SafeCohortConsensusService } from '@/domain/service/safeCohortConsensusService';
import type { CurrentOpenPosition } from '@/domain/vo/currentOpenPosition';
import type { EntrySignalThresholds } from '@/domain/vo/entrySignalThresholds';
import { buildTrader, createMockTraderRepository } from './support/mockTraderRepository';
import { createMockPositionRepository } from './support/mockPositionRepository';

const position = (
  traderAddress: string,
  coin: string,
  signedSize: number,
  leverage: number,
  positionNotional = Math.abs(signedSize) * 100,
): CurrentOpenPosition => ({
  traderAddress,
  coin,
  signedSize: new Decimal(signedSize),
  leverage: new Decimal(leverage),
  positionNotional: new Decimal(positionNotional),
  capturedAt: 1000,
  firstObservedAt: 1000,
});

const buildApplication = (
  traders: ReturnType<typeof createMockTraderRepository>,
  positions: ReturnType<typeof createMockPositionRepository>,
  thresholds?: EntrySignalThresholds,
): EntrySignalApplication =>
  new EntrySignalApplication(
    new SafeCohortConsensusService(traders, positions, { freshnessWindowMilliseconds: 60_000 }),
    new EntrySignalService(thresholds),
  );

describe('EntrySignalApplication', () => {
  it('emits a long worth-considering signal with reasons for a clear, non-crowded consensus', async () => {
    const traders = createMockTraderRepository();
    vi.mocked(traders.findRankableTraders).mockResolvedValue(
      ['t1', 't2', 't3', 't4', 't5'].map((address) => buildTrader(address, 0)),
    );
    const positions = createMockPositionRepository();
    vi.mocked(positions.findCurrentOpenPositions).mockResolvedValue([
      position('t1', 'BTC', 1, 10),
      position('t2', 'BTC', 1, 10),
      position('t3', 'BTC', 1, 10),
      position('t4', 'BTC', 1, 10),
      position('t5', 'BTC', -1, 10), // 4 多 1 空 → conviction bias 0.6（非擁擠）
    ]);
    const application = buildApplication(traders, positions);

    const report = await application.evaluateEntrySignals({});
    const btc = report.signals.find((signal) => signal.coin === 'BTC');

    expect(report.experimental).toBe(true);
    expect(report.disclaimer.length).toBeGreaterThan(0);
    expect(btc?.lean).toBe('long');
    expect(btc?.verdict).toBe('worth-considering');
    expect(Number(btc?.setupQuality)).toBeCloseTo(0.6, 4); // = strength
    expect(btc?.reasons.length).toBeGreaterThan(0);
  });
});
