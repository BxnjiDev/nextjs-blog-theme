import { prisma } from '@/lib/prisma';
import { getPortfolioOverview } from '@/lib/domain/portfolio';
import { todayUtcDateOnly } from '@/lib/domain/date';

export interface RefreshResult {
  skipped: boolean;
  portfolioValue?: number;
  sp500Value?: number;
}

/**
 * Recomputes the portfolio's current value against live-ish quotes and
 * upserts one PerformanceSnapshot per UTC calendar day. Upserting on the
 * unique `date` column is what makes this idempotent — running it every 30
 * minutes during market hours refines the same day's row instead of
 * creating duplicates, and it's this accumulated history (not a backward
 * reconstruction from today's holdings) that the daily briefing job reads
 * for weekly/monthly returns — so those numbers reflect what was actually
 * observed, not an assumption that current share counts held constant.
 */
export async function runPortfolioRefreshJob(): Promise<RefreshResult> {
  const overview = await getPortfolioOverview();
  if (!overview) return { skipped: true };

  const date = todayUtcDateOnly();
  await prisma.performanceSnapshot.upsert({
    where: { date },
    update: {
      portfolioValue: overview.totalValue,
      sp500Value: overview.sp500Level,
      cashBalance: overview.cashBalance,
    },
    create: {
      date,
      portfolioValue: overview.totalValue,
      sp500Value: overview.sp500Level,
      cashBalance: overview.cashBalance,
    },
  });

  return { skipped: false, portfolioValue: overview.totalValue, sp500Value: overview.sp500Level };
}
