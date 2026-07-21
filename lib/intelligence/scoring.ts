import type { Insight, InsightScores, InsightTier } from './types';

/**
 * The one place an Insight's five independent scores collapse into a
 * single ordering number. Weighted toward importance and urgency (what
 * should surface first is "matters a lot" and/or "matters soon"), with
 * confidence and impact as secondary weight and freshness a light tie-
 * breaker — a fact Atlas is unsure of, or one with little actual portfolio
 * effect, shouldn't outrank a clear, high-impact one just for being new.
 */
export function computePriorityScore(scores: InsightScores): number {
  const raw =
    scores.importance * 0.32 +
    scores.urgency * 0.28 +
    scores.impact * 0.2 +
    scores.confidence * 0.15 +
    scores.freshness * 0.05;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Four tiers over the same 0-100 priority score, distinct from
 * lib/theme/tone.ts's scoreTone() boundaries (that function answers "is
 * this number good or bad"; this answers "how much attention does this
 * deserve"). A separate, higher urgency floor lets a time-critical-but-
 * moderate-importance fact (earnings tomorrow on a small position) still
 * reach "high" rather than being buried under importance-only sorting.
 */
export function computeTier(scores: InsightScores, priorityScore: number): InsightTier {
  if (priorityScore >= 78 || (scores.urgency >= 90 && scores.importance >= 50)) return 'critical';
  if (priorityScore >= 55 || scores.urgency >= 75) return 'high';
  if (priorityScore >= 32) return 'medium';
  return 'low';
}

export const TIER_ORDER: Record<InsightTier, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Finishes an insight built with everything except tier/priorityScore —
 * the single seam every generator in engine.ts calls through, so tier and
 * priorityScore can never be set inconsistently by hand. */
export function finalizeInsight(insight: Omit<Insight, 'tier' | 'priorityScore'>): Insight {
  const priorityScore = computePriorityScore(insight.scores);
  const tier = computeTier(insight.scores, priorityScore);
  return { ...insight, tier, priorityScore };
}

/** Highest priority first; ties broken by tier order, then by importance,
 * so two same-priority-score insights never sort by insertion order alone. */
export function sortByPriority(insights: Insight[]): Insight[] {
  return [...insights].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    if (TIER_ORDER[a.tier] !== TIER_ORDER[b.tier]) return TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    return b.scores.importance - a.scores.importance;
  });
}
