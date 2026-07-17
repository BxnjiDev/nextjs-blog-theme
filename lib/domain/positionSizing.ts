import type { RecommendedAction } from '@prisma/client';

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
}

export interface PositionSizingResult {
  proposedDollarAmount: number | null;
  percentageOfPortfolio: number | null;
  note: string;
}

/**
 * Deterministic position sizing — no margin (never proposes spending more
 * than cash on hand), no shorting (REDUCE/SELL are capped at the current
 * position size). This is a suggestion for the user to size manually, not
 * an order Atlas will ever place; the confidence score scales the
 * suggestion linearly rather than the model inventing a dollar figure.
 */
export function computeProposedPosition(input: PositionSizingInput): PositionSizingResult {
  const confidenceFraction = Math.max(0, Math.min(10, input.confidenceScore)) / 10;

  if (input.action === 'BUY_MORE') {
    if (input.cashBalance < 10) {
      return { proposedDollarAmount: 0, percentageOfPortfolio: 0, note: 'Insufficient cash on hand to size a new purchase.' };
    }
    const targetFraction = confidenceFraction * MAX_BUY_FRACTION_OF_PORTFOLIO;
    const dollarAmount = Math.round(Math.min(targetFraction * input.totalPortfolioValue, input.cashBalance));
    return {
      proposedDollarAmount: dollarAmount,
      percentageOfPortfolio: input.totalPortfolioValue > 0 ? Math.round((dollarAmount / input.totalPortfolioValue) * 1000) / 10 : 0,
      note: `Sized at confidence (${input.confidenceScore}/10) × up to ${(MAX_BUY_FRACTION_OF_PORTFOLIO * 100).toFixed(0)}% of portfolio value, capped at available cash.`,
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
