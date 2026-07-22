import type { Candle, Interval } from '@/lib/marketdata/types';
import type { DemandZone } from './types';

/**
 * OHLCV-derived candidate demand zones — a base/consolidation structure at
 * a swing low, followed by a strong impulsive departure. This replaces the
 * earlier close-price-only proxy now that the app has real intrabar
 * range and volume via lib/marketdata (see lib/domain/candles.ts). Still
 * explicitly a deterministic price-structure inference, not true
 * volume-at-price/order-flow analysis — every zone's `description` uses
 * careful language ("potential demand zone," "area of prior strong buying
 * response") and this is only ever used by lib/decision/engine.ts to add
 * confidence alongside other independent evidence, never as a standalone
 * buy signal.
 */

const MIN_CANDLES = 30;
const PIVOT_WINDOW = 3;
const IMPULSE_LOOKFORWARD = 10;
const IMPULSE_THRESHOLD_PCT = 8;
const RETEST_BAND_PCT = 3;
const REACTION_LOOKFORWARD = 5;
const MAX_ZONES = 3;

function ascendingByTime(candles: Candle[]): Candle[] {
  return [...candles].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function isSwingLow(candles: Candle[], i: number, window: number): boolean {
  const windowLows = candles.slice(i - window, i + window + 1).map((c) => c.low);
  return candles[i].low === Math.min(...windowLows);
}

/** Counts how many times, after the impulse leg, price returns into the
 * zone and reacts (the next few candles bounce back above the zone's
 * high) — before any mitigation. Stops counting once mitigated, since a
 * "reaction" after the zone is already broken isn't evidence for it. */
function countPriorReactions(candles: Candle[], startIdx: number, zoneLow: number, zoneHigh: number): { reactions: number; mitigated: boolean } {
  let reactions = 0;
  let mitigated = false;
  let i = startIdx;
  while (i < candles.length) {
    if (candles[i].close < zoneLow) {
      mitigated = true;
      break;
    }
    if (candles[i].low <= zoneHigh) {
      const forward = candles.slice(i + 1, Math.min(candles.length, i + 1 + REACTION_LOOKFORWARD));
      const bounced = forward.some((c) => c.close > zoneHigh);
      if (bounced) {
        reactions++;
        i += forward.length || 1;
        continue;
      }
    }
    i++;
  }
  return { reactions, mitigated };
}

function computeQualityScore(input: { impulseMovePct: number; volumeExpansionRatio: number; priorReactionCount: number; ageInCandles: number; totalCandles: number }): number {
  const impulseScore = Math.min(40, (input.impulseMovePct / IMPULSE_THRESHOLD_PCT) * 20);
  const volumeScore = Math.min(25, Math.max(0, (input.volumeExpansionRatio - 1) * 25));
  const reactionScore = Math.min(20, input.priorReactionCount * 10);
  const freshnessScore = Math.max(0, 15 - (input.ageInCandles / Math.max(1, input.totalCandles)) * 15);
  return Math.round(Math.min(100, impulseScore + volumeScore + reactionScore + freshnessScore));
}

function describeZone(zone: Omit<DemandZone, 'description'>): string {
  const range = `$${zone.priceLevel.toFixed(2)}–$${zone.priceHigh.toFixed(2)}`;
  const strength =
    zone.priorReactionCount >= 2
      ? `an area of prior strong buying response (${zone.priorReactionCount} prior reactions recorded)`
      : zone.qualityScore >= 55
        ? 'a higher-timeframe demand candidate'
        : 'a potential demand zone';
  return (
    `${strength} at ${range} (${zone.timeframe}), formed ${zone.formedAt.toLocaleDateString()} on a ` +
    `+${zone.impulseMovePct.toFixed(1)}% impulsive departure (${zone.volumeExpansionRatio.toFixed(1)}x average volume). ` +
    `This is a price-structure inference from candle data, not confirmation of institutional order flow.`
  );
}

/**
 * Deterministic demand-zone detection from real OHLCV candles. `timeframe`
 * defaults to the interval stamped on the candles themselves (every
 * candle from lib/domain/candles.ts already carries one) — only pass it
 * explicitly when scoring a synthetic/aggregated series.
 */
export function identifyDemandZones(candles: Candle[], timeframe?: Interval): DemandZone[] {
  const asc = ascendingByTime(candles);
  if (asc.length < MIN_CANDLES) return [];
  const resolvedTimeframe = timeframe ?? asc[0].interval;

  const latestClose = asc[asc.length - 1].close;
  const zones: DemandZone[] = [];

  for (let i = PIVOT_WINDOW; i < asc.length - PIVOT_WINDOW; i++) {
    if (!isSwingLow(asc, i, PIVOT_WINDOW)) continue;

    const clusterStart = Math.max(0, i - 1);
    const cluster = asc.slice(clusterStart, i + 1);
    const zoneLow = Math.min(...cluster.map((c) => c.low));
    const zoneHigh = Math.max(...cluster.map((c) => Math.max(c.open, c.close)));
    if (zoneHigh <= zoneLow) continue;

    const forwardEnd = Math.min(asc.length, i + 1 + IMPULSE_LOOKFORWARD);
    const forward = asc.slice(i + 1, forwardEnd);
    if (forward.length === 0) continue;

    const forwardHigh = Math.max(...forward.map((c) => c.high));
    const impulseMovePct = zoneLow > 0 ? ((forwardHigh - zoneLow) / zoneLow) * 100 : 0;
    if (impulseMovePct < IMPULSE_THRESHOLD_PCT) continue;

    const peakIdx = forward.findIndex((c) => c.high === forwardHigh);
    const departureLeg = forward.slice(0, peakIdx + 1);
    const baseVolume = average(cluster.map((c) => c.volume)) || 1;
    const departureVolume = average(departureLeg.map((c) => c.volume));
    const volumeExpansionRatio = departureVolume / baseVolume;

    const { reactions, mitigated } = countPriorReactions(asc, i + 1 + departureLeg.length, zoneLow, zoneHigh);
    if (mitigated) continue; // no longer an active zone — never surfaced as current

    const zoneMid = (zoneLow + zoneHigh) / 2;
    const distanceFromPricePct = zoneMid > 0 ? ((latestClose - zoneMid) / zoneMid) * 100 : 0;
    const recentlyRetested = latestClose >= zoneLow && ((latestClose - zoneLow) / zoneLow) * 100 <= RETEST_BAND_PCT;

    const qualityScore = computeQualityScore({
      impulseMovePct,
      volumeExpansionRatio,
      priorReactionCount: reactions,
      ageInCandles: asc.length - 1 - i,
      totalCandles: asc.length,
    });

    const zoneWithoutDescription: Omit<DemandZone, 'description'> = {
      priceLevel: zoneLow,
      priceHigh: zoneHigh,
      formedAt: asc[i].timestamp,
      timeframe: resolvedTimeframe,
      impulseMovePct,
      volumeExpansionRatio,
      priorReactionCount: reactions,
      mitigated: false,
      recentlyRetested,
      distanceFromPricePct,
      qualityScore,
    };

    zones.push({ ...zoneWithoutDescription, description: describeZone(zoneWithoutDescription) });
  }

  return zones.sort((a, b) => b.qualityScore - a.qualityScore || b.formedAt.getTime() - a.formedAt.getTime()).slice(0, MAX_ZONES);
}
