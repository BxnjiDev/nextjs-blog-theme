import { prisma } from '@/lib/prisma';
import { marketDataProvider, secFilingsProvider, aiReasoningProvider } from '@/lib/integrations';
import { getStoredNews, toNewsArticle } from '@/lib/domain/news';

/** Idempotency window: re-running the job within this many hours of the last
 * analysis for a holding is a no-op for that holding, so a retried or
 * overlapping cron firing never produces duplicate Recommendation rows. */
const RECOMMENDATION_REFRESH_HOURS = 20;

export interface RecommendationJobResult {
  processed: number;
  skipped: number;
  errors: { symbol: string; error: string }[];
}

export async function runRecommendationJob(options?: { force?: boolean }): Promise<RecommendationJobResult> {
  const result: RecommendationJobResult = { processed: 0, skipped: 0, errors: [] };

  const account = await prisma.account.findFirst({
    include: {
      holdings: {
        include: { recommendations: { orderBy: { generatedAt: 'desc' }, take: 1 } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!account) return result;

  for (const holding of account.holdings) {
    const previous = holding.recommendations[0];

    if (!options?.force && previous) {
      const ageHours = (Date.now() - previous.generatedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours < RECOMMENDATION_REFRESH_HOURS) {
        result.skipped++;
        continue;
      }
    }

    try {
      const [quote, technicals, fundamentals, filings, storedNews] = await Promise.all([
        marketDataProvider.getQuote(holding.symbol),
        marketDataProvider.getTechnicals(holding.symbol),
        marketDataProvider.getFundamentals(holding.symbol),
        secFilingsProvider.getRecentFilings(holding.symbol, 5),
        getStoredNews({ symbol: holding.symbol, sinceHours: 24 * 7 }),
      ]);
      const news = storedNews.map(toNewsArticle);

      const analysis = await aiReasoningProvider.analyzeHolding({
        symbol: holding.symbol,
        name: holding.name,
        quantity: Number(holding.quantity),
        avgCostBasis: Number(holding.avgCostBasis),
        quote,
        technicals,
        fundamentals,
        filings,
        news,
        previousRecommendation: previous
          ? { thesis: previous.thesis, action: previous.action, generatedAt: previous.generatedAt }
          : null,
      });

      await prisma.recommendation.create({
        data: {
          holdingId: holding.id,
          symbol: holding.symbol,
          thesis: analysis.thesis,
          thesisChanged: analysis.thesisChanged,
          bullCase: analysis.bullCase,
          bearCase: analysis.bearCase,
          catalysts: analysis.catalysts,
          risks: analysis.risks,
          fairValueOpinion: analysis.fairValueOpinion,
          technicalTrend: analysis.technicalTrend,
          institutionalSentiment: analysis.institutionalSentiment,
          confidenceScore: analysis.confidenceScore,
          action: analysis.action,
          previousId: previous?.id,
          sourcesMeta: {
            quoteAsOf: quote.asOf.toISOString(),
            quoteQuality: quote.quality,
            technicalsQuality: technicals.quality,
            fundamentalsAvailable: Boolean(fundamentals),
            fundamentalsQuality: fundamentals?.quality ?? null,
            filingsCount: filings.length,
            newsCount: news.length,
            generatedAt: new Date().toISOString(),
          },
        },
      });

      result.processed++;
    } catch (err) {
      result.errors.push({ symbol: holding.symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
