/**
 * Shared types for external data providers. Every provider has exactly one
 * mock implementation right now (clearly labeled) and is called only
 * through these interfaces, so swapping in a real vendor later is a
 * one-file change, not a rewrite of the pages that consume it.
 */
import type { Candle, Interval } from '@/lib/marketdata/types';

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

export interface CandleOptions {
  limit?: number;
  from?: Date;
  to?: Date;
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
  /**
   * Canonical OHLCV candles for one of the app's five supported intervals
   * (lib/marketdata/types.ts's Interval). Every implementation returns
   * already-normalized, ascending-by-time Candle[] — provider-specific
   * shape never leaks past this boundary. Where a provider can't serve an
   * interval natively, the implementation deterministically aggregates it
   * from a smaller trusted interval (lib/marketdata/aggregate.ts) rather
   * than failing outright.
   */
  getCandles(symbol: string, interval: Interval, options?: CandleOptions): Promise<Candle[]>;
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

// ---------------------------------------------------------------------------
// Fundamentals history (Phase 3): financial statements, valuation multiples,
// ownership, and a forward earnings calendar. Every field is independently
// nullable — a provider that can't determine one metric returns null for
// just that field rather than withholding the whole record.
// ---------------------------------------------------------------------------

export type StatementPeriod = 'ANNUAL' | 'QUARTERLY';

export interface FinancialStatementData {
  symbol: string;
  periodType: StatementPeriod;
  fiscalYear: number;
  fiscalPeriod: string; // "FY" for annual, "Q1".."Q4" for quarterly
  reportDate: Date;
  income: Record<string, number | null>;
  balance: Record<string, number | null>;
  cashFlow: Record<string, number | null>;
  metrics: {
    revenue: number | null;
    revenueGrowth: number | null; // YoY, decimal (0.15 = +15%)
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    freeCashFlow: number | null;
    eps: number | null;
    epsGrowth: number | null;
    roe: number | null;
    roic: number | null;
    debtToEquity: number | null;
    currentRatio: number | null;
    cash: number | null;
    totalDebt: number | null;
  };
  quality: DataQuality;
}

export interface ValuationMetrics {
  symbol: string;
  peRatio: number | null;
  forwardPe: number | null;
  peg: number | null;
  evToEbitda: number | null;
  evToSales: number | null;
  priceToBook: number | null;
  priceToFcf: number | null;
  asOf: Date;
  quality: DataQuality;
}

export interface OwnershipData {
  symbol: string;
  insiderOwnershipPct: number | null;
  institutionalOwnershipPct: number | null;
  sharesOutstanding: number | null;
  /** Negative = net buybacks, positive = net dilution, vs. the prior snapshot. */
  sharesOutstandingChangePct: number | null;
  dividendPerShare: number | null;
  dividendYield: number | null;
  asOf: Date;
  quality: DataQuality;
}

export interface EarningsEventData {
  symbol: string;
  fiscalYear: number;
  fiscalPeriod: string; // "Q1".."Q4"
  reportDate: Date;
  isEstimate: boolean;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  guidanceNote: string | null;
  callDate: Date | null;
}

export interface FundamentalsProvider {
  /** Historical statement periods, newest first. */
  getFinancialStatements(symbol: string, periods?: number): Promise<FinancialStatementData[]>;
  getValuationMetrics(symbol: string): Promise<ValuationMetrics | null>;
  getOwnership(symbol: string): Promise<OwnershipData | null>;
  /** Upcoming + recent historical earnings events, chronological. */
  getEarningsCalendar(symbol: string): Promise<EarningsEventData[]>;
}
