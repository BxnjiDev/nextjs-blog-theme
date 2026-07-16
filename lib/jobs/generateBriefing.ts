import { prisma } from '@/lib/prisma';
import { getPortfolioOverview } from '@/lib/domain/portfolio';
import { getPerformanceSummary } from '@/lib/domain/performance';
import { todayUtcDateOnly } from '@/lib/domain/date';
import { newsProvider, secFilingsProvider } from '@/lib/integrations';

export interface BriefingJobResult {
  created: boolean;
  date?: string;
  reason?: string;
}

/**
 * Generates (or refreshes) today's briefing. Upserts on `Briefing.date`
 * (unique), so re-running this job later the same day updates the one row
 * for today instead of creating duplicates.
 */
export async function runBriefingJob(): Promise<BriefingJobResult> {
  const account = await prisma.account.findFirst({
    include: {
      holdings: {
        include: { recommendations: { orderBy: { generatedAt: 'desc' }, take: 1 } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!account) {
    return { created: false, reason: 'No account connected yet.' };
  }

  const [overview, performance, risk] = await Promise.all([
    getPortfolioOverview(),
    getPerformanceSummary(),
    prisma.riskAssessment.findFirst({ orderBy: { generatedAt: 'desc' } }),
  ]);

  const recommendedActions = account.holdings.map((h) => {
    const rec = h.recommendations[0];
    return {
      symbol: h.symbol,
      action: rec?.action ?? null,
      confidenceScore: rec?.confidenceScore ?? null,
      generatedAt: rec?.generatedAt.toISOString() ?? null,
    };
  });

  const portfolioSummary = {
    totalValue: overview?.totalValue ?? null,
    cashBalance: overview?.cashBalance ?? null,
    dayChangeValue: overview?.dayChangeValue ?? null,
    dayChangePercent: overview?.dayChangePercent ?? null,
    sp500Level: overview?.sp500Level ?? null,
    largestWinner: overview?.largestWinner
      ? { symbol: overview.largestWinner.symbol, changePercent: overview.largestWinner.changePercent }
      : null,
    largestLoser: overview?.largestLoser
      ? { symbol: overview.largestLoser.symbol, changePercent: overview.largestLoser.changePercent }
      : null,
    performance,
    recommendedActions,
    materialRisks: risk ? { overallScore: risk.overallScore, notes: risk.notes } : null,
  };

  const perHoldingNews = await Promise.all(
    account.holdings.map((h) => newsProvider.getNewsForSymbol(h.symbol, 24))
  );
  const marketNews = await newsProvider.getMarketNews(24);
  const portfolioNews = [...perHoldingNews.flat(), ...marketNews].map((n) => ({
    symbol: n.symbol ?? null,
    headline: n.headline,
    source: n.source,
    url: n.url ?? null,
    publishedAt: n.publishedAt.toISOString(),
    materiality: n.materiality,
  }));

  const upcomingEvents = await Promise.all(
    account.holdings.map(async (h) => {
      const filings = await secFilingsProvider.getRecentFilings(h.symbol, 1);
      return {
        symbol: h.symbol,
        mostRecentFiling: filings[0]
          ? { formType: filings[0].formType, filedAt: filings[0].filedAt.toISOString(), url: filings[0].url }
          : null,
      };
    })
  );

  const marketRecap = {
    portfolioNews,
    upcomingEvents,
    notes: [
      'No macro/economic data sources (Federal Reserve, CPI, rates, oil, gold, Bitcoin) are connected yet.',
      'No forward-looking earnings calendar is connected; showing the most recent SEC filing per holding as the closest available signal instead.',
    ],
  };

  // Round-trip through JSON so plain typed objects satisfy Prisma's
  // InputJsonValue structural type (Date fields were already stringified above).
  const portfolioSummaryJson = JSON.parse(JSON.stringify(portfolioSummary));
  const marketRecapJson = JSON.parse(JSON.stringify(marketRecap));

  const date = todayUtcDateOnly();
  await prisma.briefing.upsert({
    where: { date },
    update: { portfolioSummary: portfolioSummaryJson, marketRecap: marketRecapJson, riskAssessmentId: risk?.id },
    create: { date, portfolioSummary: portfolioSummaryJson, marketRecap: marketRecapJson, riskAssessmentId: risk?.id },
  });

  return { created: true, date: date.toISOString().slice(0, 10) };
}
