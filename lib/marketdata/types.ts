import { z } from 'zod';

/**
 * The canonical timeframe model for the whole app — charts, technical
 * evidence, demand/supply, liquidity, monitoring, alerts, and Atlas Chat
 * all key off this one list. Adding a new interval later (e.g. '15m' or
 * '1M') means adding one entry to each table below, never touching the
 * charting or aggregation code itself.
 */
export const INTERVALS = ['30m', '1h', '4h', '1D', '1W'] as const;
export type Interval = (typeof INTERVALS)[number];

export function isInterval(value: string): value is Interval {
  return (INTERVALS as readonly string[]).includes(value);
}

export const INTERVAL_LABEL: Record<Interval, string> = {
  '30m': '30-minute',
  '1h': '1-hour',
  '4h': '4-hour',
  '1D': '1-day',
  '1W': '1-week',
};

/** Twelve Data's own interval query parameter for each canonical interval —
 * every one of these is directly supported by /time_series, so native
 * fetch is always attempted before any client-side aggregation. */
export const PROVIDER_INTERVAL: Record<Interval, string> = {
  '30m': '30min',
  '1h': '1h',
  '4h': '4h',
  '1D': '1day',
  '1W': '1week',
};

/** Nominal minutes per interval — used for lookback/aggregation math. 1D
 * and 1W are session-based (a trading day isn't 1440 minutes of data), so
 * these are only ever used as rough multipliers, never to compute exact
 * candle boundaries — see lib/marketdata/sessions.ts for that. */
export const INTERVAL_MINUTES: Record<Interval, number> = {
  '30m': 30,
  '1h': 60,
  '4h': 240,
  '1D': 60 * 24,
  '1W': 60 * 24 * 7,
};

/** Default candle count the historical service loads before the user asks
 * for more — enough for the technical/demand-zone/liquidity models below
 * to have sufficient history, without over-fetching on every page view. */
export const DEFAULT_LOOKBACK: Record<Interval, number> = {
  '30m': 300,
  '1h': 300,
  '4h': 260,
  '1D': 260,
  '1W': 156,
};

/** How trustworthy/current a piece of market data is. Never inferred as
 * 'live' just because a WebSocket *could* exist — this is always set
 * explicitly by whatever produced the data (provider response headers/
 * plan tier, cache age, or "no data source configured at all"). `mock` is
 * additive to the brief's list — this app already has an established,
 * deliberate mock-data-labeling convention (DataQuality in
 * lib/integrations/types.ts) precisely so mock placeholder numbers can
 * never be confused with real data; that convention is preserved here
 * rather than overloading `unavailable` (which means "no data at all",
 * not "fake data for local development"). */
export type FreshnessStatus = 'live' | 'delayed' | 'end_of_day' | 'cached' | 'stale' | 'unavailable' | 'mock';

export const FRESHNESS_LABEL: Record<FreshnessStatus, string> = {
  live: 'Live',
  delayed: 'Delayed',
  end_of_day: 'End of day',
  cached: 'Cached',
  stale: 'Stale',
  unavailable: 'Unavailable',
  mock: 'Mock data',
};

export type SessionType = 'regular' | 'pre_market' | 'after_hours' | 'closed';

export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  regular: 'Regular session',
  pre_market: 'Pre-market',
  after_hours: 'After-hours',
  closed: 'Market closed',
};

export interface SplitAdjustment {
  factor: number;
  effectiveDate: Date;
}

/**
 * The canonical OHLCV candle — provider-independent. Every field the brief
 * asks for is present; nothing here is provider-specific shape (that lives
 * only in lib/marketdata/normalize.ts's input types). `timestamp` is
 * always the candle's OPEN time in UTC; `exchangeTimezone` records which
 * exchange calendar produced the candle without baking a timezone offset
 * into the stored instant.
 */
export interface Candle {
  symbol: string;
  interval: Interval;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  exchangeTimezone: string;
  sessionType: SessionType;
  provider: string;
  receivedAt: Date;
  freshness: FreshnessStatus;
  adjusted: boolean;
  splitAdjustment?: SplitAdjustment | null;
  /** True only for the single most-recent, still-forming candle for this
   * symbol+interval — mutable, and never written to the cache as a
   * completed row (see lib/domain/candles.ts). */
  isActive: boolean;
}

/** Loose validation for a raw provider candle prior to normalization —
 * deliberately permissive on number-vs-string (providers vary) but strict
 * on presence, so a malformed row is rejected at the boundary rather than
 * silently propagating a NaN into a chart or technical computation. */
export const RawCandleSchema = z.object({
  datetime: z.string().min(1),
  open: z.union([z.string(), z.number()]),
  high: z.union([z.string(), z.number()]),
  low: z.union([z.string(), z.number()]),
  close: z.union([z.string(), z.number()]),
  volume: z.union([z.string(), z.number()]).optional(),
});
export type RawCandle = z.infer<typeof RawCandleSchema>;

export interface CandleRequest {
  symbol: string;
  interval: Interval;
  limit?: number;
  from?: Date;
  to?: Date;
  /** Include pre-market/after-hours candles when the provider/cache has
   * them. Defaults to false (regular trading hours only) everywhere. */
  extendedHours?: boolean;
}

export interface CandleResponse {
  symbol: string;
  interval: Interval;
  candles: Candle[];
  /** Worst-case/most-representative freshness across the response — a
   * caller never has to inspect every candle to know how to label the
   * chart. */
  freshness: FreshnessStatus;
  asOf: Date;
  source: 'cache' | 'provider' | 'mixed' | 'unavailable';
  note?: string;
}

/** Adapts canonical Candle[] into the older close+volume-only
 * HistoricalPricePoint[] shape (lib/integrations/types.ts) — lets
 * lib/strategy/technical.ts's close-price math (SMA/momentum/relative
 * strength, none of which need intrabar range) keep working unchanged
 * against real OHLCV candles rather than forcing a second parallel fetch
 * of the old daily-close-only shape. */
export function candlesToHistoricalPricePoints(candles: Candle[]): { date: Date; close: number; volume: number }[] {
  return candles.map((c) => ({ date: c.timestamp, close: c.close, volume: c.volume }));
}

export interface LiveQuote {
  symbol: string;
  price: number;
  changePercent: number;
  volume: number;
  asOf: Date;
  freshness: FreshnessStatus;
  provider: string;
}
