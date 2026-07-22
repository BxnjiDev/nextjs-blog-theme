import { describe, it, expect } from 'vitest';
import { buildMultiTimeframeContext } from './multiTimeframe';
import type { Candle, Interval } from '@/lib/marketdata/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const START = new Date('2025-01-01T15:00:00Z').getTime();
const LEN = 60;

function baseCandle(idx: number, close: number, volume: number, interval: Interval): Candle {
  return {
    symbol: 'TEST',
    interval,
    timestamp: new Date(START + idx * DAY_MS),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume,
    exchangeTimezone: 'America/New_York',
    sessionType: 'regular',
    provider: 'test',
    receivedAt: new Date(),
    freshness: 'delayed',
    adjusted: false,
    splitAdjustment: null,
    isActive: false,
  };
}

/** A clean, strongly directional 60-candle series — every trend/momentum/
 * volume-confirmation factor computeTechnicalEvidence can produce should
 * read unambiguously in `direction`, giving a deterministic overallTone. */
function directionalSeries(direction: 'up' | 'down', interval: Interval): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < LEN; i++) {
    const progress = i / (LEN - 1);
    const close = direction === 'up' ? 100 + progress * 60 : 160 - progress * 60;
    const volume = i >= LEN - 10 ? 1500 : 1000; // rising volume into the most recent sessions
    candles.push(baseCandle(i, close, volume, interval));
  }
  return candles;
}

function flatBenchmark(): Candle[] {
  return Array.from({ length: LEN }, (_, i) => baseCandle(i, 100, 1000, '1D'));
}

describe('buildMultiTimeframeContext', () => {
  it('flags a conflict when a higher timeframe reads negative and a lower one reads positive', () => {
    const context = buildMultiTimeframeContext(
      { '1D': directionalSeries('down', '1D'), '30m': directionalSeries('up', '30m') },
      flatBenchmark()
    );
    expect(context.hasConflict).toBe(true);
    expect(context.conflicts).toHaveLength(1);
    expect(context.conflicts[0].higherTimeframe).toBe('1D');
    expect(context.conflicts[0].lowerTimeframe).toBe('30m');
    expect(context.conflicts[0].higherTone).toBe('negative');
    expect(context.conflicts[0].lowerTone).toBe('positive');
    expect(context.conflicts[0].description.toLowerCase()).toMatch(/lowers confidence/);
  });

  it('does not flag a conflict when available timeframes agree', () => {
    const context = buildMultiTimeframeContext(
      { '1D': directionalSeries('up', '1D'), '30m': directionalSeries('up', '30m') },
      flatBenchmark()
    );
    expect(context.hasConflict).toBe(false);
    expect(context.conflicts).toEqual([]);
  });

  it('weights higher timeframes more heavily so a bearish higher timeframe is not washed out by a smaller bullish lower timeframe', () => {
    const context = buildMultiTimeframeContext(
      { '1D': directionalSeries('down', '1D'), '30m': directionalSeries('up', '30m') },
      flatBenchmark()
    );
    // 1D (weight 2) reads negative, 30m (weight 0.5) reads positive —
    // weighted score is negative overall, matching the brief's "a bullish
    // 30-minute signal must not override a bearish weekly structure."
    expect(context.overallTone).toBe('negative');
  });

  it('only builds snapshots for timeframes the caller actually supplied candles for', () => {
    const context = buildMultiTimeframeContext({ '1D': directionalSeries('up', '1D') }, flatBenchmark());
    expect(context.snapshots).toHaveLength(1);
    expect(context.snapshots[0].timeframe).toBe('1D');
    expect(context.conflicts).toEqual([]);
    expect(context.hasConflict).toBe(false);
  });

  it('defaults to the standard timeframe roles when none are supplied', () => {
    const context = buildMultiTimeframeContext({ '1D': directionalSeries('up', '1D') }, flatBenchmark());
    expect(context.roles).toEqual({ longTermThesisTimeframe: '1W', swingSetupTimeframe: '4h', entryTimeframe: '30m', invalidationTimeframe: '4h' });
  });
});
