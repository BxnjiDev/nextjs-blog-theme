import { prisma } from '@/lib/prisma';
import type { FundamentalHistoryPoint } from './conviction';

/** Newest-first quarterly fundamentals history for a symbol, as persisted
 * by lib/jobs/ingestFundamentals.ts. Empty when nothing has been ingested. */
export async function getFundamentalHistory(symbol: string, limit = 8): Promise<FundamentalHistoryPoint[]> {
  const rows = await prisma.fundamentalSnapshot.findMany({
    where: { symbol, periodType: 'QUARTERLY' },
    orderBy: { reportDate: 'desc' },
    take: limit,
  });
  return rows.map((r) => ({
    fiscalYear: r.fiscalYear,
    fiscalPeriod: r.fiscalPeriod,
    reportDate: r.reportDate,
    revenue: r.revenue,
    revenueGrowth: r.revenueGrowth,
    grossMargin: r.grossMargin,
    operatingMargin: r.operatingMargin,
    netMargin: r.netMargin,
    freeCashFlow: r.freeCashFlow,
    eps: r.eps,
    epsGrowth: r.epsGrowth,
    roe: r.roe,
    roic: r.roic,
    debtToEquity: r.debtToEquity,
    currentRatio: r.currentRatio,
    cash: r.cash,
    totalDebt: r.totalDebt,
  }));
}
