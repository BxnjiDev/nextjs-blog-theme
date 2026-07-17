import type { RecommendedAction } from '@prisma/client';
import type { PortfolioOverview } from './portfolio';

/** Current portfolio weight by sector (0-100 scale), from the same
 * PortfolioOverview already fetched for position sizing — no extra fetch. */
export function computeSectorWeights(overview: PortfolioOverview): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const h of overview.holdings) {
    const sector = h.sector ?? 'Unclassified';
    const pct = overview.totalValue > 0 ? (h.marketValue / overview.totalValue) * 100 : 0;
    weights[sector] = (weights[sector] ?? 0) + pct;
  }
  return weights;
}

/** Deterministic — never routed through Claude. What the proposed dollar
 * amount would have returned held in SPY instead, over the same recent
 * lookback already used for vsCashAndSpy. */
export function computeOpportunityCost(proposedDollarAmount: number | null, spyRecentReturnPct: number | null): string {
  if (proposedDollarAmount === null || proposedDollarAmount <= 0) {
    return 'No capital proposed — opportunity cost does not apply.';
  }
  if (spyRecentReturnPct === null) {
    return 'SPY return data unavailable — opportunity cost cannot be computed.';
  }
  const spyDollarReturn = proposedDollarAmount * (spyRecentReturnPct / 100);
  return (
    `The proposed $${proposedDollarAmount.toFixed(0)} held in SPY instead, over the same recent lookback, would have ` +
    `${spyDollarReturn >= 0 ? 'returned +' : 'returned -'}$${Math.abs(spyDollarReturn).toFixed(0)} (${spyRecentReturnPct.toFixed(1)}%).`
  );
}

export interface PortfolioImpactInput {
  action: RecommendedAction;
  proposedDollarAmount: number | null;
  currentPositionMarketValue: number;
  totalPortfolioValue: number;
  /** Latest RiskAssessment.concentrationRisk on record, if any — reused,
   * never recomputed here (a full recompute belongs in the allocation
   * simulator, /simulator, where paying that cost interactively is worth it). */
  latestConcentrationRisk: number | null;
}

/** Deterministic — never routed through Claude. A quick concentration-
 * weight delta if this recommendation's proposed size were executed;
 * intentionally NOT a full risk-engine re-simulation (see /simulator for
 * that). */
export function computePortfolioImpact(input: PortfolioImpactInput): string {
  if (input.proposedDollarAmount === null || input.proposedDollarAmount === 0 || input.totalPortfolioValue <= 0) {
    return 'No capital proposed — portfolio impact does not apply.';
  }
  const currentWeightPct = (input.currentPositionMarketValue / input.totalPortfolioValue) * 100;
  const isBuy = input.action === 'BUY_MORE';
  const newMarketValue = isBuy
    ? input.currentPositionMarketValue + input.proposedDollarAmount
    : Math.max(0, input.currentPositionMarketValue - input.proposedDollarAmount);
  const newWeightPct = (newMarketValue / input.totalPortfolioValue) * 100;
  const concentrationNote =
    input.latestConcentrationRisk !== null
      ? ` Portfolio concentration risk was last measured at ${input.latestConcentrationRisk}/100 — a full before/after recompute is available in the allocation simulator (/simulator).`
      : ' No recent portfolio risk assessment on record — see /simulator for a full before/after recompute.';
  return (
    `This position's weight would move from ${currentWeightPct.toFixed(1)}% to ${newWeightPct.toFixed(1)}% of the portfolio ` +
    `if executed at the proposed size.${concentrationNote}`
  );
}
