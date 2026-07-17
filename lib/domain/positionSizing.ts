import type { RecommendedAction } from '@prisma/client';
import { EVALUATION_MAX_CAPITAL } from './evaluationConfig';

/** Ceiling on how much of the portfolio a single BUY_MORE suggestion will
 * propose, at maximum (10/10) confidence — deliberately conservative for a
 * small, manually-executed evaluation account. */
const MAX_BUY_FRACTION_OF_PORTFOLIO = 0.15;
/** Ceiling on how much of a position a single REDUCE suggestion will trim,
 * at maximum confidence. */
const MAX_REDUCE_FRACTION_OF_POSITION = 0.5;

export interface PositionSizingInput {
  action: RecommendedAction;
  confidenceScore: number; // 1-10
  cashBalance: number;
  totalPortfolioValue: number;
  currentPositionMarketValue: number;
  /** Whether this is the $500 evaluation account (Phase 3.7) — the
   * evaluation-capital ceiling and pending-commitment deductions below
   * only apply when true; a non-evaluation account is sized purely off
   * cash on hand, as before. */
  isEvaluationAccount?: boolean;
  /** Dollar amount already committed but not yet reflected in synced
   * cash/holdings: still-PENDING ManualExecution BUYs (the user says they
   * already bought, but the next Robinhood sync hasn't confirmed it yet)
   * plus open BUY orders (lib/domain/accountSyncPipeline.ts /
   * lib/jobs/generateRecommendations.ts compute this once per run and
   * pass it in — never re-derived here). Defaults to 0. */
  pendingCommittedDollarAmount?: number;
  /** Overridable for testing; defaults to the real evaluation cap. */
  evaluationMaxCapital?: number;
}

export interface PositionSizingResult {
  proposedDollarAmount: number | null;
  percentageOfPortfolio: number | null;
  note: string;
}

/**
 * Deterministic position sizing — no margin (never proposes spending more
 * than verified available cash), no shorting (REDUCE/SELL are capped at
 * the current position size). This is a suggestion for the user to size
 * manually, not an order Atlas will ever place; the confidence score
 * scales the suggestion linearly rather than the model inventing a dollar
 * figure.
 *
 * For the evaluation account specifically (Phase 3.7), a BUY_MORE proposal
 * additionally can never push total active exposure (current holdings
 * value + anything already committed but not yet synced) past the $500
 * ceiling, and "available cash" is verified cash minus those same pending
 * commitments — so Atlas never proposes spending money that's already
 * spoken for, even if Robinhood hasn't caught up yet.
 */
export function computeProposedPosition(input: PositionSizingInput): PositionSizingResult {
  const confidenceFraction = Math.max(0, Math.min(10, input.confidenceScore)) / 10;
  const pendingCommitted = input.pendingCommittedDollarAmount ?? 0;
  const verifiedAvailableCash = Math.max(0, input.cashBalance - pendingCommitted);

  if (input.action === 'BUY_MORE') {
    if (verifiedAvailableCash < 10) {
      return {
        proposedDollarAmount: 0,
        percentageOfPortfolio: 0,
        note:
          pendingCommitted > 0
            ? `Insufficient verified available cash — $${pendingCommitted.toFixed(0)} is already committed to pending (unreconciled) trades.`
            : 'Insufficient cash on hand to size a new purchase.',
      };
    }
    const targetFraction = confidenceFraction * MAX_BUY_FRACTION_OF_PORTFOLIO;
    let dollarAmount = Math.round(Math.min(targetFraction * input.totalPortfolioValue, verifiedAvailableCash));
    let note = `Sized at confidence (${input.confidenceScore}/10) × up to ${(MAX_BUY_FRACTION_OF_PORTFOLIO * 100).toFixed(0)}% of portfolio value, capped at verified available cash ($${verifiedAvailableCash.toFixed(0)}${pendingCommitted > 0 ? `, after $${pendingCommitted.toFixed(0)} in pending commitments` : ''}).`;

    if (input.isEvaluationAccount) {
      const cap = input.evaluationMaxCapital ?? EVALUATION_MAX_CAPITAL;
      const existingActiveExposure = Math.max(0, input.totalPortfolioValue - input.cashBalance) + pendingCommitted;
      const remainingCapacity = Math.max(0, cap - existingActiveExposure);
      if (dollarAmount > remainingCapacity) {
        dollarAmount = Math.round(remainingCapacity);
        note += ` Capped to $${remainingCapacity.toFixed(0)} remaining evaluation-account capacity (of the $${cap} ceiling; $${existingActiveExposure.toFixed(0)} already committed/in flight).`;
      }
    }

    return {
      proposedDollarAmount: dollarAmount,
      percentageOfPortfolio: input.totalPortfolioValue > 0 ? Math.round((dollarAmount / input.totalPortfolioValue) * 1000) / 10 : 0,
      note,
    };
  }

  if (input.action === 'REDUCE') {
    const trimFraction = confidenceFraction * MAX_REDUCE_FRACTION_OF_POSITION;
    const dollarAmount = Math.round(trimFraction * input.currentPositionMarketValue);
    return {
      proposedDollarAmount: dollarAmount,
      percentageOfPortfolio: input.totalPortfolioValue > 0 ? Math.round((dollarAmount / input.totalPortfolioValue) * 1000) / 10 : 0,
      note: `Trim sized at confidence (${input.confidenceScore}/10) × up to ${(MAX_REDUCE_FRACTION_OF_POSITION * 100).toFixed(0)}% of the current position.`,
    };
  }

  if (input.action === 'SELL') {
    const dollarAmount = Math.round(input.currentPositionMarketValue);
    return {
      proposedDollarAmount: dollarAmount,
      percentageOfPortfolio: input.totalPortfolioValue > 0 ? Math.round((dollarAmount / input.totalPortfolioValue) * 1000) / 10 : 0,
      note: 'Full current position value — SELL proposes closing the position entirely.',
    };
  }

  return { proposedDollarAmount: null, percentageOfPortfolio: null, note: 'No position size applies to HOLD/WATCH.' };
}
