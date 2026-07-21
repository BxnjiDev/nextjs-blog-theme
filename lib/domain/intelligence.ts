import { prisma } from '@/lib/prisma';
import type { Thesis, ThesisChangeEvent, NewsItem } from '@prisma/client';
import { getActiveAccountId } from './portfolio';

export type ConvictionTrend = 'IMPROVING' | 'STABLE' | 'WEAKENING' | 'UNKNOWN';

export interface HoldingIntelligenceSummary {
  symbol: string;
  name: string;
  thesis: Thesis | null;
  currentConviction: number | null;
  previousConviction: number | null;
  trend: ConvictionTrend;
  latestChangeEvent: ThesisChangeEvent | null;
  latestNews: NewsItem[];
}

/** Assembles the per-holding intelligence summary shown on /intelligence:
 * current vs. previous conviction, trend classification, latest thesis
 * change, and the most material recent news. */
export async function getPortfolioIntelligence(): Promise<HoldingIntelligenceSummary[]> {
  // Scoped to the active account for the same reason as every other page
  // resolving "the" portfolio (see lib/domain/portfolio.ts) — an unscoped
  // query here showed holdings from any account in the database, including
  // leftover seed/demo accounts, instead of just the real active one.
  const accountId = await getActiveAccountId();
  const holdings = accountId
    ? await prisma.holding.findMany({
        where: { accountId },
        include: {
          thesis: {
            include: {
              convictionAssessments: { orderBy: { generatedAt: 'desc' }, take: 2 },
              changeEvents: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
          },
        },
        orderBy: { symbol: 'asc' },
      })
    : [];

  const results: HoldingIntelligenceSummary[] = [];
  for (const h of holdings) {
    const convictions = h.thesis?.convictionAssessments ?? [];
    const current = convictions[0]?.overallScore ?? h.thesis?.convictionScore ?? null;
    const previous = convictions[1]?.overallScore ?? null;

    // UNKNOWN (not STABLE) when there's no prior assessment to compare
    // against — "stable" would imply a comparison that hasn't happened yet.
    let trend: ConvictionTrend = 'UNKNOWN';
    if (current !== null && previous !== null) {
      const delta = current - previous;
      trend = delta >= 5 ? 'IMPROVING' : delta <= -5 ? 'WEAKENING' : 'STABLE';
    }

    const latestNews = await prisma.newsItem.findMany({
      where: { symbol: h.symbol },
      orderBy: [{ materialityLevel: 'asc' }, { publishedAt: 'desc' }],
      take: 3,
    });

    results.push({
      symbol: h.symbol,
      name: h.name,
      thesis: h.thesis,
      currentConviction: current,
      previousConviction: previous,
      trend,
      latestChangeEvent: h.thesis?.changeEvents[0] ?? null,
      latestNews,
    });
  }

  return results;
}
