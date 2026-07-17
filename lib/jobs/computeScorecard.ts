import { prisma } from '@/lib/prisma';

export interface ScorecardJobResult {
  skipped: boolean;
  totalRecommendations?: number;
  winRatePct?: number | null;
}

export interface ScorecardRecommendationInput {
  symbol: string;
  action: string;
  generatedAt: Date;
  userDecision: string;
}

export interface ScorecardOutcomeInput {
  wasCorrect: boolean | null;
  alpha90d: number | null;
  action: string;
}

export interface ScorecardMetrics {
  buyCount: number;
  holdCount: number;
  reduceCount: number;
  sellCount: number;
  watchCount: number;
  winRatePct: number | null;
  falsePositives: number;
  falseNegatives: number;
  alphaVsSpyAvgPct: number | null;
  avgHoldingPeriodDays: number | null;
  avgDrawdownPct: number | null;
  avgGainPct: number | null;
  utilizationPct: number | null;
  acceptanceRatePct: number | null;
  gradedSampleSize: number;
}

const BULLISH_ACTIONS = new Set(['BUY_MORE', 'HOLD']);
const BEARISH_ACTIONS = new Set(['REDUCE', 'SELL']);

/**
 * Pure computation, split out from runScorecardJob() so it's replayable
 * against hand-crafted historical data in tests without touching the
 * database — the exact same function the real job calls against live
 * Recommendation/RecommendationOutcome rows.
 */
export function computeScorecardMetrics(
  recommendations: ScorecardRecommendationInput[],
  outcomes: ScorecardOutcomeInput[]
): ScorecardMetrics {
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

  // Drawdown/gain are alpha90d-based proxies (see methodology in
  // runScorecardJob) — a real peak-to-trough drawdown would need the full
  // daily price path between recommendation and now, which
  // trackRecommendationOutcomes.ts doesn't retain (only window snapshots).
  const losingAlphas = alphaValues.filter((a) => a < 0);
  const winningAlphas = alphaValues.filter((a) => a > 0);
  const avgDrawdownPct = losingAlphas.length > 0 ? Math.abs(losingAlphas.reduce((a, b) => a + b, 0) / losingAlphas.length) : null;
  const avgGainPct = winningAlphas.length > 0 ? winningAlphas.reduce((a, b) => a + b, 0) / winningAlphas.length : null;

  const decided = recommendations.filter((r) => r.userDecision !== 'PENDING');
  const utilizationPct = recommendations.length > 0 ? (decided.length / recommendations.length) * 100 : null;
  const acceptedCount = decided.filter((r) => r.userDecision === 'ACCEPTED' || r.userDecision === 'PARTIALLY_ACCEPTED').length;
  const acceptanceRatePct = decided.length > 0 ? (acceptedCount / decided.length) * 100 : null;

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

  return {
    ...counts,
    winRatePct,
    falsePositives,
    falseNegatives,
    alphaVsSpyAvgPct,
    avgHoldingPeriodDays,
    avgDrawdownPct,
    avgGainPct,
    utilizationPct,
    acceptanceRatePct,
    gradedSampleSize: graded.length,
  };
}

/**
 * Permanent, append-only scorecard — Atlas measuring its own effectiveness
 * across every recommendation ever made. Because there is no execution
 * layer, "holding period" has no literal meaning (Atlas never actually buys
 * or sells) — avgHoldingPeriodDays is documented as a proxy: the average
 * gap between successive recommendations for the same symbol, i.e. how
 * often Atlas would have revisited a position.
 */
export async function runScorecardJob(): Promise<ScorecardJobResult> {
  const recommendations = await prisma.recommendation.findMany({
    select: { id: true, symbol: true, action: true, generatedAt: true, userDecision: true },
  });
  if (recommendations.length === 0) return { skipped: true };

  const outcomes = await prisma.recommendationOutcome.findMany({
    select: { recommendationId: true, wasCorrect: true, alpha90d: true, action: true },
  });

  const metrics = computeScorecardMetrics(recommendations, outcomes);

  await prisma.recommendationScorecard.create({
    data: {
      totalRecommendations: recommendations.length,
      buyCount: metrics.buyCount,
      holdCount: metrics.holdCount,
      reduceCount: metrics.reduceCount,
      sellCount: metrics.sellCount,
      watchCount: metrics.watchCount,
      winRatePct: metrics.winRatePct,
      falsePositives: metrics.falsePositives,
      falseNegatives: metrics.falseNegatives,
      alphaVsSpyAvgPct: metrics.alphaVsSpyAvgPct,
      avgHoldingPeriodDays: metrics.avgHoldingPeriodDays,
      avgDrawdownPct: metrics.avgDrawdownPct,
      avgGainPct: metrics.avgGainPct,
      utilizationPct: metrics.utilizationPct,
      acceptanceRatePct: metrics.acceptanceRatePct,
      methodology: {
        winRatePct: 'Share of graded (criticalReviewedAt set) outcomes where wasCorrect=true.',
        falsePositives: 'BUY_MORE/HOLD calls graded incorrect.',
        falseNegatives: 'REDUCE/SELL calls graded incorrect.',
        alphaVsSpyAvgPct: 'Average alpha90d across all outcomes with that window elapsed.',
        avgHoldingPeriodDays:
          'PROXY — Atlas has no execution layer, so there is no real holding period. This is the average gap between successive recommendations for the same symbol (how often Atlas would revisit a position).',
        avgDrawdownPct: 'PROXY — average alpha90d magnitude across outcomes with negative alpha (not a true peak-to-trough drawdown, which would need the full daily path between recommendation and now).',
        avgGainPct: 'Average alpha90d across outcomes with positive alpha.',
        utilizationPct: '% of recommendations with any userDecision other than PENDING — did the user engage at all.',
        acceptanceRatePct: '% of decided (non-PENDING) recommendations that were ACCEPTED or PARTIALLY_ACCEPTED.',
        gradedSampleSize: metrics.gradedSampleSize,
      },
    },
  });

  return { skipped: false, totalRecommendations: recommendations.length, winRatePct: metrics.winRatePct };
}
