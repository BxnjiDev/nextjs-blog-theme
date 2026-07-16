import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { aiReasoningProvider } from '@/lib/integrations';

export interface RecommendationLearningResult {
  evaluated: number;
  errors: { symbol: string; error: string }[];
}

const DIRECTIONAL_BUY_ACTIONS = new Set(['BUY_MORE', 'HOLD']);
const DIRECTIONAL_SELL_ACTIONS = new Set(['REDUCE', 'SELL']);

/**
 * Grades every RecommendationOutcome that has reached its 90-day window but
 * hasn't been critiqued yet (criticalReviewedAt is null). This is a single
 * retrospective pass per recommendation — not re-litigated as later windows
 * (180d/365d) fill in — using the deterministic facts already computed by
 * trackRecommendationOutcomes.ts. "wasCorrect" is graded against alpha vs.
 * SPY (not raw return) since a rising market makes every BUY_MORE/HOLD call
 * look "right" by raw return alone. Claude is used only to write a grounded
 * reflection (lessonsLearned) from these facts — it never re-derives the
 * facts themselves.
 */
export async function runRecommendationLearningJob(): Promise<RecommendationLearningResult> {
  const result: RecommendationLearningResult = { evaluated: 0, errors: [] };

  const dueOutcomes = await prisma.recommendationOutcome.findMany({
    where: { return90d: { not: null }, criticalReviewedAt: null },
    include: { recommendation: { include: { holding: { include: { thesis: true } } } } },
  });

  for (const outcome of dueOutcomes) {
    try {
      const rec = outcome.recommendation;
      const thesis = rec.holding.thesis;

      let wasCorrect: boolean | null = null;
      if (outcome.alpha90d !== null) {
        if (DIRECTIONAL_BUY_ACTIONS.has(outcome.action)) wasCorrect = outcome.alpha90d > 0;
        else if (DIRECTIONAL_SELL_ACTIONS.has(outcome.action)) wasCorrect = outcome.alpha90d < 0;
      }

      let timingCorrect: boolean | null = null;
      if (outcome.return30d !== null && outcome.return90d !== null) {
        timingCorrect = (outcome.return30d >= 0) === (outcome.return90d >= 0);
      }

      let thesisCorrect: boolean | null = null;
      let thesisChangedSince: string | null = null;
      const assumptionsValidated: string[] = [];
      const assumptionsFailed: string[] = [];

      if (thesis) {
        const changeEventsSince = await prisma.thesisChangeEvent.findMany({
          where: { thesisId: thesis.id, createdAt: { gte: outcome.recommendedAt }, changeType: 'THESIS_CHANGED' },
          orderBy: { createdAt: 'asc' },
        });
        if (changeEventsSince.length === 0) {
          thesisCorrect = true;
          assumptionsValidated.push('Core thesis has not broken since this recommendation.');
        } else {
          const anyConvictionDrop = changeEventsSince.some(
            (e) => e.confidenceBefore !== null && e.confidenceAfter !== null && e.confidenceAfter < e.confidenceBefore
          );
          thesisCorrect = !anyConvictionDrop;
          for (const e of changeEventsSince) {
            if (e.whatChanged) assumptionsFailed.push(e.whatChanged);
          }
          thesisChangedSince = changeEventsSince.map((e) => e.whatChanged).filter(Boolean).join('; ') || 'Thesis changed (see timeline).';
        }
      }

      const sourcesMeta = (rec.sourcesMeta ?? {}) as Record<string, unknown>;
      const missingBits: string[] = [];
      if (sourcesMeta.fundamentalsAvailable === false) missingBits.push('fundamentals data was unavailable');
      if (sourcesMeta.filingsCount === 0) missingBits.push('no SEC filings were found');
      if (sourcesMeta.newsCount === 0) missingBits.push('no news was surfaced');
      const missingEvidence = missingBits.length > 0 ? `At recommendation time: ${missingBits.join('; ')}.` : null;

      const critique = await aiReasoningProvider.critiqueRecommendation({
        symbol: rec.symbol,
        action: rec.action,
        confidenceScore: rec.confidenceScore,
        thesisAtRecommendation: rec.thesis,
        expectedOutcome: rec.expectedOutcome,
        expectedTimeHorizon: rec.expectedTimeHorizon,
        wasCorrect,
        thesisCorrect,
        timingCorrect,
        return90d: outcome.return90d,
        alpha90d: outcome.alpha90d,
        thesisChangedSince,
        missingEvidence,
      });

      await prisma.recommendationOutcome.update({
        where: { id: outcome.id },
        data: {
          wasCorrect,
          thesisCorrect,
          timingCorrect,
          assumptionsValidated: assumptionsValidated.length > 0 ? assumptionsValidated : Prisma.JsonNull,
          assumptionsFailed: assumptionsFailed.length > 0 ? assumptionsFailed : Prisma.JsonNull,
          missingEvidence,
          lessonsLearned: critique.lessonsLearned,
          criticalReviewedAt: new Date(),
        },
      });
      result.evaluated++;
    } catch (err) {
      result.errors.push({ symbol: outcome.symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
