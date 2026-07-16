import { prisma } from '@/lib/prisma';

export interface ScorecardJobResult {
  skipped: boolean;
  totalRecommendations?: number;
  winRatePct?: number | null;
}

const BULLISH_ACTIONS = new Set(['BUY_MORE', 'HOLD']);
const BEARISH_ACTIONS = new Set(['REDUCE', 'SELL']);

/**
 * Permanent, append-only scorecard — Atlas measuring its own effectiveness
 * across every recommendation ever made. Because there is no execution
 * layer, "holding period" has no literal meaning (Atlas never actually buys
 * or sells) — avgHoldingPeriodDays is documented as a proxy: the average
 * gap between successive recommendations for the same symbol, i.e. how
 * often Atlas would have revisited a position.
 */
export async function runScorecardJob(): Promise<ScorecardJobResult> {
  const recommendations = await prisma.recommendation.findMany({ select: { id: true, symbol: true, action: true, generatedAt: true } });
  if (recommendations.length === 0) return { skipped: true };

  const outcomes = await prisma.recommendationOutcome.findMany({
    select: { recommendationId: true, wasCorrect: true, alpha90d: true, action: true },
  });
  const outcomeByRecId = new Map(outcomes.map((o) => [o.recommendationId, o]));

  const counts = { buyCount: 0, holdCount: 0, reduceCount: 0, sellCount: 0, watchCount: 0 };
  for (const r of recommendations) {
    if (r.action === 'BUY_MORE') counts.buyCount++;
    else if (r.action === 'HOLD') counts.holdCount++;
    else if (r.action === 'REDUCE') counts.reduceCount++;
    else if (r.action === 'SELL') counts.sellCount++;
    else if (r.action === 'WATCH') counts.watchCount++;
  }

  const graded = outcomes.filter((o) => o.wasCorrect !== null);
  const winRatePct = graded.length > 0 ? (graded.filter((o) => o.wasCorrect === true).length / graded.length) * 100 : null;
  const falsePositives = graded.filter((o) => BULLISH_ACTIONS.has(o.action) && o.wasCorrect === false).length;
  const falseNegatives = graded.filter((o) => BEARISH_ACTIONS.has(o.action) && o.wasCorrect === false).length;

  const alphaValues = outcomes.map((o) => o.alpha90d).filter((v): v is number => v !== null);
  const alphaVsSpyAvgPct = alphaValues.length > 0 ? alphaValues.reduce((a, b) => a + b, 0) / alphaValues.length : null;

  const bySymbol = new Map<string, Date[]>();
  for (const r of recommendations) {
    const list = bySymbol.get(r.symbol) ?? [];
    list.push(r.generatedAt);
    bySymbol.set(r.symbol, list);
  }
  const gaps: number[] = [];
  for (const dates of bySymbol.values()) {
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24));
    }
  }
  const avgHoldingPeriodDays = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;

  await prisma.recommendationScorecard.create({
    data: {
      totalRecommendations: recommendations.length,
      buyCount: counts.buyCount,
      holdCount: counts.holdCount,
      reduceCount: counts.reduceCount,
      sellCount: counts.sellCount,
      watchCount: counts.watchCount,
      winRatePct,
      falsePositives,
      falseNegatives,
      alphaVsSpyAvgPct,
      avgHoldingPeriodDays,
      methodology: {
        winRatePct: 'Share of graded (criticalReviewedAt set) outcomes where wasCorrect=true.',
        falsePositives: 'BUY_MORE/HOLD calls graded incorrect.',
        falseNegatives: 'REDUCE/SELL calls graded incorrect.',
        alphaVsSpyAvgPct: 'Average alpha90d across all outcomes with that window elapsed.',
        avgHoldingPeriodDays:
          'PROXY — Atlas has no execution layer, so there is no real holding period. This is the average gap between successive recommendations for the same symbol (how often Atlas would revisit a position).',
        gradedSampleSize: graded.length,
      },
    },
  });

  return { skipped: false, totalRecommendations: recommendations.length, winRatePct };
}
