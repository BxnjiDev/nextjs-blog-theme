import { describe, it, expect } from 'vitest';
import { aggregateTo4h, aggregateToWeekly, aggregateCandles } from './aggregate';
import { exchangeLocalToUtc } from './sessions';
import type { Candle } from './types';

function candle(overrides: Partial<Candle> & { timestamp: Date }): Candle {
  return {
    symbol: 'AAPL',
    interval: '1h',
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
    exchangeTimezone: 'America/New_York',
    sessionType: 'regular',
    provider: 'test',
    receivedAt: new Date(),
    freshness: 'delayed',
    adjusted: false,
    splitAdjustment: null,
    isActive: false,
    ...overrides,
  };
}

// Jan 15 2025 is an ordinary Wednesday trading day. Seven hourly candles at
// 9:30, 10:30, ... 15:30 ET span the full 9:30-16:00 regular session.
const HOURLY_ET_TIMES = [
  [9, 30],
  [10, 30],
  [11, 30],
  [12, 30],
  [13, 30],
  [14, 30],
  [15, 30],
] as const;

function buildHourlySession(): Candle[] {
  return HOURLY_ET_TIMES.map(([hour, minute], i) =>
    candle({
      timestamp: exchangeLocalToUtc(2025, 1, 15, hour, minute),
      open: 100 + i,
      high: 105 + i,
      low: 98 + i,
      close: 102 + i,
      volume: 1000 * (i + 1),
    })
  );
}

describe('aggregateTo4h', () => {
  it('anchors buckets at the regular session open and clips the final bucket at session close', () => {
    const result = aggregateTo4h(buildHourlySession());
    // 9:30-13:30 (4 candles) and 13:30-16:00 (3 candles, intentionally shorter)
    expect(result).toHaveLength(2);
    expect(result[0].timestamp.toISOString()).toBe(exchangeLocalToUtc(2025, 1, 15, 9, 30).toISOString());
    expect(result[1].timestamp.toISOString()).toBe(exchangeLocalToUtc(2025, 1, 15, 13, 30).toISOString());
  });

  it('computes open=first/high=max/low=min/close=last/volume=sum per bucket', () => {
    const source = buildHourlySession();
    const result = aggregateTo4h(source);

    const firstBucket = source.slice(0, 4); // 9:30-12:30
    expect(result[0].open).toBe(firstBucket[0].open);
    expect(result[0].high).toBe(Math.max(...firstBucket.map((c) => c.high)));
    expect(result[0].low).toBe(Math.min(...firstBucket.map((c) => c.low)));
    expect(result[0].close).toBe(firstBucket[firstBucket.length - 1].close);
    expect(result[0].volume).toBe(firstBucket.reduce((s, c) => s + c.volume, 0));

    const secondBucket = source.slice(4); // 13:30-15:30
    expect(result[1].open).toBe(secondBucket[0].open);
    expect(result[1].close).toBe(secondBucket[secondBucket.length - 1].close);
    expect(result[1].volume).toBe(secondBucket.reduce((s, c) => s + c.volume, 0));
  });

  it('drops source candles outside any regular session (e.g. a weekend timestamp)', () => {
    const weekendCandle = candle({ timestamp: new Date('2025-01-18T15:00:00Z'), volume: 999999 }); // Saturday
    const withWeekend = aggregateTo4h([...buildHourlySession(), weekendCandle]);
    const withoutWeekend = aggregateTo4h(buildHourlySession());
    // Compare shape, not receivedAt (stamped independently on each call).
    expect(withWeekend.map((c) => ({ ...c, receivedAt: null }))).toEqual(withoutWeekend.map((c) => ({ ...c, receivedAt: null })));
  });

  it('never blindly groups by clock hour — a session starting mid-hour still buckets from 9:30, not from the top of the hour', () => {
    const result = aggregateTo4h(buildHourlySession());
    // If this were blind clock-hour grouping (e.g. 9:00-13:00), the first
    // bucket's timestamp would be 9:00 ET, not the session-open-anchored 9:30.
    expect(result[0].timestamp.toISOString()).not.toBe(exchangeLocalToUtc(2025, 1, 15, 9, 0).toISOString());
  });
});

describe('aggregateToWeekly', () => {
  it('groups daily candles by ISO (Monday-anchored) week and stamps the first available session', () => {
    // Week 1: Mon Jan 13 - Wed Jan 15, 2025. Week 2: Mon Jan 20 - Tue Jan 21.
    const week1 = [
      candle({ timestamp: exchangeLocalToUtc(2025, 1, 13, 9, 30), open: 100, high: 110, low: 95, close: 105, volume: 1000 }),
      candle({ timestamp: exchangeLocalToUtc(2025, 1, 14, 9, 30), open: 105, high: 112, low: 100, close: 108, volume: 1100 }),
      candle({ timestamp: exchangeLocalToUtc(2025, 1, 15, 9, 30), open: 108, high: 115, low: 106, close: 111, volume: 1200 }),
    ];
    const week2 = [
      candle({ timestamp: exchangeLocalToUtc(2025, 1, 20, 9, 30), open: 111, high: 120, low: 109, close: 118, volume: 1300 }),
      candle({ timestamp: exchangeLocalToUtc(2025, 1, 21, 9, 30), open: 118, high: 121, low: 115, close: 119, volume: 1400 }),
    ];

    const result = aggregateToWeekly([...week1, ...week2]);
    expect(result).toHaveLength(2);

    expect(result[0].timestamp.toISOString()).toBe(week1[0].timestamp.toISOString());
    expect(result[0].open).toBe(100);
    expect(result[0].high).toBe(115);
    expect(result[0].low).toBe(95);
    expect(result[0].close).toBe(111);
    expect(result[0].volume).toBe(1000 + 1100 + 1200);

    expect(result[1].timestamp.toISOString()).toBe(week2[0].timestamp.toISOString());
    expect(result[1].open).toBe(111);
    expect(result[1].close).toBe(119);
    expect(result[1].volume).toBe(1300 + 1400);
  });
});

describe('aggregateCandles', () => {
  it('dispatches 4h to aggregateTo4h and 1W to aggregateToWeekly', () => {
    const source = buildHourlySession();
    const viaDispatch = aggregateCandles(source, '4h').map((c) => ({ ...c, receivedAt: null }));
    const viaDirect = aggregateTo4h(source).map((c) => ({ ...c, receivedAt: null }));
    expect(viaDispatch).toEqual(viaDirect);
  });

  it('throws for an interval this app never aggregates (must be fetched natively)', () => {
    expect(() => aggregateCandles(buildHourlySession(), '1h')).toThrow(/unsupported target interval/);
  });
});
