import type { Candle, Interval, FreshnessStatus } from './types';
import { getRegularSessionBoundsUtc, getExchangeLocalParts } from './sessions';

const FRESHNESS_RANK: Record<FreshnessStatus, number> = {
  live: 0,
  delayed: 1,
  end_of_day: 2,
  cached: 3,
  stale: 4,
  mock: 5,
  unavailable: 6,
};

/** The least-fresh reading among the source candles — an aggregated
 * candle can never claim to be fresher than the staleness of the data it
 * was built from. */
function worstFreshness(candles: Candle[]): FreshnessStatus {
  return candles.reduce<FreshnessStatus>((worst, c) => (FRESHNESS_RANK[c.freshness] > FRESHNESS_RANK[worst] ? c.freshness : worst), candles[0].freshness);
}

function buildAggregatedCandle(sourceCandles: Candle[], interval: Interval, timestamp: Date): Candle {
  const sorted = [...sourceCandles].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return {
    symbol: first.symbol,
    interval,
    timestamp,
    open: first.open,
    high: Math.max(...sorted.map((c) => c.high)),
    low: Math.min(...sorted.map((c) => c.low)),
    close: last.close,
    volume: sorted.reduce((sum, c) => sum + c.volume, 0),
    exchangeTimezone: first.exchangeTimezone,
    sessionType: 'regular',
    provider: sorted.every((c) => c.provider === first.provider) ? first.provider : 'aggregated',
    receivedAt: new Date(),
    freshness: worstFreshness(sorted),
    adjusted: sorted.every((c) => c.adjusted),
    splitAdjustment: null,
    isActive: last.isActive,
  };
}

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${month}-${day}`;
}

/**
 * Session-anchored 4h aggregation from 1h (or finer) source candles — never
 * blind clock-hour grouping. Buckets start at the regular session open
 * (9:30 ET) and step forward in 4h increments within that trading day
 * only; the final bucket is clipped at session close, so a standard 6.5h
 * session yields two buckets (9:30-13:30 and 13:30-16:00, the second
 * intentionally shorter) rather than a bucket bleeding into the next day.
 * Source candles outside any regular session (extended hours, or candles
 * on a non-trading day) are dropped for this interval — 4h analysis in
 * this app is regular-session only.
 */
export function aggregateTo4h(sourceCandles: Candle[]): Candle[] {
  const byDay = new Map<string, Candle[]>();
  for (const c of sourceCandles) {
    const parts = getExchangeLocalParts(c.timestamp);
    const key = dayKey(parts.year, parts.month, parts.day);
    const list = byDay.get(key);
    if (list) list.push(c);
    else byDay.set(key, [c]);
  }

  const result: Candle[] = [];
  const bucketMs = 4 * 60 * 60 * 1000;

  for (const [key, dayCandles] of byDay) {
    const [y, m, d] = key.split('-').map(Number);
    const bounds = getRegularSessionBoundsUtc(y, m, d);
    if (!bounds) continue;

    const sorted = [...dayCandles].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const sessionEnd = bounds.close.getTime();
    let bucketStart = bounds.open.getTime();
    let idx = 0;

    while (bucketStart < sessionEnd) {
      const bucketEnd = Math.min(bucketStart + bucketMs, sessionEnd);
      const bucketCandles: Candle[] = [];
      while (idx < sorted.length && sorted[idx].timestamp.getTime() >= bucketStart && sorted[idx].timestamp.getTime() < bucketEnd) {
        bucketCandles.push(sorted[idx]);
        idx++;
      }
      if (bucketCandles.length > 0) result.push(buildAggregatedCandle(bucketCandles, '4h', new Date(bucketStart)));
      bucketStart = bucketEnd;
    }
  }

  return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function mondayOfWeek(year: number, month: number, day: number): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + diff);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * Weekly aggregation from 1D source candles — grouped by ISO week (Monday
 * start, exchange-local calendar), stamped at the week's first available
 * trading session rather than a synthetic Monday-at-midnight timestamp
 * (which could be a holiday with no real data).
 */
export function aggregateToWeekly(sourceCandles: Candle[]): Candle[] {
  const byWeek = new Map<string, Candle[]>();
  for (const c of sourceCandles) {
    const parts = getExchangeLocalParts(c.timestamp);
    const monday = mondayOfWeek(parts.year, parts.month, parts.day);
    const key = dayKey(monday.year, monday.month, monday.day);
    const list = byWeek.get(key);
    if (list) list.push(c);
    else byWeek.set(key, [c]);
  }

  const result: Candle[] = [];
  for (const weekCandles of byWeek.values()) {
    const sorted = [...weekCandles].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    result.push(buildAggregatedCandle(sorted, '1W', sorted[0].timestamp));
  }

  return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

/**
 * Dispatches to the right deterministic aggregator for a target interval
 * this app builds via aggregation rather than fetching natively (4h from
 * 1h, 1W from 1D). Any other target is a caller error — 30m/1h/1D are
 * always fetched directly from the provider (see lib/integrations/
 * marketData.ts's getCandles), never aggregated.
 */
export function aggregateCandles(sourceCandles: Candle[], targetInterval: Interval): Candle[] {
  if (targetInterval === '4h') return aggregateTo4h(sourceCandles);
  if (targetInterval === '1W') return aggregateToWeekly(sourceCandles);
  throw new Error(`aggregateCandles: unsupported target interval "${targetInterval}" — only 4h (from 1h) and 1W (from 1D) aggregation are implemented here; other intervals must be fetched natively from the provider.`);
}
