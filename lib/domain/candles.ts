import { prisma } from '@/lib/prisma';
import type { CandleInterval, CandleFreshness, MarketSessionType, PriceCandle } from '@prisma/client';
import { marketDataProvider } from '@/lib/integrations';
import type { Candle, CandleResponse, FreshnessStatus, Interval, SessionType } from '@/lib/marketdata/types';
import { DEFAULT_LOOKBACK, INTERVAL_MINUTES } from '@/lib/marketdata/types';
import { classifySessionType, getExchangeLocalParts } from '@/lib/marketdata/sessions';

const INTERVAL_TO_DB: Record<Interval, CandleInterval> = {
  '30m': 'MIN30',
  '1h': 'HOUR1',
  '4h': 'HOUR4',
  '1D': 'DAY1',
  '1W': 'WEEK1',
};
const DB_TO_INTERVAL: Record<CandleInterval, Interval> = {
  MIN30: '30m',
  HOUR1: '1h',
  HOUR4: '4h',
  DAY1: '1D',
  WEEK1: '1W',
};

const SESSION_TO_DB: Record<SessionType, MarketSessionType> = {
  regular: 'REGULAR',
  pre_market: 'PRE_MARKET',
  after_hours: 'AFTER_HOURS',
  closed: 'CLOSED',
};
const DB_TO_SESSION: Record<MarketSessionType, SessionType> = {
  REGULAR: 'regular',
  PRE_MARKET: 'pre_market',
  AFTER_HOURS: 'after_hours',
  CLOSED: 'closed',
};

/** `mock` has no DB counterpart — mock candles are never persisted (see
 * persistCandles below), so this map only needs to round-trip real
 * freshness values. */
const FRESHNESS_TO_DB: Partial<Record<FreshnessStatus, CandleFreshness>> = {
  live: 'LIVE',
  delayed: 'DELAYED',
  end_of_day: 'END_OF_DAY',
  cached: 'CACHED',
  stale: 'STALE',
  unavailable: 'UNAVAILABLE',
};
const DB_TO_FRESHNESS: Record<CandleFreshness, FreshnessStatus> = {
  LIVE: 'live',
  DELAYED: 'delayed',
  END_OF_DAY: 'end_of_day',
  CACHED: 'cached',
  STALE: 'stale',
  UNAVAILABLE: 'unavailable',
};

function dbRowToCandle(row: PriceCandle): Candle {
  return {
    symbol: row.symbol,
    interval: DB_TO_INTERVAL[row.interval],
    timestamp: row.timestamp,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    exchangeTimezone: 'America/New_York',
    sessionType: DB_TO_SESSION[row.sessionType],
    provider: row.provider,
    receivedAt: row.receivedAt,
    freshness: DB_TO_FRESHNESS[row.freshness],
    adjusted: row.adjusted,
    splitAdjustment: row.splitAdjustment as Candle['splitAdjustment'],
    isActive: row.isActive,
  };
}

function bucketEndMs(interval: Interval): number {
  return INTERVAL_MINUTES[interval] * 60 * 1000;
}

/**
 * A candle is "still forming" only when both (a) the nominal bucket window
 * for its interval hasn't elapsed and (b) the market is actually in a
 * session right now. Condition (b) alone correctly handles the 4h
 * aggregator's shorter final-of-day bucket (nominal window would
 * over-run past session close, but the session check independently goes
 * false at close) without this function needing to know about session
 * clipping itself.
 */
function isStillForming(candle: Candle, now: Date): boolean {
  if (candle.interval === '1D' || candle.interval === '1W') {
    const nowParts = getExchangeLocalParts(now);
    const cParts = getExchangeLocalParts(candle.timestamp);
    const sameCalendarBucket =
      candle.interval === '1D'
        ? nowParts.year === cParts.year && nowParts.month === cParts.month && nowParts.day === cParts.day
        : now.getTime() - candle.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000 && now.getTime() >= candle.timestamp.getTime();
    return sameCalendarBucket && classifySessionType(now) !== 'closed';
  }
  const withinWindow = now.getTime() >= candle.timestamp.getTime() && now.getTime() < candle.timestamp.getTime() + bucketEndMs(candle.interval);
  return withinWindow && classifySessionType(now) === 'regular';
}

function markActiveCandle(candles: Candle[], now: Date = new Date()): Candle[] {
  if (candles.length === 0) return candles;
  const lastIdx = candles.length - 1;
  const forming = isStillForming(candles[lastIdx], now);
  return candles.map((c, i) => (i === lastIdx ? { ...c, isActive: forming } : { ...c, isActive: false }));
}

function mergeCandlesByTimestamp(base: Candle[], overrides: Candle[]): Candle[] {
  const map = new Map<number, Candle>();
  for (const c of base) map.set(c.timestamp.getTime(), c);
  for (const c of overrides) map.set(c.timestamp.getTime(), c);
  return Array.from(map.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

const FRESHNESS_RANK: Record<FreshnessStatus, number> = { live: 0, delayed: 1, end_of_day: 2, cached: 3, stale: 4, mock: 5, unavailable: 6 };
function worstFreshness(candles: Candle[]): FreshnessStatus {
  if (candles.length === 0) return 'unavailable';
  return candles.reduce<FreshnessStatus>((worst, c) => (FRESHNESS_RANK[c.freshness] > FRESHNESS_RANK[worst] ? c.freshness : worst), candles[0].freshness);
}

/**
 * Writes completed + active candles to the shared PriceCandle cache.
 * Mock candles are never persisted (freshness 'mock' has no DB
 * counterpart, and there is nothing real worth caching) — every call site
 * that reaches here already only calls it after a genuine provider fetch.
 * Upserting is safe and cheap: this only runs when the cache was
 * insufficient, never on every read, so it doesn't turn into a
 * request-per-render write amplification problem.
 */
async function persistCandles(candles: Candle[]): Promise<void> {
  const toStore = candles.filter((c) => c.freshness !== 'mock');
  if (toStore.length === 0) return;

  await Promise.all(
    toStore.map((c) => {
      const freshnessDb = c.isActive ? 'CACHED' : (FRESHNESS_TO_DB[c.freshness] ?? 'CACHED');
      const data = {
        symbol: c.symbol,
        interval: INTERVAL_TO_DB[c.interval],
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: BigInt(Math.max(0, Math.round(c.volume))),
        sessionType: SESSION_TO_DB[c.sessionType],
        provider: c.provider,
        freshness: freshnessDb as CandleFreshness,
        adjusted: c.adjusted,
        splitAdjustment: c.splitAdjustment ? JSON.parse(JSON.stringify(c.splitAdjustment)) : undefined,
        isActive: c.isActive,
      };
      return prisma.priceCandle
        .upsert({
          where: { symbol_interval_timestamp: { symbol: c.symbol, interval: INTERVAL_TO_DB[c.interval], timestamp: c.timestamp } },
          create: data,
          update: data,
        })
        .catch((err) => {
          console.error(`Failed to cache candle ${c.symbol} ${c.interval} ${c.timestamp.toISOString()}:`, err);
        });
    })
  );
}

/**
 * The one seam every surface (charts, technical evidence, demand/supply,
 * liquidity, monitoring, alerts, Atlas Chat) reads OHLCV history through.
 * Reads completed candles from the shared cache first — never re-requests
 * identical historical data from the provider — and only re-fetches from
 * the provider when the cache doesn't have enough history yet or the
 * caller needs the current in-progress candle refreshed. The in-progress
 * candle is always treated as mutable: it's refetched and overwritten in
 * place, never trusted from a stale cache read.
 */
export async function getCandlesForSymbol(rawSymbol: string, interval: Interval, options?: { limit?: number }): Promise<CandleResponse> {
  const symbol = rawSymbol.toUpperCase();
  const limit = options?.limit ?? DEFAULT_LOOKBACK[interval];

  const cachedRows = await prisma.priceCandle.findMany({
    where: { symbol, interval: INTERVAL_TO_DB[interval] },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
  const cached = cachedRows.map(dbRowToCandle).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (cached.length >= limit) {
    // Enough history cached — only the current (possibly still-forming)
    // candle needs a live check, so this is a small, cheap fetch rather
    // than re-requesting the whole range.
    try {
      const latest = await marketDataProvider.getCandles(symbol, interval, { limit: 3 });
      const merged = markActiveCandle(mergeCandlesByTimestamp(cached, latest)).slice(-limit);
      await persistCandles(merged.filter((c) => !cached.some((existing) => existing.timestamp.getTime() === c.timestamp.getTime() && existing.close === c.close)));
      return { symbol, interval, candles: merged, freshness: worstFreshness(merged), asOf: new Date(), source: 'mixed' };
    } catch (err) {
      console.error(`Live refresh failed for ${symbol} ${interval}; serving cached history:`, err);
      const stale = cached.map((c) => ({ ...c, freshness: 'stale' as FreshnessStatus }));
      return { symbol, interval, candles: stale, freshness: 'stale', asOf: new Date(), source: 'cache', note: 'Provider unavailable — showing last cached history.' };
    }
  }

  try {
    const fetched = markActiveCandle(await marketDataProvider.getCandles(symbol, interval, { limit }));
    if (fetched.length === 0) {
      if (cached.length > 0) return { symbol, interval, candles: cached, freshness: worstFreshness(cached), asOf: new Date(), source: 'cache' };
      return { symbol, interval, candles: [], freshness: 'unavailable', asOf: new Date(), source: 'unavailable', note: 'No candle data available for this symbol and interval.' };
    }
    await persistCandles(fetched);
    return { symbol, interval, candles: fetched, freshness: worstFreshness(fetched), asOf: new Date(), source: 'provider' };
  } catch (err) {
    if (cached.length > 0) {
      return {
        symbol,
        interval,
        candles: cached,
        freshness: 'stale',
        asOf: new Date(),
        source: 'cache',
        note: 'Provider unavailable — showing last cached history.',
      };
    }
    return {
      symbol,
      interval,
      candles: [],
      freshness: 'unavailable',
      asOf: new Date(),
      source: 'unavailable',
      note: err instanceof Error ? err.message : 'Market data provider unavailable.',
    };
  }
}
