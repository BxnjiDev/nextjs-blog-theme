import { prisma } from '@/lib/prisma';
import { marketDataProvider } from '@/lib/integrations';
import type { HistoricalPricePoint } from '@/lib/integrations';

export interface OutcomeJobResult {
  created: number;
  updated: number;
  errors: { symbol: string; error: string }[];
}

const WINDOWS = [30, 90, 180, 365] as const;

/** Closing price on the most recent trading day at or before `targetDate`. */
function closePriceOnOrBefore(history: HistoricalPricePoint[], targetDate: Date): number | null {
  const asc = [...history].sort((a, b) => a.date.getTime() - b.date.getTime());
  let result: number | null = null;
  for (const p of asc) {
    if (p.date.getTime() <= targetDate.getTime()) result = p.close;
    else break;
  }
  return result;
}

/**
 * Performance attribution: for every Recommendation without an outcome
 * row yet, anchors a price/SPY snapshot at the recommendation date. For
 * existing outcome rows, fills in each 30/90/180/365-day window once that
 * much real time has actually elapsed — there is no way to backfill a
 * 365-day return before 365 days pass, so windows legitimately stay null
 * until then. Idempotent: already-computed windows are never recomputed,
 * and a recommendation can only ever get one outcome row (unique FK).
 */
export async function runRecommendationOutcomesJob(): Promise<OutcomeJobResult> {
  const result: OutcomeJobResult = { created: 0, updated: 0, errors: [] };

  const withoutOutcome = await prisma.recommendation.findMany({
    where: { outcome: null },
    orderBy: { generatedAt: 'asc' },
  });

  for (const rec of withoutOutcome) {
    try {
      const daysSinceRec = Math.floor((Date.now() - rec.generatedAt.getTime()) / (1000 * 60 * 60 * 24));
      const lookback = Math.max(30, daysSinceRec + 10);
      const [history, sp500History] = await Promise.all([
        marketDataProvider.getHistoricalDaily(rec.symbol, lookback),
        marketDataProvider.getSp500History(lookback),
      ]);
      const priceAtRec = closePriceOnOrBefore(history, rec.generatedAt);
      const sp500AtRec = closePriceOnOrBefore(sp500History, rec.generatedAt);
      if (priceAtRec === null || sp500AtRec === null) continue; // not enough history to anchor yet

      await prisma.recommendationOutcome.create({
        data: {
          recommendationId: rec.id,
          symbol: rec.symbol,
          action: rec.action,
          confidenceScore: rec.confidenceScore,
          recommendedAt: rec.generatedAt,
          priceAtRecommendation: priceAtRec,
          sp500AtRecommendation: sp500AtRec,
        },
      });
      result.created++;
    } catch (err) {
      result.errors.push({ symbol: rec.symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const pending = await prisma.recommendationOutcome.findMany({
    where: { OR: [{ return30d: null }, { return90d: null }, { return180d: null }, { return365d: null }] },
  });

  for (const outcome of pending) {
    try {
      const daysSinceRec = Math.floor((Date.now() - outcome.recommendedAt.getTime()) / (1000 * 60 * 60 * 24));
      const dueWindows = WINDOWS.filter((w) => daysSinceRec >= w);
      if (dueWindows.length === 0) continue;

      const maxDays = Math.max(...dueWindows);
      const [history, sp500History] = await Promise.all([
        marketDataProvider.getHistoricalDaily(outcome.symbol, maxDays + 10),
        marketDataProvider.getSp500History(maxDays + 10),
      ]);

      const priceAtRec = Number(outcome.priceAtRecommendation);
      const sp500AtRec = Number(outcome.sp500AtRecommendation);

      let return30d = outcome.return30d;
      let sp500Return30d = outcome.sp500Return30d;
      let alpha30d = outcome.alpha30d;
      let return90d = outcome.return90d;
      let sp500Return90d = outcome.sp500Return90d;
      let alpha90d = outcome.alpha90d;
      let return180d = outcome.return180d;
      let sp500Return180d = outcome.sp500Return180d;
      let alpha180d = outcome.alpha180d;
      let return365d = outcome.return365d;
      let sp500Return365d = outcome.sp500Return365d;
      let alpha365d = outcome.alpha365d;
      let anyUpdated = false;

      for (const window of dueWindows) {
        const targetDate = new Date(outcome.recommendedAt.getTime() + window * 24 * 60 * 60 * 1000);
        const price = closePriceOnOrBefore(history, targetDate);
        const sp500 = closePriceOnOrBefore(sp500History, targetDate);
        if (price === null || sp500 === null) continue;

        const ret = ((price - priceAtRec) / priceAtRec) * 100;
        const spRet = ((sp500 - sp500AtRec) / sp500AtRec) * 100;
        const alpha = ret - spRet;

        if (window === 30 && return30d === null) {
          return30d = ret;
          sp500Return30d = spRet;
          alpha30d = alpha;
          anyUpdated = true;
        } else if (window === 90 && return90d === null) {
          return90d = ret;
          sp500Return90d = spRet;
          alpha90d = alpha;
          anyUpdated = true;
        } else if (window === 180 && return180d === null) {
          return180d = ret;
          sp500Return180d = spRet;
          alpha180d = alpha;
          anyUpdated = true;
        } else if (window === 365 && return365d === null) {
          return365d = ret;
          sp500Return365d = spRet;
          alpha365d = alpha;
          anyUpdated = true;
        }
      }

      if (anyUpdated) {
        await prisma.recommendationOutcome.update({
          where: { id: outcome.id },
          data: {
            return30d,
            sp500Return30d,
            alpha30d,
            return90d,
            sp500Return90d,
            alpha90d,
            return180d,
            sp500Return180d,
            alpha180d,
            return365d,
            sp500Return365d,
            alpha365d,
            lastEvaluatedAt: new Date(),
          },
        });
        result.updated++;
      }
    } catch (err) {
      result.errors.push({ symbol: outcome.symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
