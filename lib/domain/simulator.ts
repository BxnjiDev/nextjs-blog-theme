import { prisma } from '@/lib/prisma';
import { marketDataProvider, secFilingsProvider, type CompanyFundamentals, type HistoricalPricePoint, type DataQuality, type Trend } from '@/lib/integrations';
import { getStoredNews } from './news';
import { getPortfolioOverview } from './portfolio';

// computeSimulatedMetrics lives in lib/domain/simulatorMetrics.ts, not here —
// that module is imported directly by components/SimulatorClient.tsx (a
// 'use client' component), and this file's getSimulatorBaseline() pulls in
// Prisma/market-data/Anthropic, none of which can be bundled for the browser.

/** Everything needed to re-run computeRisk/computePortfolioHealth for one
 * holding at a HYPOTHETICAL quantity, without any further I/O. This is the
 * same per-symbol data lib/jobs/generateRiskAssessment.ts and
 * lib/jobs/generatePortfolioHealth.ts each fetch for the real portfolio —
 * gathered once here (in a single pass, deduping the overlap between the
 * two jobs) so the simulator page fetches nothing client-side. Only
 * `quantity` is meant to change interactively; every other field is fixed
 * per-symbol data that doesn't depend on position size. */
export interface HoldingBaseline {
  symbol: string;
  name: string;
  sector: string | null;
  currentPrice: number;
  quoteQuality: DataQuality;
  quoteAsOf: Date;
  quantity: number;
  avgCostBasis: number;
  history: HistoricalPricePoint[];
  fundamentals: CompanyFundamentals | null;
  daysSinceLastFiling: number | null;
  daysToNextEarnings: number | null;
  negativeNewsCritical: number;
  negativeNewsHigh: number;
  trend: Trend | null;
  convictionScore: number | null;
  valuationScore: number | null;
  revenueGrowth: number | null;
}

export interface SimulatorBaseline {
  holdings: HoldingBaseline[];
  totalValue: number;
  cashBalance: number;
  sp500History: HistoricalPricePoint[];
  portfolioHistory: { date: Date; portfolioValue: number }[];
}

/**
 * Gathers the real portfolio's current state plus every fixed per-symbol
 * input the risk/health engines need, so /simulator's client component can
 * recompute both scores instantly as the user drags hypothetical
 * allocations — with zero additional network calls, and without ever
 * writing anything (nothing here is persisted).
 */
export async function getSimulatorBaseline(): Promise<SimulatorBaseline | null> {
  const overview = await getPortfolioOverview();
  if (!overview) return null;

  const [sp500History, portfolioHistoryRaw] = await Promise.all([
    marketDataProvider.getSp500History(60),
    prisma.performanceSnapshot.findMany({ orderBy: { date: 'asc' }, take: 90 }),
  ]);
  const portfolioHistory = portfolioHistoryRaw.map((p) => ({ date: p.date, portfolioValue: Number(p.portfolioValue) }));

  const holdings: HoldingBaseline[] = await Promise.all(
    overview.holdings.map(async (view) => {
      const [history, fundamentals, filings, negativeNews, nextEarnings, technicals, latestConviction, latestFundamentalSnapshot] =
        await Promise.all([
          marketDataProvider.getHistoricalDaily(view.symbol, 60),
          marketDataProvider.getFundamentals(view.symbol),
          secFilingsProvider.getRecentFilings(view.symbol, 1),
          getStoredNews({ symbol: view.symbol, sinceHours: 24 * 7 }),
          prisma.earningsEvent.findFirst({ where: { symbol: view.symbol, isEstimate: true }, orderBy: { reportDate: 'asc' } }),
          marketDataProvider.getTechnicals(view.symbol),
          prisma.convictionAssessment.findFirst({ where: { symbol: view.symbol }, orderBy: { generatedAt: 'desc' } }),
          prisma.fundamentalSnapshot.findFirst({ where: { symbol: view.symbol, periodType: 'QUARTERLY' }, orderBy: { reportDate: 'desc' } }),
        ]);

      const daysSinceLastFiling = filings[0]
        ? Math.round((Date.now() - filings[0].filedAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const daysToNextEarnings = nextEarnings
        ? Math.round((nextEarnings.reportDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
      const negativeNewsCritical = negativeNews.filter(
        (n) => n.materialityLevel === 'CRITICAL' && n.sentiment !== null && n.sentiment < 0
      ).length;
      const negativeNewsHigh = negativeNews.filter(
        (n) => n.materialityLevel === 'HIGH' && n.sentiment !== null && n.sentiment < 0
      ).length;

      return {
        symbol: view.symbol,
        name: view.name,
        sector: view.sector,
        currentPrice: view.currentPrice,
        quoteQuality: view.quoteQuality,
        quoteAsOf: view.quoteAsOf,
        quantity: view.quantity,
        avgCostBasis: view.avgCostBasis,
        history,
        fundamentals,
        daysSinceLastFiling,
        daysToNextEarnings,
        negativeNewsCritical,
        negativeNewsHigh,
        trend: technicals.trend,
        convictionScore: latestConviction?.overallScore ?? null,
        valuationScore: latestConviction?.valuation ?? null,
        revenueGrowth: latestFundamentalSnapshot?.revenueGrowth ?? null,
      };
    })
  );

  return { holdings, totalValue: overview.totalValue, cashBalance: overview.cashBalance, sp500History, portfolioHistory };
}
