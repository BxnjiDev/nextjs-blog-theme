import type {
  MarketDataProvider,
  Quote,
  Technicals,
  HistoricalPricePoint,
  CompanyFundamentals,
} from './types';
import { timedProviderCall } from './retry';

const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

function hashSymbol(symbol: string): number {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * MOCK implementation. Returns deterministic placeholder numbers so the UI
 * is exercisable, but these are NOT real prices — do not use for anything
 * beyond local development of this app. Every value is tagged
 * `quality: 'mock'` so the dashboard can never confuse it for real data.
 */
class MockMarketDataProvider implements MarketDataProvider {
  async getQuote(symbol: string): Promise<Quote> {
    const seed = hashSymbol(symbol);
    return {
      symbol,
      price: 50 + (seed % 400),
      changePercent: (((seed % 21) - 10) / 10) * 2,
      volume: 1_000_000 + seed * 1000,
      asOf: new Date(),
      quality: 'mock',
    };
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    return Promise.all(symbols.map((s) => this.getQuote(s)));
  }

  async getTechnicals(symbol: string): Promise<Technicals> {
    const seed = hashSymbol(symbol);
    const trend = seed % 3 === 0 ? 'UP' : seed % 3 === 1 ? 'DOWN' : 'SIDEWAYS';
    return {
      symbol,
      trend,
      notes: 'Mock technicals — not derived from real price history.',
      asOf: new Date(),
      quality: 'mock',
    };
  }

  async getHistoricalDaily(symbol: string, days = 30): Promise<HistoricalPricePoint[]> {
    const seed = hashSymbol(symbol);
    const base = 50 + (seed % 400);
    const points: HistoricalPricePoint[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const wobble = Math.sin((seed + i) / 3) * (base * 0.03);
      points.push({ date, close: Math.max(1, base + wobble), volume: 1_000_000 + ((seed + i) % 500_000) });
    }
    return points;
  }

  async getFundamentals(symbol: string): Promise<CompanyFundamentals | null> {
    const seed = hashSymbol(symbol);
    return {
      symbol,
      name: null,
      sector: null,
      industry: null,
      marketCap: (50 + (seed % 400)) * 1_000_000_000,
      peRatio: 10 + (seed % 40),
      eps: 1 + (seed % 20) / 2,
      dividendYield: (seed % 3) / 100,
      description: 'Mock fundamentals — not real company data.',
      asOf: new Date(),
      quality: 'mock',
    };
  }

  async getSp500Level(): Promise<number> {
    return 5600;
  }

  async getSp500History(days = 30): Promise<HistoricalPricePoint[]> {
    return this.getHistoricalDaily('SPY', days);
  }
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function mapQuote(d: Record<string, unknown>): Quote {
  return {
    symbol: String(d.symbol),
    price: parseFloat(String(d.close)),
    changePercent: parseFloat(String(d.percent_change ?? '0')),
    volume: Number(d.volume ?? 0),
    asOf: d.datetime ? new Date(String(d.datetime)) : new Date(),
    quality: 'delayed',
  };
}

/**
 * REAL implementation backed by Twelve Data (https://twelvedata.com) — one
 * vendor, one API key, covering quotes + historical daily prices +
 * fundamentals on its free tier (800 req/day, 8/min), which is why it was
 * chosen for this MVP over Alpha Vantage (free tier now ~25 req/day) and
 * Financial Modeling Prep (free tier is EOD-only, capped fundamentals).
 *
 * Quotes are labeled `quality: 'delayed'` rather than `'live'` — Twelve
 * Data's free tier is not guaranteed real-time, and understating freshness
 * is safer than overstating it.
 */
class TwelveDataProvider implements MarketDataProvider {
  constructor(private readonly apiKey: string) {}

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${TWELVE_DATA_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('apikey', this.apiKey);

    const res = await fetch(url.toString(), { next: { revalidate: 60 } });
    const data = await res.json();
    if (!res.ok || (data && typeof data === 'object' && data.status === 'error')) {
      throw new Error(`Twelve Data error at ${path}: ${data?.message ?? res.statusText}`);
    }
    return data as T;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const data = await this.request<Record<string, unknown>>('/quote', { symbol });
    return mapQuote(data);
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    if (symbols.length === 0) return [];
    if (symbols.length === 1) return [await this.getQuote(symbols[0])];

    const data = await this.request<Record<string, Record<string, unknown>>>('/quote', {
      symbol: symbols.join(','),
    });
    return symbols.filter((s) => data[s]).map((s) => mapQuote(data[s]));
  }

  async getHistoricalDaily(symbol: string, days = 30): Promise<HistoricalPricePoint[]> {
    const data = await this.request<{ values?: Array<Record<string, unknown>> }>('/time_series', {
      symbol,
      interval: '1day',
      outputsize: String(days),
    });
    const values = data.values ?? [];
    return values.map((v) => ({
      date: new Date(String(v.datetime)),
      close: parseFloat(String(v.close)),
      volume: Number(v.volume ?? 0),
    }));
  }

  async getTechnicals(symbol: string): Promise<Technicals> {
    const history = await this.getHistoricalDaily(symbol, 20);
    if (history.length < 2) {
      return {
        symbol,
        trend: 'SIDEWAYS',
        notes: 'Insufficient price history to assess a trend.',
        asOf: new Date(),
        quality: 'delayed',
      };
    }
    // Twelve Data time_series values are newest-first.
    const newest = history[0].close;
    const oldest = history[history.length - 1].close;
    const change = (newest - oldest) / oldest;
    const trend = change > 0.02 ? 'UP' : change < -0.02 ? 'DOWN' : 'SIDEWAYS';
    return {
      symbol,
      trend,
      notes: `${(change * 100).toFixed(1)}% over the last ${history.length} sessions.`,
      asOf: new Date(),
      quality: 'delayed',
    };
  }

  async getFundamentals(symbol: string): Promise<CompanyFundamentals | null> {
    try {
      const [profile, stats] = await Promise.all([
        this.request<Record<string, unknown>>('/profile', { symbol }).catch(() => null),
        this.request<{
          meta?: Record<string, unknown>;
          statistics?: Record<string, Record<string, unknown>>;
        }>('/statistics', { symbol }).catch(() => null),
      ]);
      if (!profile && !stats) return null;

      const valuations = stats?.statistics?.valuations_metrics ?? {};
      const dividends = stats?.statistics?.dividends_and_splits ?? {};

      return {
        symbol,
        name: (profile?.name as string) ?? (stats?.meta?.name as string) ?? null,
        sector: (profile?.sector as string) ?? null,
        industry: (profile?.industry as string) ?? null,
        marketCap: numberOrNull(valuations.market_capitalization),
        peRatio: numberOrNull(valuations.trailing_pe ?? valuations.pe_ratio),
        eps: numberOrNull((stats?.statistics?.financials as Record<string, unknown> | undefined)?.diluted_eps_ttm),
        dividendYield: numberOrNull(dividends.forward_annual_dividend_yield),
        description: (profile?.description as string) ?? null,
        asOf: new Date(),
        quality: 'delayed',
      };
    } catch (err) {
      console.error(`Twelve Data fundamentals failed for ${symbol}:`, err);
      return null;
    }
  }

  async getSp500Level(): Promise<number> {
    const quote = await this.getQuote('SPY');
    return quote.price;
  }

  async getSp500History(days = 30): Promise<HistoricalPricePoint[]> {
    return this.getHistoricalDaily('SPY', days);
  }
}

/**
 * Wraps a real provider with the mock as a per-call safety net: a missing
 * key means the mock is used from the start (see `marketDataProvider`
 * below), but a *configured* key that hits a rate limit, network error, or
 * unexpected response shape degrades gracefully to mock data for that one
 * call rather than crashing the page.
 */
class FallbackMarketDataProvider implements MarketDataProvider {
  constructor(
    private readonly real: MarketDataProvider,
    private readonly mock: MarketDataProvider
  ) {}

  /**
   * Retries the real provider (transient network/rate-limit errors),
   * logging exactly one ProviderCallLog row for the attempt (SUCCESS or
   * FAILURE). If every retry is exhausted, falls back to mock data and
   * logs a second row tagged FALLBACK — so the freshness dashboard can
   * distinguish "real data" from "we degraded to mock" for this call.
   */
  private async attempt<T>(operation: string, real: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await timedProviderCall('twelvedata', operation, real);
    } catch (err) {
      console.error(`Market data provider call failed (${operation}); falling back to mock data:`, err);
      return timedProviderCall('twelvedata', operation, fallback, undefined, 'FALLBACK');
    }
  }

  getQuote(symbol: string) {
    return this.attempt('getQuote', () => this.real.getQuote(symbol), () => this.mock.getQuote(symbol));
  }
  getQuotes(symbols: string[]) {
    return this.attempt('getQuotes', () => this.real.getQuotes(symbols), () => this.mock.getQuotes(symbols));
  }
  getTechnicals(symbol: string) {
    return this.attempt(
      'getTechnicals',
      () => this.real.getTechnicals(symbol),
      () => this.mock.getTechnicals(symbol)
    );
  }
  getHistoricalDaily(symbol: string, days?: number) {
    return this.attempt(
      'getHistoricalDaily',
      () => this.real.getHistoricalDaily(symbol, days),
      () => this.mock.getHistoricalDaily(symbol, days)
    );
  }
  getFundamentals(symbol: string) {
    return this.attempt(
      'getFundamentals',
      () => this.real.getFundamentals(symbol),
      () => this.mock.getFundamentals(symbol)
    );
  }
  getSp500Level() {
    return this.attempt('getSp500Level', () => this.real.getSp500Level(), () => this.mock.getSp500Level());
  }
  getSp500History(days?: number) {
    return this.attempt(
      'getSp500History',
      () => this.real.getSp500History(days),
      () => this.mock.getSp500History(days)
    );
  }
}

const mockMarketDataProvider = new MockMarketDataProvider();

export const marketDataProvider: MarketDataProvider = process.env.MARKET_DATA_API_KEY
  ? new FallbackMarketDataProvider(new TwelveDataProvider(process.env.MARKET_DATA_API_KEY), mockMarketDataProvider)
  : mockMarketDataProvider;
