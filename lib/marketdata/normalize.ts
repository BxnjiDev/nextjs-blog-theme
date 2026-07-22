import { RawCandleSchema, type RawCandle, type Candle, type Interval, type FreshnessStatus } from './types';
import { classifySessionType, EXCHANGE_TIMEZONE } from './sessions';

export interface NormalizeCandleOptions {
  symbol: string;
  interval: Interval;
  provider: string;
  freshness: FreshnessStatus;
  adjusted?: boolean;
}

function toNumber(v: string | number): number {
  return typeof v === 'number' ? v : parseFloat(v);
}

/**
 * Validates and normalizes one raw provider row into a canonical Candle.
 * Never throws — a structurally invalid row (missing fields, non-numeric
 * OHLC, an impossible high<low, an unparseable datetime) returns null so
 * one bad row from a provider can't crash a whole fetch or silently
 * become a NaN in a chart or technical computation; callers filter nulls.
 */
export function normalizeCandle(raw: unknown, options: NormalizeCandleOptions): Candle | null {
  const parsed = RawCandleSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r: RawCandle = parsed.data;

  const timestamp = new Date(r.datetime);
  if (Number.isNaN(timestamp.getTime())) return null;

  const open = toNumber(r.open);
  const high = toNumber(r.high);
  const low = toNumber(r.low);
  const close = toNumber(r.close);
  const volume = r.volume !== undefined ? toNumber(r.volume) : 0;

  if (![open, high, low, close, volume].every((n) => Number.isFinite(n))) return null;
  if (high < low) return null;

  return {
    symbol: options.symbol.toUpperCase(),
    interval: options.interval,
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    exchangeTimezone: EXCHANGE_TIMEZONE,
    sessionType: classifySessionType(timestamp),
    provider: options.provider,
    receivedAt: new Date(),
    freshness: options.freshness,
    adjusted: options.adjusted ?? false,
    splitAdjustment: null,
    isActive: false,
  };
}

/**
 * Normalizes a full raw response into canonical, deduplicated, ascending-
 * by-time Candle[]. Deduplicates by timestamp — when a provider (or a
 * corrected re-fetch) returns two rows for the same candle, the later row
 * in `rawRows` wins, so a caller can pass "old batch then new batch" and
 * get the corrected value. Handles out-of-order input by sorting at the
 * end regardless of input order.
 */
export function normalizeCandles(rawRows: unknown[], options: NormalizeCandleOptions): Candle[] {
  const byTimestamp = new Map<number, Candle>();
  for (const raw of rawRows) {
    const candle = normalizeCandle(raw, options);
    if (candle) byTimestamp.set(candle.timestamp.getTime(), candle);
  }
  return Array.from(byTimestamp.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
