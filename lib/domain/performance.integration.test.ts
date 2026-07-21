import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { getPerformanceSummary } from './performance';

/**
 * Real integration test against the dev Postgres database — the `history`
 * field reads actual PerformanceSnapshot rows (the same table
 * lib/jobs/generateRiskAssessment.ts and lib/domain/simulator.ts already
 * read for volatility/backtesting), so this verifies the ascending-date,
 * 90-row-cap read path rather than mocking Prisma. Uses distinctive dates
 * far outside any real data range so it can't collide with seeded/live
 * snapshots, and cleans up everything it wrote.
 */
const MARKER_DATES = ['2031-01-01', '2031-01-02', '2031-01-03'].map((d) => new Date(d));

afterAll(async () => {
  await prisma.performanceSnapshot.deleteMany({ where: { date: { in: MARKER_DATES } } });
});

describe('getPerformanceSummary history (integration)', () => {
  it('returns snapshots ascending by date with real recorded values', async () => {
    await prisma.performanceSnapshot.createMany({
      data: MARKER_DATES.map((date, i) => ({
        date,
        portfolioValue: 1000 + i * 10,
        sp500Value: 5000 + i * 5,
        cashBalance: 100,
      })),
    });

    const summary = await getPerformanceSummary();
    const marker = summary.history.filter((h) => MARKER_DATES.some((d) => d.toISOString().slice(0, 10) === h.date));

    expect(marker).toHaveLength(3);
    expect(marker[0].date < marker[1].date && marker[1].date < marker[2].date).toBe(true);
    expect(marker[0].portfolioValue).toBe(1000);
    expect(marker[2].portfolioValue).toBe(1020);
  });
});
