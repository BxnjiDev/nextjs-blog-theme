import { prisma } from '@/lib/prisma';
import { getHomeDashboardData } from '@/lib/domain/homeDashboard';
import { getActiveAccountId } from '@/lib/domain/portfolio';
import { buildTodaysFocusInsights } from './engine';
import type { Insight } from './types';

/**
 * The Atlas chat tool layer's entry point into the same Today's Focus
 * merge that Home's page.tsx computes — a thin fetch-and-call wrapper, not
 * a second implementation. A chat turn shares no request-scoped data with
 * a page render, so (unlike Home, which already has getHomeDashboardData()
 * and a risk read in hand for other widgets) this does its own complete
 * fetch. buildTodaysFocusInsights() itself — the actual scoring/ranking
 * logic — is the single shared seam between the two surfaces, so "what
 * does Atlas think matters today" can never quietly diverge between the
 * dashboard and the chat.
 */
export async function getTodaysFocus(): Promise<Insight[]> {
  const accountId = await getActiveAccountId();

  const [data, risk, pendingRecommendations] = await Promise.all([
    getHomeDashboardData(),
    prisma.riskAssessment.findFirst({ orderBy: { generatedAt: 'desc' } }),
    accountId
      ? prisma.recommendation.findMany({
          where: { userDecision: 'PENDING', holding: { accountId } },
          orderBy: { confidenceScore: 'desc' },
          take: 10,
          select: { id: true, symbol: true, action: true, confidenceScore: true, dataQualityStatus: true, userDecision: true, generatedAt: true },
        })
      : Promise.resolve([]),
  ]);

  const earningsWeightBySymbol = Object.fromEntries(
    (data.portfolio?.holdings ?? []).map((h) => [h.symbol, data.portfolio && data.portfolio.totalValue > 0 ? (h.marketValue / data.portfolio.totalValue) * 100 : 0])
  );
  const usingMockData = !data.status.marketData.configured || !data.status.fundamentals.configured;

  return buildTodaysFocusInsights({
    portfolioHealth: data.portfolioHealth,
    risk,
    recommendations: pendingRecommendations,
    thesisChange: data.recentThesisChange,
    earnings: data.upcomingEarnings,
    earningsWeightBySymbol,
    usingMockData,
  });
}
