import type { Decision, DecisionAction } from '@/lib/decision/types';
import type { EntryOpportunity, OpportunityTier, StrategyType } from './types';

/**
 * The brief's explicit long-term focus universe. Membership here only
 * ever affects *framing* (which StrategyType an opportunity is labeled
 * as) — it never changes whether Atlas recommends acting, which still
 * comes exclusively from lib/decision/engine.ts's buildDecision().
 */
export const MAGNIFICENT_SEVEN = new Set(['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA']);
const LONG_TERM_FOCUS_SECTOR_KEYWORDS = ['technology', 'defense', 'aerospace', 'energy', 'semiconductor', 'software'];

function isLongTermFocus(symbol: string, sector: string | null): boolean {
  if (MAGNIFICENT_SEVEN.has(symbol.toUpperCase())) return true;
  if (!sector) return false;
  const s = sector.toLowerCase();
  return LONG_TERM_FOCUS_SECTOR_KEYWORDS.some((k) => s.includes(k));
}

/**
 * Maps a Decision onto the brief's Trade Classification list. Reads the
 * Decision's action, confidence reasoning, and this symbol's
 * sector/index membership — never recomputes or second-guesses the
 * action itself.
 */
export function classifyStrategyType(decision: Decision, sector: string | null, hasNearCatalyst: boolean): StrategyType {
  const { action, symbol } = decision;

  if (action === 'REDUCE' || action === 'EXIT') return 'RISK_REDUCTION';
  if (action === 'NO_ACTION') return 'NO_ACTION';
  if (action === 'WAIT' || action === 'GATHER_INFO') return 'WATCH_ONLY';

  if (action === 'HOLD') {
    const concentrationOverride = decision.confidenceReasoning.some((r) => r.toLowerCase().includes('concentrat')) || decision.summary.toLowerCase().includes('concentrat');
    if (concentrationOverride) return 'REBALANCE';
    return isLongTermFocus(symbol, sector) ? 'LONG_TERM_CORE' : 'WATCH_ONLY';
  }

  // INCREASE or INITIATE from here.
  if (isLongTermFocus(symbol, sector)) {
    return MAGNIFICENT_SEVEN.has(symbol.toUpperCase()) ? 'LONG_TERM_CORE' : 'LONG_TERM_GROWTH';
  }
  return hasNearCatalyst ? 'EVENT_DRIVEN_SWING' : 'TACTICAL_SWING';
}

/**
 * The brief's three-tier distinction — derived purely from the Decision's
 * own confidence and priority, never a parallel score.
 */
export function classifyOpportunityTier(decision: Decision): OpportunityTier {
  if (decision.action === 'NO_ACTION') return 'POTENTIAL';
  const highPriority = decision.priority === 'critical' || decision.priority === 'high';
  if (decision.confidence >= 75 && highPriority) return 'HIGH_CONVICTION';
  if (decision.confidence >= 55) return 'QUALIFIED';
  return 'POTENTIAL';
}

const TRADE_INTENT: Record<DecisionAction, string> = {
  INCREASE: 'Add to the existing position.',
  INITIATE: 'Begin a new position.',
  HOLD: 'Continue holding as-is.',
  REDUCE: 'Trim the existing position.',
  EXIT: 'Exit the position entirely.',
  WAIT: 'Hold off until conditions improve.',
  GATHER_INFO: 'Gather more information before acting.',
  NO_ACTION: 'No action.',
};

const HOLDING_WINDOW: Record<StrategyType, string> = {
  LONG_TERM_CORE: '6+ months, reviewed quarterly alongside thesis updates.',
  LONG_TERM_GROWTH: '6+ months, reviewed quarterly alongside thesis updates.',
  EVENT_DRIVEN_SWING: 'Days to a few months — until the catalyst plays out or the thesis changes.',
  TACTICAL_SWING: 'Days to a few months — reassessed at each thesis or technical shift.',
  RISK_REDUCTION: 'Immediate — this is an exposure reduction, not a new holding period.',
  REBALANCE: 'Immediate — a sizing adjustment within the existing position.',
  WATCH_ONLY: 'No position — monitoring only.',
  NO_ACTION: 'Not applicable.',
};

const PROFIT_GUIDANCE: Record<StrategyType, string> = {
  LONG_TERM_CORE: 'No fixed price target — hold through ordinary volatility and revisit only if the thesis materially changes.',
  LONG_TERM_GROWTH: 'No fixed price target — hold through ordinary volatility and revisit only if the thesis materially changes.',
  EVENT_DRIVEN_SWING: 'Consider taking profits once the original catalyst has largely played out or supporting evidence weakens — not a fixed price target.',
  TACTICAL_SWING: 'Consider trimming once the setup that justified this trade has largely resolved.',
  RISK_REDUCTION: 'Reduce methodically rather than all at once, unless an invalidation condition has already triggered.',
  REBALANCE: 'Trim back toward a comfortable position size rather than exiting the position entirely.',
  WATCH_ONLY: 'Not applicable — no position held.',
  NO_ACTION: 'Not applicable.',
};

/**
 * Builds an Entry Opportunity entirely from an existing Decision — no
 * action, confidence, evidence, risk, or invalidation condition is
 * recomputed here; this only adds the strategy-classification framing
 * (strategyType/tradeIntent/expectedHoldingWindow/profitManagementGuidance)
 * the brief's opportunity-list view needs on top of what buildDecision()
 * already produced. Returns null only for NO_ACTION, where there is
 * nothing to frame as an opportunity at all.
 */
export function buildEntryOpportunity(decision: Decision, company: string, sector: string | null, hasNearCatalyst: boolean): EntryOpportunity | null {
  if (decision.action === 'NO_ACTION') return null;

  const strategyType = classifyStrategyType(decision, sector, hasNearCatalyst);
  const tier = classifyOpportunityTier(decision);

  return {
    symbol: decision.symbol,
    company,
    headline: decision.headline,
    strategyType,
    tradeIntent: TRADE_INTENT[decision.action],
    summary: decision.summary,
    evidence: decision.evidence,
    primaryRisks: decision.primaryRisks,
    whyNow: decision.summary,
    whyNot: decision.primaryRisks[0] ?? 'No material argument against this call was found in the available evidence.',
    confidence: decision.confidence,
    priority: decision.priority,
    reviewDate: decision.expectedReviewDate,
    expectedHoldingWindow: HOLDING_WINDOW[strategyType],
    invalidationConditions: decision.invalidationConditions,
    profitManagementGuidance: PROFIT_GUIDANCE[strategyType],
    tier,
    decision,
  };
}
