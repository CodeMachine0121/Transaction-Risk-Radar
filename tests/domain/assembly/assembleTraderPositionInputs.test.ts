import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  assembleTraderPositionInputs,
  type IAssemblyPosition,
} from '@/domain/assembly/assembleTraderPositionInputs';
import type { IReconstructedPosition } from '@/domain/reconstruction/reconstructPositions';

const reconstructed = (overrides: Partial<IReconstructedPosition> = {}): IReconstructedPosition => ({
  coin: 'ETH',
  side: 'long',
  events: [{ type: 'open', price: new Decimal(100), size: new Decimal(1) }],
  realizedProfitAndLoss: new Decimal(10),
  realizedReturnPercentage: new Decimal(10),
  isClosed: true,
  ...overrides,
});

const snapshot = (unrealized: number, leverage: number): IAssemblyPosition['snapshots'][number] => ({
  unrealizedProfitAndLossPercentage: new Decimal(unrealized),
  leverage: new Decimal(leverage),
});

describe('assembleTraderPositionInputs', () => {
  it('maps a closed position with its snapshot series and averaged leverage', () => {
    const inputs = assembleTraderPositionInputs([
      { reconstructed: reconstructed(), snapshots: [snapshot(-20, 10), snapshot(-40, 20)] },
    ]);

    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.side).toBe('long');
    expect(inputs[0]?.unrealizedProfitAndLossPercentages.map((value) => value.toString())).toEqual([
      '-20',
      '-40',
    ]);
    expect(inputs[0]?.averageLeverage.toString()).toBe('15');
    expect(inputs[0]?.closed?.realizedReturnPercentage.toString()).toBe('10');
    expect(inputs[0]?.closed?.realizedProfitAndLoss.toString()).toBe('10');
  });

  it('sets closed to null for an open position', () => {
    const inputs = assembleTraderPositionInputs([
      { reconstructed: reconstructed({ isClosed: false }), snapshots: [snapshot(-5, 8)] },
    ]);

    expect(inputs[0]?.closed).toBeNull();
  });

  it('drops positions that have no snapshots (never observed open)', () => {
    const inputs = assembleTraderPositionInputs([
      { reconstructed: reconstructed(), snapshots: [] },
      { reconstructed: reconstructed({ coin: 'BTC' }), snapshots: [snapshot(-10, 5)] },
    ]);

    expect(inputs).toHaveLength(1);
  });
});
