import { prisma } from '@/lib/prisma';
import type { NewsItem } from '@prisma/client';
import type { NewsArticle, DataQuality, MaterialityLevel } from '@/lib/integrations';

/**
 * Reads news already fetched, scored, and deduped by
 * lib/jobs/monitorNews.ts. Downstream consumers (recommendation/thesis
 * prompts, the briefing job, dashboard pages) read from storage instead of
 * calling the news provider directly — a single fetch+score+persist step,
 * reused everywhere, instead of every consumer burning its own API calls.
 */
export async function getStoredNews(options: {
  symbol?: string;
  sinceHours?: number;
  limit?: number;
} = {}): Promise<NewsItem[]> {
  const sinceHours = options.sinceHours ?? 24 * 3;
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  return prisma.newsItem.findMany({
    where: {
      publishedAt: { gte: since },
      ...(options.symbol ? { symbol: options.symbol } : {}),
    },
    orderBy: [{ materialityLevel: 'asc' }, { publishedAt: 'desc' }],
    take: options.limit ?? 50,
  });
}

/** Converts a stored row back into the NewsArticle shape consumers of the
 * integration layer already expect (AI prompts, etc). */
export function toNewsArticle(item: NewsItem): NewsArticle {
  return {
    symbol: item.symbol ?? undefined,
    tickers: Array.isArray(item.tickers) ? (item.tickers as string[]) : [],
    headline: item.headline,
    summary: item.summary ?? undefined,
    source: item.source,
    url: item.url ?? undefined,
    publishedAt: item.publishedAt,
    materiality: item.materiality,
    materialityLevel: item.materialityLevel.toLowerCase() as MaterialityLevel,
    relevanceScore: item.relevanceScore,
    sentiment: item.sentiment,
    quality: item.quality as DataQuality,
    dedupeKey: item.dedupeKey,
  };
}
