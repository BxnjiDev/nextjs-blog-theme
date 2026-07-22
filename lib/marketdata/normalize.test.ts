import { describe, it, expect } from 'vitest';
import { normalizeCandle, normalizeCandles } from './normalize';

const OPTIONS = { symbol: 'aapl', interval: '1D' as const, provider: 'test', freshness: 'delayed' as const };

// A known regular-session weekday instant (Wed Jan 15 2025, 15:00 UTC = 10:00 AM EST).
const VALID_ROW = { datetime: '2025-01-15T15:00:00Z', open: '100', high: 105, low: 99, close: '103', volume: '1000' };

describe('normalizeCandle', () => {
  it('normalizes a valid row, uppercasing the symbol and stamping session/freshness/provider', () => {
    const candle = normalizeCandle(VALID_ROW, OPTIONS);
    expect(candle).not.toBeNull();
    expect(candle!.symbol).toBe('AAPL');
    expect(candle!.open).toBe(100);
    expect(candle!.high).toBe(105);
    expect(candle!.low).toBe(99);
    expect(candle!.close).toBe(103);
    expect(candle!.volume).toBe(1000);
    expect(candle!.sessionType).toBe('regular');
    expect(candle!.freshness).toBe('delayed');
    expect(candle!.provider).toBe('test');
    expect(candle!.isActive).toBe(false);
  });

  it('accepts numeric OHLC fields as well as string ones', () => {
    const candle = normalizeCandle({ ...VALID_ROW, open: 100, high: 105, low: 99, close: 103 }, OPTIONS);
    expect(candle).not.toBeNull();
    expect(candle!.open).toBe(100);
  });

  it('defaults volume to 0 when omitted', () => {
    const { volume: _drop, ...withoutVolume } = VALID_ROW;
    const candle = normalizeCandle(withoutVolume, OPTIONS);
    expect(candle).not.toBeNull();
    expect(candle!.volume).toBe(0);
  });

  it('returns null for a row missing required fields', () => {
    expect(normalizeCandle({ datetime: '2025-01-15T15:00:00Z', open: '100' }, OPTIONS)).toBeNull();
  });

  it('returns null for a non-numeric OHLC value', () => {
    expect(normalizeCandle({ ...VALID_ROW, close: 'not-a-number' }, OPTIONS)).toBeNull();
  });

  it('returns null for an unparseable datetime', () => {
    expect(normalizeCandle({ ...VALID_ROW, datetime: 'not-a-date' }, OPTIONS)).toBeNull();
  });

  it('returns null when high < low (an impossible candle)', () => {
    expect(normalizeCandle({ ...VALID_ROW, high: 90, low: 99 }, OPTIONS)).toBeNull();
  });

  it('never throws on malformed input', () => {
    expect(() => normalizeCandle(null, OPTIONS)).not.toThrow();
    expect(() => normalizeCandle(undefined, OPTIONS)).not.toThrow();
    expect(() => normalizeCandle('garbage', OPTIONS)).not.toThrow();
    expect(normalizeCandle(null, OPTIONS)).toBeNull();
  });
});

describe('normalizeCandles', () => {
  it('sorts ascending by timestamp regardless of input order', () => {
    const rows = [
      { ...VALID_ROW, datetime: '2025-01-15T18:00:00Z' },
      { ...VALID_ROW, datetime: '2025-01-15T15:00:00Z' },
      { ...VALID_ROW, datetime: '2025-01-15T16:00:00Z' },
    ];
    const candles = normalizeCandles(rows, OPTIONS);
    expect(candles.map((c) => c.timestamp.toISOString())).toEqual([
      '2025-01-15T15:00:00.000Z',
      '2025-01-15T16:00:00.000Z',
      '2025-01-15T18:00:00.000Z',
    ]);
  });

  it('deduplicates rows sharing a timestamp, keeping the later row in the input array', () => {
    const rows = [
      { ...VALID_ROW, close: '100' },
      { ...VALID_ROW, close: '999' }, // corrected re-fetch of the same candle
    ];
    const candles = normalizeCandles(rows, OPTIONS);
    expect(candles).toHaveLength(1);
    expect(candles[0].close).toBe(999);
  });

  it('drops invalid rows instead of throwing or producing NaN', () => {
    const rows = [VALID_ROW, { datetime: '2025-01-15T16:00:00Z', open: 'x', high: 1, low: 1, close: 1 }];
    const candles = normalizeCandles(rows, OPTIONS);
    expect(candles).toHaveLength(1);
  });

  it('returns an empty array for an empty input', () => {
    expect(normalizeCandles([], OPTIONS)).toEqual([]);
  });
});
