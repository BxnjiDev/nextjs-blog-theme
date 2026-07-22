import { describe, it, expect } from 'vitest';
import { isInterval, candlesToHistoricalPricePoints } from './types';
import type { Candle } from './types';

describe('isInterval', () => {
  it('accepts every canonical interval', () => {
    for (const v of ['30m', '1h', '4h', '1D', '1W']) expect(isInterval(v)).toBe(true);
  });

  it('rejects an unsupported interval string', () => {
    expect(isInterval('15m')).toBe(false);
    expect(isInterval('1M')).toBe(false);
    expect(isInterval('')).toBe(false);
  });
});

describe('candlesToHistoricalPricePoints', () => {
  it('maps timestamp/close/volume, dropping OHLC range fields', () => {
    const candles: Candle[] = [
      {
        symbol: 'AAPL',
        interval: '1D',
        timestamp: new Date('2025-01-15T15:00:00Z'),
        open: 100,
        high: 110,
        low: 95,
        close: 105,
        volume: 5000,
        exchangeTimezone: 'America/New_York',
        sessionType: 'regular',
        provider: 'test',
        receivedAt: new Date(),
        freshness: 'delayed',
        adjusted: false,
        splitAdjustment: null,
        isActive: false,
      },
    ];
    const points = candlesToHistoricalPricePoints(candles);
    expect(points).toEqual([{ date: candles[0].timestamp, close: 105, volume: 5000 }]);
  });

  it('returns an empty array for an empty input', () => {
    expect(candlesToHistoricalPricePoints([])).toEqual([]);
  });
});
