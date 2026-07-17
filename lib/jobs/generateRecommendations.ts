import { prisma } from '@/lib/prisma';
import { marketDataProvider, secFilingsProvider, aiReasoningProvider } from '@/lib/integrations';
import { getStoredNews, toNewsArticle } from '@/lib/domain/news';
import { buildMemoryContext } from '@/lib/domain/memory';
import { getPortfolioOverview, getActiveAccountId } from '@/lib/domain/portfolio';
import { computeProposedPosition } from '@/lib/domain/positionSizing';
import { annualizedVolatility } from '@/lib/domain/risk';

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

  const accountId = await getActiveAccountId();
  if (!accountId) return result;
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      holdings: {
        include: { recommendations: { orderBy: { generatedAt: 'desc' }, take: 1 } },
      },
    },
  });
  if (!account) return result;

  // Fetched once per job run (not per holding) — cash/total value and
  // SPY's recent behavior are portfolio-wide facts, not per-symbol ones.
  const [overview, sp500History] = await Promise.all([getPortfolioOverview(), marketDataProvider.getSp500History(60)]);
  const spyAsc = [...sp500History].sort((a, b) => a.date.getTime() - b.date.getTime());
  const spyRecentReturnPct =
    spyAsc.length >= 2 && spyAsc[0].close > 0 ? ((spyAsc[spyAsc.length - 1].close - spyAsc[0].close) / spyAsc[0].close) * 100 : null;
  const spyVolatility = annualizedVolatility(sp500History); // decimal, e.g. 0.18 = 18%
  const spyAnnualizedVolatilityPct = spyVolatility !== null ? spyVolatility * 100 : null;

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
      const [quote, technicals, fundamentals, filings, storedNews, memoryContext] = await Promise.all([
        marketDataProvider.getQuote(holding.symbol),
        marketDataProvider.getTechnicals(holding.symbol),
        marketDataProvider.getFundamentals(holding.symbol),
        secFilingsProvider.getRecentFilings(holding.symbol, 5),
        getStoredNews({ symbol: holding.symbol, sinceHours: 24 * 7 }),
        buildMemoryContext(holding.id, holding.symbol),
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
        memoryContext,
        portfolioContext: {
          cashBalance: overview?.cashBalance ?? 0,
          totalPortfolioValue: overview?.totalValue ?? 0,
          spyRecentReturnPct,
          spyAnnualizedVolatilityPct,
        },
      });

      const currentPositionMarketValue = overview?.holdings.find((h) => h.symbol === holding.symbol)?.marketValue ?? Number(holding.quantity) * quote.price;
      const sizing = computeProposedPosition({
        action: analysis.action,
        confidenceScore: analysis.confidenceScore,
        cashBalance: overview?.cashBalance ?? 0,
        totalPortfolioValue: overview?.totalValue ?? 0,
        currentPositionMarketValue,
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
          expectedOutcome: analysis.expectedOutcome,
          expectedTimeHorizon: analysis.expectedTimeHorizon,
          explainability: JSON.parse(JSON.stringify(analysis.explainability)),
          proposedDollarAmount: sizing.proposedDollarAmount,
          percentageOfPortfolio: sizing.percentageOfPortfolio,
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
