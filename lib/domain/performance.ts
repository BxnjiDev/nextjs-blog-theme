import { prisma } from '@/lib/prisma';

export interface ReturnMetric {
  available: boolean;
  returnPercent?: number;
  vsSp500Percent?: number;
  fromDate?: string;
  note?: string;
}

export interface PerformanceSummary {
  today: { portfolioValue: number; sp500Value: number; cashBalance: number; date: string } | null;
  daily: ReturnMetric;
  weekly: ReturnMetric;
  monthly: ReturnMetric;
}

async function findSnapshotAtOrBefore(daysAgo: number, latestDate: Date) {
  const target = new Date(latestDate);
  target.setUTCDate(target.getUTCDate() - daysAgo);
  return prisma.performanceSnapshot.findFirst({
    where: { date: { lte: target } },
    orderBy: { date: 'desc' },
  });
}

function computeReturn(
  latest: { portfolioValue: unknown; sp500Value: unknown },
  past: { portfolioValue: unknown; sp500Value: unknown; date: Date } | null,
  label: string
): ReturnMetric {
  if (!past) {
    return {
      available: false,
      note: `Not enough snapshot history yet for a ${label} return — need a portfolio snapshot from further back than what's recorded so far.`,
    };
  }
  const latestValue = Number(latest.portfolioValue);
  const pastValue = Number(past.portfolioValue);
  const latestSp500 = Number(latest.sp500Value);
  const pastSp500 = Number(past.sp500Value);

  const portfolioReturn = ((latestValue - pastValue) / pastValue) * 100;
  const sp500Return = ((latestSp500 - pastSp500) / pastSp500) * 100;

  return {
    available: true,
    returnPercent: portfolioReturn,
    vsSp500Percent: portfolioReturn - sp500Return,
    fromDate: past.date.toISOString().slice(0, 10),
  };
}

/**
 * Computes daily/weekly/monthly return (and vs. S&P 500) from ACTUAL
 * accumulated PerformanceSnapshot rows — never backward-reconstructed from
 * today's holdings and historical prices, since that would silently assume
 * no trades happened and could misrepresent real performance. Until enough
 * real snapshots have accumulated (the refresh job runs periodically and
 * writes one per day), the corresponding metric honestly reports
 * `available: false` instead of a number.
 */
export async function getPerformanceSummary(): Promise<PerformanceSummary> {
  const latest = await prisma.performanceSnapshot.findFirst({ orderBy: { date: 'desc' } });
  if (!latest) {
    const unavailable: ReturnMetric = { available: false, note: 'No performance snapshots recorded yet.' };
    return { today: null, daily: unavailable, weekly: unavailable, monthly: unavailable };
  }

  const [dayAgo, weekAgo, monthAgo] = await Promise.all([
    findSnapshotAtOrBefore(1, latest.date),
    findSnapshotAtOrBefore(7, latest.date),
    findSnapshotAtOrBefore(30, latest.date),
  ]);

  return {
    today: {
      portfolioValue: Number(latest.portfolioValue),
      sp500Value: Number(latest.sp500Value),
      cashBalance: Number(latest.cashBalance),
      date: latest.date.toISOString().slice(0, 10),
    },
    daily: computeReturn(latest, dayAgo, 'daily'),
    weekly: computeReturn(latest, weekAgo, 'weekly'),
    monthly: computeReturn(latest, monthAgo, 'monthly'),
  };
}
