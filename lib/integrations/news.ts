import type { NewsProvider, NewsArticle, NewsQueryContext, SectorTopic } from './types';
import { computeSentiment, computeMateriality, computeDedupeKey } from './newsScoring';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

/**
 * Finnhub has no per-sector "topic" news category on its free tier (only
 * general/forex/crypto/merger). As a defensible, transparent proxy for
 * broad sector coverage, sector news is sourced from a representative
 * sector ETF's company-news feed — e.g. semiconductor news via SMH's own
 * coverage. This is documented here rather than hidden: it's real news
 * about real companies in that sector, just scoped via an ETF ticker
 * instead of a topic filter Finnhub doesn't offer for free.
 */
const SECTOR_PROXY_TICKER: Record<Exclude<SectorTopic, 'macro'>, string> = {
  ai: 'AIQ',
  semiconductors: 'SMH',
  defense: 'ITA',
  aerospace: 'ITA',
  robotics: 'BOTZ',
  data_centers: 'SRVR',
  energy: 'XLE',
  cybersecurity: 'CIBR',
};

interface FinnhubRawArticle {
  category?: string;
  datetime: number; // unix seconds
  headline: string;
  id?: number;
  related?: string; // comma-separated tickers
  source: string;
  summary?: string;
  url?: string;
}

function mapArticle(
  raw: FinnhubRawArticle,
  opts: { queriedSymbol?: string; heldSymbols: string[]; sinceHours: number }
): NewsArticle | null {
  if (!raw.headline || !raw.datetime) return null;

  const publishedAt = new Date(raw.datetime * 1000);
  const ageHours = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
  if (ageHours > opts.sinceHours || ageHours < 0) return null;

  const relatedTickers = (raw.related ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const tickers = Array.from(new Set([opts.queriedSymbol, ...relatedTickers].filter((t): t is string => Boolean(t))));

  const mentionsHeldSymbol = tickers.some((t) => opts.heldSymbols.includes(t));
  const queriedSymbolIsHeld = Boolean(opts.queriedSymbol && opts.heldSymbols.includes(opts.queriedSymbol));

  let relevanceScore = 20; // baseline: general market news
  if (queriedSymbolIsHeld) relevanceScore = 90; // direct company news for a symbol we hold
  else if (mentionsHeldSymbol) relevanceScore = 65; // sector/general story naming a held symbol
  else if (opts.queriedSymbol) relevanceScore = 45; // sector-proxy story, no direct holding mention

  const text = `${raw.headline} ${raw.summary ?? ''}`;
  const sentiment = computeSentiment(text);
  const { materiality, materialityLevel } = computeMateriality(text, relevanceScore);

  return {
    symbol: opts.queriedSymbol ?? tickers[0],
    tickers,
    headline: raw.headline,
    summary: raw.summary || undefined,
    source: raw.source || 'Finnhub',
    url: raw.url || undefined,
    publishedAt,
    materiality,
    materialityLevel,
    relevanceScore,
    sentiment,
    quality: 'delayed',
    dedupeKey: computeDedupeKey(raw.headline, raw.url, publishedAt),
  };
}

/**
 * REAL implementation backed by Finnhub (https://finnhub.io). Chosen over
 * Marketaux (native per-entity sentiment, but only ~100 req/day free —
 * too tight for per-holding + market + 8 sector-proxy queries on a
 * recurring schedule) for its much more generous free tier (60 req/min).
 * Sentiment/materiality are computed deterministically (see
 * newsScoring.ts) since the free tier doesn't reliably expose per-article
 * sentiment.
 */
class FinnhubNewsProvider implements NewsProvider {
  constructor(private readonly apiKey: string) {}

  private async request(path: string, params: Record<string, string>): Promise<FinnhubRawArticle[]> {
    const url = new URL(`${FINNHUB_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('token', this.apiKey);

    const res = await fetch(url.toString(), { next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`Finnhub error at ${path}: HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data as FinnhubRawArticle[];
  }

  private async companyNews(symbol: string, sinceHours: number): Promise<FinnhubRawArticle[]> {
    const to = new Date();
    const from = new Date(to.getTime() - sinceHours * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return this.request('/company-news', { symbol, from: fmt(from), to: fmt(to) });
  }

  async getNewsForSymbol(symbol: string, context: NewsQueryContext, sinceHours = 24): Promise<NewsArticle[]> {
    const raw = await this.companyNews(symbol, sinceHours);
    return raw
      .map((r) => mapArticle(r, { queriedSymbol: symbol, heldSymbols: context.heldSymbols, sinceHours }))
      .filter((a): a is NewsArticle => a !== null && a.relevanceScore >= 20);
  }

  async getMarketNews(context: NewsQueryContext, sinceHours = 24): Promise<NewsArticle[]> {
    const raw = await this.request('/news', { category: 'general' });
    return raw
      .map((r) => mapArticle(r, { heldSymbols: context.heldSymbols, sinceHours }))
      .filter((a): a is NewsArticle => a !== null && a.relevanceScore >= 20);
  }

  async getSectorNews(topic: SectorTopic, context: NewsQueryContext, sinceHours = 24): Promise<NewsArticle[]> {
    if (topic === 'macro') return this.getMarketNews(context, sinceHours);

    const proxySymbol = SECTOR_PROXY_TICKER[topic];
    const raw = await this.companyNews(proxySymbol, sinceHours);
    return raw
      .map((r) => mapArticle(r, { queriedSymbol: proxySymbol, heldSymbols: context.heldSymbols, sinceHours }))
      .filter((a): a is NewsArticle => a !== null && a.relevanceScore >= 20);
  }
}

/**
 * MOCK implementation — returns no articles rather than fabricated
 * headlines, since invented news is far more dangerous than an empty feed.
 */
class MockNewsProvider implements NewsProvider {
  async getNewsForSymbol(): Promise<NewsArticle[]> {
    return [];
  }

  async getMarketNews(): Promise<NewsArticle[]> {
    return [];
  }

  async getSectorNews(): Promise<NewsArticle[]> {
    return [];
  }
}

/** Per-call fallback to mock (empty feed) if the real provider errors — a
 * rate limit or network failure degrades to "no news this run," never a
 * crash and never fabricated content. */
class FallbackNewsProvider implements NewsProvider {
  constructor(
    private readonly real: NewsProvider,
    private readonly mock: NewsProvider
  ) {}

  private async attempt(label: string, fn: () => Promise<NewsArticle[]>): Promise<NewsArticle[]> {
    try {
      return await fn();
    } catch (err) {
      console.error(`News provider call failed (${label}); returning empty feed:`, err);
      return [];
    }
  }

  getNewsForSymbol(symbol: string, context: NewsQueryContext, sinceHours?: number) {
    return this.attempt(`getNewsForSymbol(${symbol})`, () => this.real.getNewsForSymbol(symbol, context, sinceHours));
  }
  getMarketNews(context: NewsQueryContext, sinceHours?: number) {
    return this.attempt('getMarketNews', () => this.real.getMarketNews(context, sinceHours));
  }
  getSectorNews(topic: SectorTopic, context: NewsQueryContext, sinceHours?: number) {
    return this.attempt(`getSectorNews(${topic})`, () => this.real.getSectorNews(topic, context, sinceHours));
  }
}

const mockNewsProvider = new MockNewsProvider();

export const newsProvider: NewsProvider = process.env.NEWS_API_KEY
  ? new FallbackNewsProvider(new FinnhubNewsProvider(process.env.NEWS_API_KEY), mockNewsProvider)
  : mockNewsProvider;

export const NEWS_SECTOR_TOPICS: SectorTopic[] = [
  'ai',
  'semiconductors',
  'defense',
  'aerospace',
  'robotics',
  'data_centers',
  'energy',
  'cybersecurity',
  'macro',
];

/** Maps a holding's free-text sector string (from Holding.sector) to the
 * closest sector-news topic, if any — used so the monitor job only fetches
 * sector coverage actually relevant to what's held. */
export function sectorTopicForHoldingSector(sector: string | null): SectorTopic | null {
  if (!sector) return null;
  const s = sector.toLowerCase();
  if (s.includes('semiconductor')) return 'semiconductors';
  if (s.includes('defense')) return 'defense';
  if (s.includes('aerospace')) return 'aerospace';
  if (s.includes('robot')) return 'robotics';
  if (s.includes('data center') || s.includes('datacenter')) return 'data_centers';
  if (s.includes('energy')) return 'energy';
  if (s.includes('cyber')) return 'cybersecurity';
  if (s.includes('ai') || s.includes('artificial intelligence') || s.includes('software')) return 'ai';
  return null;
}
