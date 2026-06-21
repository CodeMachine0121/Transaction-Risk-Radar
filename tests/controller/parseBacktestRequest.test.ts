import { describe, expect, it } from 'vitest';
import { parseBacktestRequest } from '@/controller/parseBacktestRequest';

const HOUR_MS = 60 * 60 * 1000;

describe('parseBacktestRequest', () => {
  it('parses coin, since and an horizonsHours list into milliseconds', () => {
    const result = parseBacktestRequest({ coin: 'BTC', since: '1000', horizonsHours: '4,24,72' }, []);
    expect('query' in result).toBe(true);
    if ('query' in result) {
      expect(result.query.coin).toBe('BTC');
      expect(result.query.since).toBe(1000);
      expect(result.query.horizonsMilliseconds).toEqual([4 * HOUR_MS, 24 * HOUR_MS, 72 * HOUR_MS]);
    }
  });

  it('uses request horizons over the provided env default', () => {
    const result = parseBacktestRequest({ coin: 'BTC', horizonsHours: '6' }, [4, 24]);
    if ('query' in result) {
      expect(result.query.horizonsMilliseconds).toEqual([6 * HOUR_MS]);
    }
  });

  it('falls back to the provided env default when horizonsHours is absent', () => {
    const result = parseBacktestRequest({ coin: 'BTC' }, [4, 24]);
    if ('query' in result) {
      expect(result.query.horizonsMilliseconds).toEqual([4 * HOUR_MS, 24 * HOUR_MS]);
    }
  });

  it('falls back to the code default when both request and env are absent', () => {
    const result = parseBacktestRequest({ coin: 'BTC' }, []);
    if ('query' in result) {
      expect(result.query.horizonsMilliseconds).toEqual([1 * HOUR_MS, 4 * HOUR_MS, 24 * HOUR_MS]);
    }
  });

  it('defaults since to 0 (all history) when absent', () => {
    const result = parseBacktestRequest({ coin: 'BTC' }, [4]);
    if ('query' in result) {
      expect(result.query.since).toBe(0);
    }
  });

  it('rejects a missing coin', () => {
    expect(parseBacktestRequest({ horizonsHours: '4' }, [])).toEqual({ error: 'coin is required' });
  });

  it('rejects a non-positive or non-numeric horizon', () => {
    expect('error' in parseBacktestRequest({ coin: 'BTC', horizonsHours: '4,0' }, [])).toBe(true);
    expect('error' in parseBacktestRequest({ coin: 'BTC', horizonsHours: '4,x' }, [])).toBe(true);
  });

  it('rejects an invalid since', () => {
    expect('error' in parseBacktestRequest({ coin: 'BTC', since: '-1' }, [])).toBe(true);
    expect('error' in parseBacktestRequest({ coin: 'BTC', since: 'abc' }, [])).toBe(true);
  });
});
