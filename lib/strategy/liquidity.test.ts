import { describe, it, expect } from 'vitest';
import { detectLiquidityEvidence } from './liquidity';
import type { Candle } from '@/lib/marketdata/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const START = new Date('2025-01-01T15:00:00Z').getTime();

function c(idx: number, open: number, high: number, low: number, close: number, volume: number): Candle {
  return {
    symbol: 'TEST',
    interval: '1D',
    timestamp: new Date(START + idx * DAY_MS),
    open,
    high,
    low,
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

/**
 * A 40-candle series with a single, unambiguous swing low at index 15
 * (low=95): a monotonic decline into it, then a monotonic ascent away from
 * it (so no ties/spurious pivots form along the way). Index 33 then wicks
 * clearly below 95 (low=93) on elevated volume, closes immediately back
 * above it, and holds above it for three more candles — a textbook
 * confirmed sweep-and-reclaim.
 */
function buildSeriesWithConfirmedSweep(): Candle[] {
  const candles: Candle[] = [
    c(0, 110, 111, 109, 110, 1000),
    c(1, 109, 110, 108, 109, 1000),
    c(2, 108, 109, 107, 108, 1000),
    c(3, 107, 108, 106, 107, 1000),
    c(4, 106, 107, 105, 106, 1000),
    c(5, 105, 106, 104, 105, 1000),
    c(6, 104, 105, 103, 104, 1000),
    c(7, 103, 104, 102, 103, 1000),
    c(8, 102, 103, 101, 102, 1000),
    c(9, 101, 102, 100, 101, 1000),
    c(10, 100, 101, 99, 100, 1000),
    c(11, 99, 100, 98, 99, 1000),
    c(12, 98, 99, 97, 98, 1000),
    c(13, 97, 98, 96.5, 97, 1000),
    c(14, 97, 98, 96, 97, 1000),
    c(15, 96, 97, 95, 96, 1000), // the swing low (price=95)
    c(16, 96, 98, 95.5, 97, 1000),
    c(17, 97, 99, 96, 98, 1000),
    c(18, 98, 100, 97, 99, 1000),
    c(19, 99, 101, 98, 100, 1000),
    c(20, 100, 102, 99, 101, 1000),
    c(21, 101, 103, 100, 102, 1000),
    c(22, 102, 104, 101, 103, 1000),
    c(23, 103, 105, 102, 104, 1000),
    c(24, 104, 106, 103, 105, 1000),
    c(25, 105, 107, 104, 106, 1000),
    c(26, 106, 108, 105, 107, 1000),
    c(27, 107, 109, 106, 108, 1000),
    c(28, 108, 110, 107, 109, 1000),
    c(29, 109, 111, 108, 110, 1000),
    c(30, 110, 112, 109, 111, 1000),
    c(31, 111, 113, 110, 112, 1000),
    c(32, 112, 114, 111, 113, 1000),
    c(33, 99, 100, 93, 98, 2000), // sweep: wicks below 95, closes back above it, elevated volume
    c(34, 98, 99, 96, 97, 1300), // follow-through holds above 95
    c(35, 97, 99, 96, 98, 1300),
    c(36, 98, 100, 97, 99, 1300),
    c(37, 99, 100, 97, 99, 1300),
    c(38, 99, 100, 97, 99, 1300),
    c(39, 99, 100, 97, 99, 1300),
  ];
  return candles;
}

describe('detectLiquidityEvidence', () => {
  it('reports unavailable when there is not enough OHLC history', () => {
    const evidence = detectLiquidityEvidence(buildSeriesWithConfirmedSweep().slice(0, 20));
    expect(evidence.available).toBe(false);
    expect(evidence.events).toEqual([]);
  });

  it('reports no events when price never trades through a prior swing high/low', () => {
    // The first 33 candles rise monotonically away from the swing low with
    // no wick below it and no new swing high exceeded near the end.
    const evidence = detectLiquidityEvidence(buildSeriesWithConfirmedSweep().slice(0, 33));
    expect(evidence.available).toBe(true);
    expect(evidence.events).toEqual([]);
  });

  it('classifies a wick-below/reclaim-and-hold as a confirmed sweep-and-reclaim', () => {
    const evidence = detectLiquidityEvidence(buildSeriesWithConfirmedSweep(), '1D');
    expect(evidence.available).toBe(true);
    expect(evidence.events).toHaveLength(1);
    const event = evidence.events[0];
    expect(event.classification).toBe('confirmed_sweep_reclaim');
    expect(event.direction).toBe('sell_side');
    expect(event.sweptLevel).toBe(95);
    expect(event.timeframe).toBe('1D');
    expect(event.volumeConfirmed).toBe(true);
    expect(event.followThroughConfirmed).toBe(true);
    expect(event.wickToBodyRatio).toBeGreaterThan(1);
  });

  it('never claims order-flow, resting-liquidity, or institutional-positioning knowledge', () => {
    const event = detectLiquidityEvidence(buildSeriesWithConfirmedSweep()).events[0];
    expect(event.description.toLowerCase()).toContain('price-structure inference');
    expect(event.description.toLowerCase()).toContain('no order-flow or resting-liquidity data');
  });
});
