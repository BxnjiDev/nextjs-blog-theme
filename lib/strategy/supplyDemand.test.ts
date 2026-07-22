import { describe, it, expect } from 'vitest';
import { identifyDemandZones } from './supplyDemand';
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
 * A deliberately V-shaped 40-candle series: a monotonic decline into a
 * single swing low at index 10 (low=100), then a >8% impulsive departure
 * (peaking at high=115 by index 16) on expanding volume, then a long
 * uneventful drift upward with no further reactions and no mitigation.
 * Every candle after the impulse stays well above the zone, so this
 * series should produce exactly one candidate demand zone.
 */
function buildCleanSeries(): Candle[] {
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
    c(9, 101, 102, 100.5, 101, 1000),
    c(10, 101, 102, 100, 100.5, 1000), // swing low / zone pivot
    c(11, 100.5, 103, 100.2, 102, 1200),
    c(12, 102, 104, 101, 103, 1200),
    c(13, 103, 105, 102, 104, 1200),
    c(14, 104, 108, 103, 107, 2000),
    c(15, 107, 112, 106, 110, 2500),
    c(16, 110, 115, 109, 113, 3000), // impulse peak (forwardHigh)
    c(17, 113, 114, 108, 109, 1500),
    c(18, 109, 111, 107, 110, 1400),
    c(19, 110, 113, 109, 112, 1300),
    c(20, 112, 114, 110, 113, 1300),
  ];
  // Long uneventful drift well above the zone — keeps the total series
  // >= MIN_CANDLES and never re-enters [zoneLow, zoneHigh], so no further
  // reactions or mitigation are counted.
  for (let i = 21; i < 40; i++) {
    const base = 113 + (i - 20) * 0.8;
    candles.push(c(i, base, base + 2, base - 1, base + 1, 1300));
  }
  return candles;
}

describe('identifyDemandZones', () => {
  it('returns no zones when there is not enough OHLC history', () => {
    expect(identifyDemandZones(buildCleanSeries().slice(0, 20))).toEqual([]);
  });

  it('detects a candidate zone at the swing-low base with a correctly computed impulse/volume/quality read', () => {
    const zones = identifyDemandZones(buildCleanSeries(), '1D');
    expect(zones).toHaveLength(1);
    const zone = zones[0];
    expect(zone.priceLevel).toBe(100);
    expect(zone.priceHigh).toBe(101);
    expect(zone.formedAt.getTime()).toBe(new Date(START + 10 * DAY_MS).getTime());
    expect(zone.timeframe).toBe('1D');
    expect(zone.impulseMovePct).toBeCloseTo(15, 1); // (115-100)/100 * 100
    expect(zone.volumeExpansionRatio).toBeGreaterThan(1); // departure volume expanded vs. base
    expect(zone.priorReactionCount).toBe(0);
    expect(zone.mitigated).toBe(false);
    expect(zone.qualityScore).toBeGreaterThan(0);
    expect(zone.qualityScore).toBeLessThanOrEqual(100);
  });

  it('uses careful, hedged language and disclaims institutional order-flow knowledge', () => {
    const zone = identifyDemandZones(buildCleanSeries(), '1D')[0];
    expect(zone.description.toLowerCase()).toMatch(/potential demand zone|prior strong buying response|higher-timeframe demand candidate/);
    expect(zone.description.toLowerCase()).toContain('not confirmation of institutional order flow');
  });

  it('excludes a zone entirely once price has closed back below it (mitigation)', () => {
    const series = buildCleanSeries();
    // Force a mitigating close well below the zone's low (100) shortly after
    // the impulse leg, before any prior reaction is recorded.
    series[22] = c(22, 105, 106, 90, 95, 1300);
    const zones = identifyDemandZones(series, '1D');
    expect(zones.find((z) => z.priceLevel === 100)).toBeUndefined();
  });

  it('never marks a still-active zone as mitigated in its output', () => {
    const zones = identifyDemandZones(buildCleanSeries(), '1D');
    expect(zones.every((z) => z.mitigated === false)).toBe(true);
  });
});
