import type { Tone } from '@/lib/theme/tone';

/**
 * The shared vocabulary every page-specific insight generator in
 * lib/intelligence/engine.ts speaks, and every InsightCard/InsightStack
 * renders. One shape for "portfolio health changed," "a recommendation is
 * pending," "a thesis shifted," "this reallocation raises risk" — so the
 * UI layer never special-cases which domain an insight came from.
 */
export type InsightCategory =
  | 'portfolio_health'
  | 'risk'
  | 'recommendation'
  | 'thesis_change'
  | 'earnings'
  | 'market_context'
  | 'timeline_event'
  | 'simulation'
  | 'comparison';

/** Four tiers, not the three `scoreTone` uses for "is this number good or
 * bad" — this is a separate judgment ("how much does this deserve my
 * attention right now"), so it gets its own boundaries in scoring.ts
 * rather than overloading scoreTone's. */
export type InsightTier = 'critical' | 'high' | 'medium' | 'low';

/**
 * Every score is 0-100 and independently meaningful — deliberately NOT
 * collapsed into one another, so a low-confidence-but-critical insight
 * (e.g. an early, thin-data warning) still reads differently from a
 * high-confidence-but-low-importance one (a routine, well-understood
 * event). computePriorityScore() in scoring.ts is the only place these
 * combine into a single ordering number.
 */
export interface InsightScores {
  /** How much this matters to the portfolio if it's true — magnitude of
   * consequence, independent of how sure Atlas is or how soon it matters. */
  importance: number;
  /** How sure Atlas is, given the data behind it — a proxy-based read
   * (e.g. days-since-filing standing in for days-to-earnings) scores lower
   * than a direct one, and small samples never claim high confidence. */
  confidence: number;
  /** How time-sensitive — an earnings date three days out is more urgent
   * than the same fact 90 days out, independent of importance. */
  urgency: number;
  /** Magnitude of actual portfolio effect (position size, score delta) —
   * distinct from importance: a thesis change on a 1%-of-portfolio holding
   * is important context but low impact. */
  impact: number;
  /** How recent the underlying event/data is, 100 = just happened, decaying
   * toward 0 as it ages — keeps stale-but-still-true facts from crowding
   * out what actually changed recently. */
  freshness: number;
}

/**
 * Progressive-disclosure content for the "Show Why" interaction. Every
 * field is optional — an insight only fills in what it actually has;
 * InsightCard never renders an empty section. Nothing here is invented:
 * every string traces back to a field a domain engine already computed
 * (a RiskResult component's `explanation`, a ThesisChangeEvent's
 * `whyChanged`, etc) — this type only gives that existing text a place to
 * live in the progressive-disclosure UI.
 */
export interface InsightReasoning {
  evidence?: string[];
  signals?: string[];
  supportingData?: string[];
  portfolioImpact?: string;
  riskFactors?: string[];
  recentChanges?: string[];
  confidenceReasoning?: string;
}

export interface Insight {
  /** Stable within one render — used as React key and for dedup, not
   * persisted anywhere. */
  id: string;
  category: InsightCategory;
  /** Derived by scoring.ts from `scores` — never set directly by a
   * generator, so tier and priorityScore can never drift apart. */
  tier: InsightTier;
  priorityScore: number;
  tone: Tone;
  /** What happened — one line, plain statement of fact. */
  headline: string;
  /** Why it matters — one or two sentences of interpretation, not a
   * restatement of the headline. */
  interpretation: string;
  /** What Atlas recommends, if anything — omitted rather than padded with
   * a generic "monitor this" when there's genuinely no action to suggest. */
  recommendation?: string;
  scores: InsightScores;
  reasoning: InsightReasoning;
  href?: string;
  symbol?: string;
}
