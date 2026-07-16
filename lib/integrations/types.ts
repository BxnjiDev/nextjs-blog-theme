/**
 * Shared types for external data providers. Every provider has exactly one
 * mock implementation right now (clearly labeled) and is called only
 * through these interfaces, so swapping in a real vendor later is a
 * one-file change, not a rewrite of the pages that consume it.
 */

/** live = true real-time tick, delayed = real vendor data on a delay, mock = placeholder. */
export type DataQuality = 'live' | 'delayed' | 'mock';

export interface Quote {
  symbol: string;
  price: number;
  changePercent: number;
  volume: number;
  asOf: Date;
  quality: DataQuality;
}

export type Trend = 'UP' | 'DOWN' | 'SIDEWAYS';

export interface Technicals {
  symbol: string;
  trend: Trend;
  notes: string;
  asOf: Date;
  quality: DataQuality;
}

export interface HistoricalPricePoint {
  date: Date;
  close: number;
  volume: number;
}

export interface CompanyFundamentals {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  peRatio: number | null;
  eps: number | null;
  dividendYield: number | null;
  description: string | null;
  asOf: Date;
  quality: DataQuality;
}

export interface MarketDataProvider {
  getQuote(symbol: string): Promise<Quote>;
  getQuotes(symbols: string[]): Promise<Quote[]>;
  getTechnicals(symbol: string): Promise<Technicals>;
  getHistoricalDaily(symbol: string, days?: number): Promise<HistoricalPricePoint[]>;
  /** Returns null when fundamentals genuinely can't be determined — never a guess. */
  getFundamentals(symbol: string): Promise<CompanyFundamentals | null>;
  /** Latest S&P 500 level (tracked via the SPY ETF as a proxy). */
  getSp500Level(): Promise<number>;
  getSp500History(days?: number): Promise<HistoricalPricePoint[]>;
}

export type MaterialityLevel = 'critical' | 'high' | 'medium' | 'low';

/** Broad sector/topic categories the news layer covers beyond per-holding company news. */
export type SectorTopic =
  | 'ai'
  | 'semiconductors'
  | 'defense'
  | 'aerospace'
  | 'robotics'
  | 'data_centers'
  | 'energy'
  | 'cybersecurity'
  | 'macro';

export interface NewsArticle {
  /** Primary ticker this story is filed under, if any. */
  symbol?: string;
  /** Every ticker this story is associated with (a story can name several). */
  tickers: string[];
  headline: string;
  summary?: string;
  source: string;
  url?: string;
  publishedAt: Date;
  /** 1-10 fine-grained materiality score. */
  materiality: number;
  materialityLevel: MaterialityLevel;
  /** 0-100: how relevant this is to the CURRENT portfolio's actual exposure. */
  relevanceScore: number;
  /** -1 (very negative) to 1 (very positive) from a deterministic keyword
   * lexicon over the real fetched text — null when no lexicon term matched
   * (never a guessed/neutral-by-default number). */
  sentiment: number | null;
  quality: DataQuality;
  /** Stable key for cross-run/cross-source dedup (URL, or normalized headline+date). */
  dedupeKey: string;
}

/** Portfolio context a news query needs to score relevance against real exposure. */
export interface NewsQueryContext {
  heldSymbols: string[];
}

export interface NewsProvider {
  getNewsForSymbol(symbol: string, context: NewsQueryContext, sinceHours?: number): Promise<NewsArticle[]>;
  getMarketNews(context: NewsQueryContext, sinceHours?: number): Promise<NewsArticle[]>;
  getSectorNews(topic: SectorTopic, context: NewsQueryContext, sinceHours?: number): Promise<NewsArticle[]>;
}

export interface SecFiling {
  symbol: string;
  formType: string; // e.g. "10-K", "10-Q", "8-K", "Form 4"
  filedAt: Date;
  url: string;
  summary?: string;
}

export interface SecFilingsProvider {
  getRecentFilings(symbol: string, limit?: number): Promise<SecFiling[]>;
}
