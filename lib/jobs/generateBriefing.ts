import { prisma } from '@/lib/prisma';
import { getPortfolioOverview } from '@/lib/domain/portfolio';
import { getPerformanceSummary } from '@/lib/domain/performance';
import { todayUtcDateOnly } from '@/lib/domain/date';
import { secFilingsProvider } from '@/lib/integrations';
import { getStoredNews } from '@/lib/domain/news';
import type { NewsItem } from '@prisma/client';

/** Deterministic, evidence-grounded explanation of why a stored news item
 * matters to the portfolio — not an AI-generated rationale, just a plain
 * statement of the facts that made it qualify (materiality, exposure). */
function explainNewsRelevance(item: NewsItem, heldSymbols: string[]): string {
  const tickers = Array.isArray(item.tickers) ? (item.tickers as string[]) : [];
  const heldMentions = tickers.filter((t) => heldSymbols.includes(t));
  const parts: string[] = [];

  if (item.symbol && heldSymbols.includes(item.symbol)) {
    parts.push(`Directly about your ${item.symbol} position.`);
  } else if (heldMentions.length > 0) {
    parts.push(`Mentions holding(s): ${heldMentions.join(', ')}.`);
  } else {
    parts.push('Sector/macro coverage relevant to your holdings.');
  }

  parts.push(`Materiality: ${item.materialityLevel.toLowerCase()}.`);
  if (item.sentiment !== null) {
    parts.push(`Sentiment: ${item.sentiment > 0 ? 'positive' : item.sentiment < 0 ? 'negative' : 'neutral'} (${item.sentiment.toFixed(2)}).`);
  }
  return parts.join(' ');
}

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

  const [overview, performance, risk, health, theses] = await Promise.all([
    getPortfolioOverview(),
    getPerformanceSummary(),
    prisma.riskAssessment.findFirst({ orderBy: { generatedAt: 'desc' } }),
    prisma.portfolioHealthAssessment.findFirst({ orderBy: { generatedAt: 'desc' } }),
    prisma.thesis.findMany({ where: { holding: { accountId: account.id } } }),
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

  const convictionHighlights = theses
    .map((t) => ({ symbol: t.symbol, convictionScore: t.convictionScore, lastReviewedAt: t.lastReviewedAt.toISOString() }))
    .sort((a, b) => a.convictionScore - b.convictionScore);

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
    convictionHighlights,
    materialRisks: risk
      ? { overallScore: risk.overallScore, previousScore: risk.previousScore, notes: risk.notes, explanation: risk.explanation }
      : null,
    portfolioHealth: health
      ? { overallScore: health.overallScore, previousScore: health.previousScore, topConcerns: health.topConcerns, topImprovements: health.topImprovements }
      : null,
  };

  const heldSymbols = account.holdings.map((h) => h.symbol);
  // Only meaningful stories (medium materiality or above) make the briefing —
  // "low" items are stored for the record but not surfaced here.
  const storedNews = await getStoredNews({ sinceHours: 48, limit: 30 });
  const portfolioNews = storedNews
    .filter((n) => n.materialityLevel !== 'LOW')
    .map((n) => ({
      symbol: n.symbol ?? null,
      tickers: Array.isArray(n.tickers) ? n.tickers : [],
      headline: n.headline,
      source: n.source,
      url: n.url ?? null,
      publishedAt: n.publishedAt.toISOString(),
      materiality: n.materiality,
      materialityLevel: n.materialityLevel,
      sentiment: n.sentiment,
      whyItMatters: explainNewsRelevance(n, heldSymbols),
    }));

  const upcomingEvents = await Promise.all(
    account.holdings.map(async (h) => {
      const [filings, nextEarnings] = await Promise.all([
        secFilingsProvider.getRecentFilings(h.symbol, 1),
        prisma.earningsEvent.findFirst({ where: { symbol: h.symbol, isEstimate: true }, orderBy: { reportDate: 'asc' } }),
      ]);
      return {
        symbol: h.symbol,
        mostRecentFiling: filings[0]
          ? { formType: filings[0].formType, filedAt: filings[0].filedAt.toISOString(), url: filings[0].url }
          : null,
        nextEarnings: nextEarnings
          ? {
              reportDate: nextEarnings.reportDate.toISOString(),
              daysAway: Math.round((nextEarnings.reportDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
              epsEstimate: nextEarnings.epsEstimate,
              fiscalPeriod: nextEarnings.fiscalPeriod,
              fiscalYear: nextEarnings.fiscalYear,
            }
          : null,
      };
    })
  );

  const marketRecap = {
    portfolioNews,
    upcomingEvents,
    notes: [
      'No macro/economic data sources (Federal Reserve, CPI, rates, oil, gold, Bitcoin) are connected yet.',
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
