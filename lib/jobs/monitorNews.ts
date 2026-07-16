import { Prisma, MaterialityLevel as PrismaMaterialityLevel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { newsProvider, sectorTopicForHoldingSector } from '@/lib/integrations';
import type { NewsArticle, SectorTopic } from '@/lib/integrations';
import { createAlertIfNew } from '@/lib/domain/alerts';

/** Only persist stories genuinely relevant to the portfolio — a low-relevance
 * general-market story is fetched (for briefing context) but not stored. */
const STORAGE_RELEVANCE_THRESHOLD = 30;

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

async function storeArticles(articles: NewsArticle[]): Promise<number> {
  let stored = 0;
  for (const article of articles) {
    if (article.relevanceScore < STORAGE_RELEVANCE_THRESHOLD) continue;
    try {
      await prisma.newsItem.create({
        data: {
          symbol: article.symbol ?? null,
          tickers: article.tickers,
          headline: article.headline,
          summary: article.summary,
          source: article.source,
          url: article.url,
          sentiment: article.sentiment,
          materiality: article.materiality,
          materialityLevel: article.materialityLevel.toUpperCase() as PrismaMaterialityLevel,
          relevanceScore: article.relevanceScore,
          quality: article.quality,
          dedupeKey: article.dedupeKey,
          publishedAt: article.publishedAt,
        },
      });
      stored++;

      // A critical- or high-materiality item with clearly negative sentiment
      // on a held symbol is exactly the "major negative news" signal worth
      // surfacing as an alert — routine/neutral/positive stories never
      // trigger one. Deduped per-article via the news item's own dedupeKey.
      const isHeldSymbol = Boolean(article.symbol) && article.relevanceScore >= 65;
      const isNegative = article.sentiment !== null && article.sentiment < -0.2;
      const isMaterial = article.materialityLevel === 'critical' || article.materialityLevel === 'high';
      if (isHeldSymbol && isNegative && isMaterial) {
        await createAlertIfNew({
          type: 'MAJOR_NEGATIVE_NEWS',
          severity: article.materialityLevel === 'critical' ? 'URGENT' : 'WATCH',
          symbol: article.symbol,
          message: `${article.symbol}: ${article.headline}`,
          evidence: article.url,
          confidenceScore: article.materialityLevel === 'critical' ? 8 : 6,
          dedupeKey: `news-alert:${article.dedupeKey}`,
        });
      }
    } catch (err) {
      // Already stored (same dedupeKey) — expected on re-runs, not an error.
      if (!isUniqueConstraintError(err)) throw err;
    }
  }
  return stored;
}

export interface NewsMonitorResult {
  fetched: number;
  stored: number;
  bySymbol: Record<string, number>;
}

/**
 * Fetches per-holding company news plus sector/macro coverage relevant to
 * what's actually held, scores + dedupes it, and persists qualifying items.
 * Idempotent via NewsItem.dedupeKey (unique) — re-running never duplicates
 * a story already stored.
 */
export async function runNewsMonitorJob(): Promise<NewsMonitorResult> {
  const holdings = await prisma.holding.findMany({ select: { symbol: true, sector: true } });
  const heldSymbols = holdings.map((h) => h.symbol);
  const context = { heldSymbols };

  const result: NewsMonitorResult = { fetched: 0, stored: 0, bySymbol: {} };

  for (const h of holdings) {
    const articles = await newsProvider.getNewsForSymbol(h.symbol, context, 24);
    result.fetched += articles.length;
    result.bySymbol[h.symbol] = articles.length;
    result.stored += await storeArticles(articles);
  }

  const topics = new Set<SectorTopic>(['macro']);
  for (const h of holdings) {
    const topic = sectorTopicForHoldingSector(h.sector);
    if (topic) topics.add(topic);
  }

  for (const topic of topics) {
    const articles = await newsProvider.getSectorNews(topic, context, 24);
    result.fetched += articles.length;
    result.stored += await storeArticles(articles);
  }

  return result;
}
