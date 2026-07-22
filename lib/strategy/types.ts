import type { Tone } from '@/lib/theme/tone';
import type { InsightTier } from '@/lib/intelligence/types';
import type { Decision, DecisionFactor } from '@/lib/decision/types';
import type { FreshnessStatus, Interval } from '@/lib/marketdata/types';

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
 * A deterministic, OHLCV-derived candidate demand area: a base/
 * consolidation structure at a swing low, followed by a strong impulsive
 * departure, scored by volume expansion, prior reaction count, freshness,
 * and current mitigation state. This is a price-structure inference from
 * real candle data (lib/strategy/supplyDemand.ts) — never a claim of
 * knowledge about actual institutional orders. Language everywhere this
 * is surfaced stays deliberately careful ("potential demand zone," "area
 * of prior strong buying response") and, per the brief, this is only ever
 * used to add confidence alongside other evidence — never returned as a
 * standalone buy signal.
 */
export interface DemandZone {
  /** The zone's lower bound (the base candle(s)' wick low) — kept as the
   * primary "priceLevel" so existing confidence/messaging logic that only
   * needs one reference price doesn't need the full range. */
  priceLevel: number;
  /** The zone's upper bound (the base candle(s)' body high, excluding
   * upper wicks — the area price actually consolidated in, not the noise
   * above it). */
  priceHigh: number;
  formedAt: Date;
  timeframe: Interval;
  /** % move away from the zone in the candles immediately following — the
   * "impulsive departure" the brief describes. */
  impulseMovePct: number;
  /** Departure-leg average volume ÷ base-candle(s) average volume — volume
   * expansion during the move away from the zone, not proof of who was
   * buying. */
  volumeExpansionRatio: number;
  /** How many times price has returned to the zone and reacted (bounced)
   * since it formed, before any mitigation. */
  priorReactionCount: number;
  /** True once a later candle has CLOSED below the zone's low — the zone
   * is no longer active/tradable once mitigated (identifyDemandZones
   * excludes mitigated zones from its returned list entirely). */
  mitigated: boolean;
  /** Current price is back within a small band of the zone and it is not
   * mitigated — a "high-probability demand retest" candidate. */
  recentlyRetested: boolean;
  /** Signed % distance of the latest close from the zone's midpoint —
   * positive means price is currently above the zone. */
  distanceFromPricePct: number;
  /** 0-100 deterministic composite of impulse strength, volume expansion,
   * prior-reaction count, and freshness — never a certainty score. */
  qualityScore: number;
  /** A ready-to-render, carefully-worded explanation — see
   * lib/strategy/supplyDemand.ts's describeZone. */
  description: string;
}

/**
 * Careful classification of a candidate liquidity sweep — deliberately
 * never stronger language than the OHLC evidence supports. `potential`
 * and `awaiting_confirmation` are intentionally non-committal; only
 * `confirmed_sweep_reclaim` implies the reclaim held with follow-through.
 */
export type LiquiditySweepClassification = 'potential_sweep' | 'awaiting_confirmation' | 'confirmed_sweep_reclaim' | 'failed_sweep';

export const LIQUIDITY_CLASSIFICATION_LABEL: Record<LiquiditySweepClassification, string> = {
  potential_sweep: 'Potential sweep',
  awaiting_confirmation: 'Sweep awaiting confirmation',
  confirmed_sweep_reclaim: 'Confirmed sweep-and-reclaim',
  failed_sweep: 'Failed sweep',
};

export const LIQUIDITY_CLASSIFICATION_TONE: Record<LiquiditySweepClassification, Tone> = {
  potential_sweep: 'neutral',
  awaiting_confirmation: 'info',
  confirmed_sweep_reclaim: 'positive',
  failed_sweep: 'muted',
};

/**
 * One candidate liquidity-sweep event — a swing high/low that price
 * traded through and either reclaimed (closed back within structure) or
 * didn't. Built entirely from OHLCV candles (lib/strategy/liquidity.ts) —
 * explicitly labeled price-structure inference throughout; this app has
 * no order-flow, resting-liquidity, or institutional-positioning data
 * source, and never claims to.
 */
export interface LiquiditySweepEvent {
  classification: LiquiditySweepClassification;
  /** `sell_side` = swept a prior swing LOW (stop-loss/sell liquidity
   * resting below it); `buy_side` = swept a prior swing HIGH. */
  direction: 'buy_side' | 'sell_side';
  sweptLevel: number;
  sweepCandleTime: Date;
  timeframe: Interval;
  wickToBodyRatio: number;
  volumeConfirmed: boolean;
  followThroughConfirmed: boolean;
  description: string;
}

/**
 * Higher-timeframe liquidity-sweep analysis. Requires real intrabar
 * high/low (and ideally volume) — now available via lib/marketdata's
 * Candle model, so this is no longer permanently unavailable the way it
 * was when this app only had daily close+volume. Still explicitly a
 * price-structure inference, never a claim about actual order flow or
 * resting liquidity (this app has no such data source).
 */
export interface LiquidityEvidence {
  available: boolean;
  /** Most recent/significant sweep candidates found, newest first — empty
   * when available but nothing qualifies as a sweep right now. */
  events: LiquiditySweepEvent[];
  note: string;
}

/**
 * Per-timeframe technical read — see lib/strategy/multiTimeframe.ts, which
 * computes one of these for every interval the caller has candles for by
 * reusing computeTechnicalEvidence/identifyDemandZones/detectLiquidityEvidence
 * unchanged, never a second technical-analysis implementation.
 */
export interface TimeframeTechnicalSnapshot {
  timeframe: Interval;
  evidence: TechnicalEvidence;
  demandZones: DemandZone[];
  liquidityEvidence: LiquidityEvidence;
}

/** A specific pair of timeframes whose technical read directly disagrees
 * (one positive, one negative) — the brief's "a bullish 30-minute signal
 * must not override a bearish weekly structure without explicitly
 * identifying the conflict." */
export interface TimeframeConflict {
  higherTimeframe: Interval;
  lowerTimeframe: Interval;
  higherTone: Tone;
  lowerTone: Tone;
  description: string;
}

/**
 * The four timeframe "roles" every Decision should be able to name
 * separately, per the brief. lib/strategy/multiTimeframe.ts returns one
 * canonical assignment (not re-derived per strategy type) — callers that
 * already know the strategy type (lib/decision/engine.ts, EntryOpportunity
 * framing) can relabel/weight these roles for display without this
 * costing a second timeframe-role concept.
 */
export interface TimeframeRoles {
  longTermThesisTimeframe: Interval;
  swingSetupTimeframe: Interval;
  entryTimeframe: Interval;
  invalidationTimeframe: Interval;
}

export const DEFAULT_TIMEFRAME_ROLES: TimeframeRoles = {
  longTermThesisTimeframe: '1W',
  swingSetupTimeframe: '4h',
  entryTimeframe: '30m',
  invalidationTimeframe: '4h',
};

/**
 * The full multi-timeframe technical context for one symbol — every
 * available timeframe's snapshot, any cross-timeframe conflicts found,
 * and a weighted composite tone (higher timeframes weighted more heavily,
 * so a bearish weekly is never washed out by a neutral or mildly bullish
 * intraday reading). Built by lib/strategy/multiTimeframe.ts.
 */
export interface MultiTimeframeContext {
  snapshots: TimeframeTechnicalSnapshot[];
  roles: TimeframeRoles;
  conflicts: TimeframeConflict[];
  hasConflict: boolean;
  overallTone: Tone;
}

/** Live/latest-available price context for an opportunity — always
 * labeled with its real freshness (see lib/marketdata/types.ts's
 * FreshnessStatus), never presented as more current than it is. */
export interface EntryOpportunityPriceContext {
  latestPrice: number | null;
  freshness: FreshnessStatus;
  asOf: Date | null;
}

/** A price RANGE, never a single exact price — the brief is explicit that
 * an opportunity should avoid claiming precision the evidence doesn't
 * support. Derived from an actual DemandZone when one exists and the call
 * is bullish; null when there's no zone to frame an entry area around. */
export interface EntryOpportunityArea {
  low: number;
  high: number;
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
  price: EntryOpportunityPriceContext;
  /** Which of the five supported intervals is most relevant to how this
   * opportunity was framed — the chart opens on this timeframe by
   * default. Long-term core/growth opportunities default to a higher
   * timeframe than event-driven/tactical swings. */
  preferredTimeframe: Interval;
  /** A range, not a point — null when no supportive demand zone exists to
   * frame one around (never invented). */
  potentialEntryArea: EntryOpportunityArea | null;
  /** Signed % from the latest price to the nearest edge of
   * potentialEntryArea — null whenever potentialEntryArea is null. */
  distanceToEntryPct: number | null;
  /** The nearest/most relevant demand zone behind this opportunity, if
   * any — the same DemandZone lib/strategy/supplyDemand.ts produced,
   * exposed structurally (not just as reasoning text) so a chart can
   * render it directly. */
  demandZoneContext: DemandZone | null;
  /** The most relevant liquidity-sweep event, if any. */
  liquidityContext: LiquiditySweepEvent | null;
  /** Trend-structure and volume-confirmation factor summaries, pulled
   * from the Decision's own reasoning (never recomputed) — the brief's
   * "trend structure" / "volume context" fields. */
  trendStructureSummary: string | null;
  volumeContextSummary: string | null;
  /** What actually triggers the next look at this opportunity — the
   * nearest of an upcoming earnings date, the Decision's own review date,
   * or (absent either) the next scheduled watchlist scan. */
  nextReviewTrigger: string;
  /** The Decision this opportunity is framed from — kept on the object so
   * a caller can render the full "Show why" reasoning (technical/supply-
   * demand/etc factors) without a second fetch. */
  decision: Decision;
}
