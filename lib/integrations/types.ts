/**
 * Shared types for external data providers. Every provider has exactly one
 * mock implementation right now (clearly labeled) and is called only
 * through these interfaces, so swapping in a real vendor later is a
 * one-file change, not a rewrite of the pages that consume it.
 */

export interface Quote {
  symbol: string;
  price: number;
  changePercent: number;
  volume: number;
  asOf: Date;
}

export type Trend = 'UP' | 'DOWN' | 'SIDEWAYS';

export interface Technicals {
  symbol: string;
  trend: Trend;
  notes: string;
}

export interface MarketDataProvider {
  getQuote(symbol: string): Promise<Quote>;
  getQuotes(symbols: string[]): Promise<Quote[]>;
  getTechnicals(symbol: string): Promise<Technicals>;
  /** Latest S&P 500 index level, used for benchmark comparisons. */
  getSp500Level(): Promise<number>;
}

export interface NewsArticle {
  symbol?: string;
  headline: string;
  summary?: string;
  source: string;
  url?: string;
  publishedAt: Date;
  /** 1-10: how likely this is to matter to a holder of `symbol`. */
  materiality: number;
}

export interface NewsProvider {
  getNewsForSymbol(symbol: string, sinceHours?: number): Promise<NewsArticle[]>;
  getMarketNews(sinceHours?: number): Promise<NewsArticle[]>;
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
