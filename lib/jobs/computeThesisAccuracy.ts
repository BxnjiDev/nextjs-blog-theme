import { prisma } from '@/lib/prisma';
import { marketDataProvider } from '@/lib/integrations';
import { linearRiskScore } from '@/lib/domain/risk';

export interface ThesisAccuracyJobResult {
  processed: number;
  skippedTooNew: number;
  errors: { symbol: string; error: string }[];
}

const MIN_DAYS_SINCE_ESTABLISHED = 30;

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * Retrospective scoring of how well each thesis's narrative held up.
 * Components with no deterministic way to grade free text against
 * real-world events (catalystsAchievedPct, risksRealizedPct — matching
 * "expected a product launch" against what actually happened requires NLP
 * this app doesn't have) are left null and documented, exactly like the
 * conviction engine's qualitative categories.
 */
export async function runThesisAccuracyJob(): Promise<ThesisAccuracyJobResult> {
  const result: ThesisAccuracyJobResult = { processed: 0, skippedTooNew: 0, errors: [] };

  const theses = await prisma.thesis.findMany();

  for (const thesis of theses) {
    const daysSinceEstablished = Math.floor((Date.now() - thesis.establishedAt.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceEstablished < MIN_DAYS_SINCE_ESTABLISHED) {
      result.skippedTooNew++;
      continue;
    }

    try {
      const [convictionHistory, fundamentalHistory, priceHistory] = await Promise.all([
        prisma.convictionAssessment.findMany({ where: { thesisId: thesis.id }, orderBy: { generatedAt: 'asc' } }),
        prisma.fundamentalSnapshot.findMany({
          where: { symbol: thesis.symbol, periodType: 'QUARTERLY', reportDate: { gte: thesis.establishedAt } },
          orderBy: { reportDate: 'asc' },
        }),
        marketDataProvider.getHistoricalDaily(thesis.symbol, daysSinceEstablished + 10),
      ]);

      // --- Revenue accuracy: is growth accelerating, holding, or decelerating since the thesis was established? ---
      let revenueAccuracy: number | null = null;
      const revGrowthPoints = fundamentalHistory.map((f) => f.revenueGrowth).filter((v): v is number => v !== null);
      if (revGrowthPoints.length >= 2) {
        const [earliest, latest] = [revGrowthPoints[0], revGrowthPoints[revGrowthPoints.length - 1]];
        revenueAccuracy = latest >= earliest ? (latest > 0 ? 100 : 60) : latest > 0 ? 50 : 15;
      }

      // --- Margin accuracy: same pattern, net margin trend. ---
      let marginAccuracy: number | null = null;
      const marginPoints = fundamentalHistory.map((f) => f.netMargin).filter((v): v is number => v !== null);
      if (marginPoints.length >= 2) {
        const [earliest, latest] = [marginPoints[0], marginPoints[marginPoints.length - 1]];
        marginAccuracy = latest >= earliest ? (latest > 0 ? 100 : 60) : latest > 0 ? 50 : 15;
      }

      // --- Valuation accuracy: did an early "undervalued"/"overvalued" call align with subsequent price direction? ---
      let valuationAccuracy: number | null = null;
      const earlyValuation = convictionHistory.find((c) => c.valuation !== null)?.valuation ?? null;
      const asc = [...priceHistory].sort((a, b) => a.date.getTime() - b.date.getTime());
      const priceAtEstablished = asc[0]?.close ?? null;
      const latestPrice = asc[asc.length - 1]?.close ?? null;
      if (earlyValuation !== null && priceAtEstablished !== null && latestPrice !== null && priceAtEstablished > 0) {
        const priceReturn = (latestPrice - priceAtEstablished) / priceAtEstablished;
        const expectedDirection = earlyValuation >= 55 ? 1 : earlyValuation <= 45 ? -1 : 0;
        if (expectedDirection !== 0) {
          const alignment = expectedDirection * priceReturn;
          valuationAccuracy = linearRiskScore(alignment * 100, -10, 10);
        }
      }

      // --- Timing accuracy: did the conviction trend's direction match price's direction over the same window? ---
      let timingAccuracy: number | null = null;
      if (convictionHistory.length >= 2 && priceAtEstablished !== null && latestPrice !== null) {
        const convictionDelta = convictionHistory[convictionHistory.length - 1].overallScore - convictionHistory[0].overallScore;
        const priceDelta = latestPrice - priceAtEstablished;
        if (Math.abs(convictionDelta) < 3 || Math.abs(priceDelta) < 0.01) {
          timingAccuracy = 50;
        } else {
          timingAccuracy = Math.sign(convictionDelta) === Math.sign(priceDelta) ? 100 : 0;
        }
      }

      const components = { revenueAccuracy, marginAccuracy, catalystsAchievedPct: null, risksRealizedPct: null, valuationAccuracy, timingAccuracy };
      const scored = Object.values(components).filter((v): v is number => v !== null);
      const overallScore = scored.length > 0 ? clamp(scored.reduce((a, b) => a + b, 0) / scored.length) : 50;

      await prisma.thesisAccuracyScore.create({
        data: {
          thesisId: thesis.id,
          symbol: thesis.symbol,
          revenueAccuracy,
          marginAccuracy,
          catalystsAchievedPct: null,
          risksRealizedPct: null,
          valuationAccuracy,
          timingAccuracy,
          overallScore,
          methodology: {
            daysSinceEstablished,
            revenueAccuracy: 'Trend of YoY revenue growth since thesis establishment (accelerating/holding/decelerating).',
            marginAccuracy: 'Trend of net margin since thesis establishment.',
            catalystsAchievedPct: 'Unavailable — no deterministic way to match free-text catalysts against real-world events.',
            risksRealizedPct: 'Unavailable — same limitation as catalystsAchievedPct.',
            valuationAccuracy: 'Alignment between the earliest post-establishment valuation call (under/overvalued) and subsequent price direction.',
            timingAccuracy: 'Alignment between conviction-score trend direction and price trend direction over the same window.',
          },
        },
      });
      result.processed++;
    } catch (err) {
      result.errors.push({ symbol: thesis.symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
