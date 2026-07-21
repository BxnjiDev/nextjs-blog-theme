import { prisma } from '@/lib/prisma';
import { getPortfolioOverview, getActiveAccountId, type PortfolioOverview } from './portfolio';
import { getGlobalStatus, type GlobalStatus } from './globalStatus';
import { getMarketStatus, type MarketStatus } from './marketHours';
import { normalizeBriefingPortfolioSummary } from './legacyNormalization';

export interface HighestConvictionRecommendation {
  id: string;
  symbol: string;
  action: string;
  confidenceScore: number;
  thesis: string;
}

export interface RecentThesisChange {
  symbol: string;
  changeType: string;
  whatChanged: string | null;
  createdAt: Date;
}

export interface UpcomingEarnings {
  symbol: string;
  reportDate: Date;
  fiscalPeriod: string;
  fiscalYear: number;
}

export interface RecentDecision {
  symbol: string;
  action: string;
  userDecision: string;
  userDecisionAt: Date;
}

export interface HomeDashboardData {
  greeting: string;
  portfolio: PortfolioOverview | null;
  portfolioHealth: { overallScore: number; previousScore: number | null; topConcerns: string[] } | null;
  status: GlobalStatus;
  market: MarketStatus;
  highestConviction: HighestConvictionRecommendation | null;
  recentThesisChange: RecentThesisChange | null;
  upcomingEarnings: UpcomingEarnings[];
  todaysFocus: string[];
  todaysAvoid: string[];
  recentDecisions: RecentDecision[];
}

export function getGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Single aggregation point for the Home dashboard (Atlas OS v1). Every field
 * here is read from an existing Atlas Core source — nothing is recomputed:
 * portfolio/health/status/thesis/earnings/decisions all come from the same
 * models and domain functions the rest of the app already uses. This
 * function's only job is composition for one screen, not new business logic.
 */
export async function getHomeDashboardData(): Promise<HomeDashboardData> {
  const accountId = await getActiveAccountId();

  const [portfolio, portfolioHealth, status, latestBriefing, topRecommendation, thesisChange, earnings, recentDecisions] = await Promise.all([
    getPortfolioOverview(),
    prisma.portfolioHealthAssessment.findFirst({ orderBy: { generatedAt: 'desc' } }),
    getGlobalStatus(),
    prisma.briefing.findFirst({ orderBy: { date: 'desc' } }),
    prisma.recommendation.findMany({
      where: accountId ? { holding: { accountId } } : undefined,
      distinct: ['holdingId'],
      orderBy: [{ holdingId: 'asc' }, { generatedAt: 'desc' }],
      select: { id: true, symbol: true, action: true, confidenceScore: true, thesis: true },
    }),
    // Scoped to the active account — an unscoped query here could surface a
    // thesis change from any account in the database (see the identical
    // fix on lib/domain/intelligence.ts).
    accountId
      ? prisma.thesisChangeEvent.findFirst({
          where: { thesis: { holding: { accountId } } },
          orderBy: { createdAt: 'desc' },
          select: { symbol: true, changeType: true, whatChanged: true, createdAt: true },
        })
      : null,
    prisma.earningsEvent.findMany({
      where: { reportDate: { gte: new Date() } },
      orderBy: { reportDate: 'asc' },
      take: 3,
      select: { symbol: true, reportDate: true, fiscalPeriod: true, fiscalYear: true },
    }),
    accountId
      ? prisma.recommendation.findMany({
          where: { userDecision: { not: 'PENDING' }, holding: { accountId } },
          orderBy: { userDecisionAt: 'desc' },
          take: 3,
          select: { symbol: true, action: true, userDecision: true, userDecisionAt: true },
        })
      : [],
  ]);

  const highestConviction = topRecommendation.length
    ? [...topRecommendation].sort((a, b) => b.confidenceScore - a.confidenceScore)[0]
    : null;

  const summary = latestBriefing ? normalizeBriefingPortfolioSummary(latestBriefing.portfolioSummary) : null;

  return {
    greeting: getGreeting(),
    portfolio,
    portfolioHealth: portfolioHealth
      ? { overallScore: portfolioHealth.overallScore, previousScore: portfolioHealth.previousScore, topConcerns: (portfolioHealth.topConcerns as unknown as string[]) ?? [] }
      : null,
    status,
    market: getMarketStatus(),
    highestConviction,
    recentThesisChange: thesisChange,
    upcomingEarnings: earnings,
    todaysFocus: summary?.whatAtlasWouldDoToday ?? [],
    todaysAvoid: summary?.whatAtlasWouldAvoidToday ?? [],
    recentDecisions: recentDecisions.map((r) => ({ symbol: r.symbol, action: r.action, userDecision: r.userDecision, userDecisionAt: r.userDecisionAt! })),
  };
}
