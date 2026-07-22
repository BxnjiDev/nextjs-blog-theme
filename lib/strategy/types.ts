import type { Tone } from '@/lib/theme/tone';
import type { InsightTier } from '@/lib/intelligence/types';
import type { Decision, DecisionFactor } from '@/lib/decision/types';

/**
 * How an opportunity is meant to be used — the brief's Trade
 * Classification list. This is framing on top of a Decision (see
 * lib/strategy/engine.ts's classifyStrategyType), never a second source
 * of truth for whether to act: the action itself still comes only from
 * lib/decision/engine.ts's buildDecision().
 */
export type StrategyType =
  | 'LONG_TERM_CORE'
  | 'LONG_TERM_GROWTH'
  | 'EVENT_DRIVEN_SWING'
  | 'TACTICAL_SWING'
  | 'RISK_REDUCTION'
  | 'REBALANCE'
  | 'WATCH_ONLY'
  | 'NO_ACTION';

export const STRATEGY_TYPE_LABEL: Record<StrategyType, string> = {
  LONG_TERM_CORE: 'Long-term core',
  LONG_TERM_GROWTH: 'Long-term growth',
  EVENT_DRIVEN_SWING: 'Event-driven swing',
  TACTICAL_SWING: 'Tactical swing',
  RISK_REDUCTION: 'Risk reduction',
  REBALANCE: 'Rebalance',
  WATCH_ONLY: 'Watch only',
  NO_ACTION: 'No action',
};

export const STRATEGY_TYPE_TONE: Record<StrategyType, Tone> = {
  LONG_TERM_CORE: 'positive',
  LONG_TERM_GROWTH: 'positive',
  EVENT_DRIVEN_SWING: 'info',
  TACTICAL_SWING: 'info',
  RISK_REDUCTION: 'warning',
  REBALANCE: 'warning',
  WATCH_ONLY: 'muted',
  NO_ACTION: 'muted',
};

/** The brief's three-tier distinction for a surfaced opportunity — never
 * a fourth scoring system: derived purely from the Decision's own
 * confidence/priority (see classifyOpportunityTier), just labeled the way
 * the brief asks an opportunity list to read. */
export type OpportunityTier = 'POTENTIAL' | 'QUALIFIED' | 'HIGH_CONVICTION';

export const OPPORTUNITY_TIER_LABEL: Record<OpportunityTier, string> = {
  POTENTIAL: 'Potential opportunity',
  QUALIFIED: 'Qualified opportunity',
  HIGH_CONVICTION: 'High-conviction opportunity',
};

export const OPPORTUNITY_TIER_TONE: Record<OpportunityTier, Tone> = {
  POTENTIAL: 'muted',
  QUALIFIED: 'info',
  HIGH_CONVICTION: 'positive',
};

/**
 * Technical confirmation, computed only from real price/volume history
 * this app already ingests (lib/integrations' HistoricalPricePoint —
 * close + volume, no intrabar high/low). Every sub-factor degrades to
 * `available: false` rather than a guessed reading when there isn't
 * enough history to support it. Shaped as DecisionFactor[] directly so it
 * drops into a Decision's `reasoning` array with no adapter needed.
 */
export interface TechnicalEvidence {
  factors: DecisionFactor[];
  /** True only when at least one sub-factor had real data — lets callers
   * (e.g. confidence adjustments) skip technical input entirely rather
   * than reasoning from an all-unavailable set. */
  available: boolean;
  /** Coarse net read across available factors — 'positive' (trend/
   * momentum/relative-strength aligned upward), 'negative' (aligned
   * downward), or 'neutral' (mixed or insufficient data). Never finer-
   * grained than the underlying factors support. */
  overallTone: Tone;
}

/**
 * A close-price proxy for an institutional demand area: a local low in
 * the closing-price series followed by a strong, sustained move away from
 * it. This is NOT built from true intrabar range, volume-at-price, or
 * order-flow data (this app doesn't ingest any of those) — it is
 * explicitly a lower-fidelity approximation, documented as such
 * everywhere it's surfaced, and per the brief, only ever used to add
 * confidence alongside other evidence — never returned as a standalone
 * buy signal.
 */
export interface DemandZone {
  priceLevel: number;
  formedAt: Date;
  /** % move away from priceLevel in the sessions immediately following —
   * the "strong impulsive move" the brief describes. */
  impulseMovePct: number;
  /** Whether the current price is back within a small band of priceLevel
   * — a "high-probability demand retest" candidate. */
  recentlyRetested: boolean;
}

/**
 * Higher-timeframe liquidity-sweep analysis (stop hunts, sweep-and-
 * reclaim structures) fundamentally requires intrabar high/low and ideally
 * order-flow/volume-at-price data. This app's HistoricalPricePoint only
 * carries daily close+volume, so this is honestly always unavailable
 * today rather than approximated from data too coarse to support it —
 * seams for a future intraday/OHLC provider without rewriting the
 * architecture (see lib/strategy/liquidity.ts).
 */
export interface LiquidityEvidence {
  available: false;
  note: string;
}

/**
 * A qualified setup the Market Monitoring Engine surfaces — built
 * entirely from an existing Decision (lib/decision/types.ts), never a
 * second recommendation-generation path. Every field below either comes
 * directly from that Decision or reframes it for the "opportunity" lens
 * (strategyType, expectedHoldingWindow, profitManagementGuidance).
 */
export interface EntryOpportunity {
  symbol: string;
  company: string;
  headline: string;
  strategyType: StrategyType;
  /** Plain-English restatement of the Decision's action in trade terms,
   * e.g. "Begin a position" / "Add to existing position" / "Trim". */
  tradeIntent: string;
  summary: string;
  evidence: string[];
  primaryRisks: string[];
  whyNow: string;
  whyNot: string;
  confidence: number;
  priority: InsightTier;
  reviewDate: Date | null;
  expectedHoldingWindow: string;
  invalidationConditions: string[];
  profitManagementGuidance: string;
  tier: OpportunityTier;
  /** The Decision this opportunity is framed from — kept on the object so
   * a caller can render the full "Show why" reasoning (technical/supply-
   * demand/etc factors) without a second fetch. */
  decision: Decision;
}
