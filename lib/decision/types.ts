import type { Tone } from '@/lib/theme/tone';
import type { InsightScores, InsightTier } from '@/lib/intelligence/types';

/**
 * The richer action vocabulary the brief asks for — a strict superset of
 * the underlying RecommendedAction enum (BUY_MORE/HOLD/REDUCE/SELL/WATCH),
 * which stays exactly as it is in the database (recommendation generation
 * and outcome grading still key off it). This vocabulary only exists in
 * the Decision Engine's read layer, where "buy more" needs to distinguish
 * adding to a position from starting one, and where Atlas needs states no
 * single AI-authored recommendation has: WAIT (a live call softened by
 * something that's changed since), GATHER_INFO (the data isn't good
 * enough to act on), and NO_ACTION (nothing to evaluate at all).
 */
export type DecisionAction = 'INCREASE' | 'INITIATE' | 'HOLD' | 'REDUCE' | 'EXIT' | 'WAIT' | 'GATHER_INFO' | 'NO_ACTION';

/** Co-located with DecisionAction (rather than in lib/theme/tone.ts, home
 * of the older RecommendedAction's ACTION_TONE/ACTION_LABEL) since this
 * vocabulary belongs to the Decision Engine specifically. */
export const DECISION_ACTION_TONE: Record<DecisionAction, Tone> = {
  INCREASE: 'positive',
  INITIATE: 'positive',
  HOLD: 'neutral',
  REDUCE: 'warning',
  EXIT: 'negative',
  WAIT: 'info',
  GATHER_INFO: 'muted',
  NO_ACTION: 'muted',
};

export const DECISION_ACTION_LABEL: Record<DecisionAction, string> = {
  INCREASE: 'Increase position',
  INITIATE: 'Begin position',
  HOLD: 'Continue holding',
  REDUCE: 'Reduce exposure',
  EXIT: 'Exit position',
  WAIT: 'Wait',
  GATHER_INFO: 'Gather more information',
  NO_ACTION: 'No action required',
};

/** One evaluated input to the decision — "thesis strength," "conviction,"
 * "risk," etc from the brief's Decision Framework. `available: false` means
 * exactly what it says: this app has no data source for that factor for
 * this symbol, and `summary` says so — never a fabricated read. */
export interface DecisionFactor {
  key: string;
  label: string;
  available: boolean;
  tone: Tone;
  summary: string;
}

/** One past recommendation in a symbol's decision history, action-diffed
 * against the one before it. Built by lib/decision/history.ts purely from
 * Recommendation rows that already exist — nothing new is persisted. */
export interface DecisionHistoryEntry {
  recommendationId: string;
  date: Date;
  action: string;
  actionLabel: string;
  confidenceScore: number;
  userDecision: string;
  /** True when this recommendation's action differs from the one
   * immediately before it for this symbol. */
  changedFromPrevious: boolean;
  /** The nearest ThesisChangeEvent's whatChanged/whyChanged between this
   * recommendation and the previous one, when a change actually occurred
   * in that window — the "why did the call change" the brief asks for. */
  changeReason: string | null;
  outcome: { wasCorrect: boolean | null; return30d: number | null; return90d: number | null; alpha90d: number | null } | null;
}

export interface Decision {
  symbol: string;
  isHeld: boolean;
  headline: string;
  summary: string;
  action: DecisionAction;
  actionLabel: string;
  tone: Tone;
  /** Structured per-factor reasoning — see lib/decision/engine.ts's
   * FACTOR_LABELS for the full set drawn from the brief's Decision
   * Framework (thesis strength, conviction, risk, valuation, concentration,
   * sector exposure, technical context, catalysts, news impact, earnings
   * timing, portfolio objectives). */
  reasoning: DecisionFactor[];
  evidence: string[];
  primaryRisks: string[];
  invalidationConditions: string[];
  confidence: number;
  confidenceReasoning: string[];
  scores: InsightScores;
  priority: InsightTier;
  expectedReviewDate: Date | null;
  basedOnRecommendationId: string | null;
  generatedAt: Date;
}
