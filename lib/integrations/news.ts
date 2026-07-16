import type { NewsProvider, NewsArticle } from './types';

/**
 * MOCK implementation — returns no articles rather than fabricated
 * headlines, since invented news is far more dangerous than an empty feed.
 *
 * To go live: implement against a real financial news API (e.g. Benzinga,
 * NewsAPI, Finnhub, Alpha Vantage News Sentiment) keyed by NEWS_API_KEY.
 */
class MockNewsProvider implements NewsProvider {
  async getNewsForSymbol(_symbol: string, _sinceHours = 24): Promise<NewsArticle[]> {
    return [];
  }

  async getMarketNews(_sinceHours = 24): Promise<NewsArticle[]> {
    return [];
  }
}

export const newsProvider: NewsProvider = new MockNewsProvider();
