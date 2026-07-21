import { ACTION_LABEL } from '@/lib/theme/tone';
import type { DecisionHistoryEntry } from './types';

export interface DecisionHistoryRecommendationInput {
  id: string;
  action: string;
  confidenceScore: number;
  generatedAt: Date;
  userDecision: string;
  outcome: { wasCorrect: boolean | null; return30d: number | null; return90d: number | null; alpha90d: number | null } | null;
}

export interface DecisionHistoryChangeInput {
  createdAt: Date;
  whatChanged: string | null;
  whyChanged: string | null;
}

/**
 * Diffs consecutive Recommendation rows for one symbol — already
 * append-only and never overwritten (see lib/domain/recommendationDecisions.ts,
 * which only ever updates userDecision/userDecisionAt in place, never the
 * investment content) — into a decision history: when the stated action
 * changed from one generation to the next, and, by finding the nearest
 * ThesisChangeEvent inside that window, why. This composes data every one
 * of those models already stores; nothing new is persisted here.
 */
export function buildDecisionHistory(
  recommendations: DecisionHistoryRecommendationInput[],
  changeEvents: DecisionHistoryChangeInput[]
): DecisionHistoryEntry[] {
  const ascending = [...recommendations].sort((a, b) => a.generatedAt.getTime() - b.generatedAt.getTime());

  const entries: DecisionHistoryEntry[] = ascending.map((rec, i) => {
    const previous = ascending[i - 1] ?? null;
    const changedFromPrevious = previous !== null && previous.action !== rec.action;

    let changeReason: string | null = null;
    if (changedFromPrevious && previous) {
      const windowStart = previous.generatedAt.getTime();
      const windowEnd = rec.generatedAt.getTime();
      const nearby = changeEvents
        .filter((e) => e.createdAt.getTime() > windowStart && e.createdAt.getTime() <= windowEnd)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      changeReason = nearby ? (nearby.whyChanged ?? nearby.whatChanged ?? null) : null;
    }

    return {
      recommendationId: rec.id,
      date: rec.generatedAt,
      action: rec.action,
      actionLabel: ACTION_LABEL[rec.action] ?? rec.action,
      confidenceScore: rec.confidenceScore,
      userDecision: rec.userDecision,
      changedFromPrevious,
      changeReason,
      outcome: rec.outcome,
    };
  });

  // Newest first — matches every recommendation-history table already in the app.
  return entries.reverse();
}
