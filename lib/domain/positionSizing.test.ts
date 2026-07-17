import { describe, it, expect } from 'vitest';
import { computeProposedPosition } from './positionSizing';

describe('computeProposedPosition', () => {
  it('proposes nothing for HOLD/WATCH', () => {
    for (const action of ['HOLD', 'WATCH'] as const) {
      const result = computeProposedPosition({
        action,
        confidenceScore: 8,
        cashBalance: 10000,
        totalPortfolioValue: 100000,
        currentPositionMarketValue: 5000,
      });
      expect(result.proposedDollarAmount).toBeNull();
      expect(result.percentageOfPortfolio).toBeNull();
    }
  });

  it('never proposes a BUY_MORE larger than cash on hand', () => {
    const result = computeProposedPosition({
      action: 'BUY_MORE',
      confidenceScore: 10,
      cashBalance: 500,
      totalPortfolioValue: 100000,
      currentPositionMarketValue: 0,
    });
    expect(result.proposedDollarAmount).toBeLessThanOrEqual(500);
  });

  it('scales BUY_MORE size linearly with confidence', () => {
    const low = computeProposedPosition({
      action: 'BUY_MORE',
      confidenceScore: 2,
      cashBalance: 100000,
      totalPortfolioValue: 100000,
      currentPositionMarketValue: 0,
    });
    const high = computeProposedPosition({
      action: 'BUY_MORE',
      confidenceScore: 10,
      cashBalance: 100000,
      totalPortfolioValue: 100000,
      currentPositionMarketValue: 0,
    });
    expect(high.proposedDollarAmount!).toBeGreaterThan(low.proposedDollarAmount!);
  });

  it('proposes zero for BUY_MORE with insufficient cash', () => {
    const result = computeProposedPosition({
      action: 'BUY_MORE',
      confidenceScore: 10,
      cashBalance: 5,
      totalPortfolioValue: 100000,
      currentPositionMarketValue: 0,
    });
    expect(result.proposedDollarAmount).toBe(0);
  });

  it('never trims a REDUCE by more than the current position value', () => {
    const result = computeProposedPosition({
      action: 'REDUCE',
      confidenceScore: 10,
      cashBalance: 0,
      totalPortfolioValue: 100000,
      currentPositionMarketValue: 2000,
    });
    expect(result.proposedDollarAmount!).toBeLessThanOrEqual(2000);
  });

  it('proposes the full current position value for SELL', () => {
    const result = computeProposedPosition({
      action: 'SELL',
      confidenceScore: 3,
      cashBalance: 0,
      totalPortfolioValue: 100000,
      currentPositionMarketValue: 4200,
    });
    expect(result.proposedDollarAmount).toBe(4200);
  });
});

describe('computeProposedPosition — evaluation-account safeguards (Phase 3.7)', () => {
  it('does not apply the $500 ceiling to a non-evaluation account, even with huge exposure', () => {
    const result = computeProposedPosition({
      action: 'BUY_MORE',
      confidenceScore: 10,
      cashBalance: 100000,
      totalPortfolioValue: 200000, // $100k already in holdings
      currentPositionMarketValue: 0,
      isEvaluationAccount: false,
    });
    // 15% of 200k = 30k, uncapped by any evaluation ceiling
    expect(result.proposedDollarAmount).toBeGreaterThan(500);
  });

  it('never proposes total active exposure beyond the $500 evaluation ceiling', () => {
    const result = computeProposedPosition({
      action: 'BUY_MORE',
      confidenceScore: 10,
      cashBalance: 400, // plenty of cash
      totalPortfolioValue: 500, // $100 already in holdings (500 total - 400 cash)
      currentPositionMarketValue: 0,
      isEvaluationAccount: true,
    });
    const existingExposure = 500 - 400; // $100
    expect(result.proposedDollarAmount!).toBeLessThanOrEqual(500 - existingExposure);
  });

  it('proposes zero more once existing evaluation exposure already reached the ceiling', () => {
    const result = computeProposedPosition({
      action: 'BUY_MORE',
      confidenceScore: 10,
      cashBalance: 50,
      totalPortfolioValue: 550, // $500 already in holdings (550 - 50 cash)
      currentPositionMarketValue: 0,
      isEvaluationAccount: true,
    });
    expect(result.proposedDollarAmount).toBe(0);
  });

  it('deducts pending manually-recorded executions from verified available cash', () => {
    // $300 total (100 already in holdings, 200 cash) keeps both the
    // confidence target (45) and the evaluation-cap check comfortably
    // non-binding without pending commitments, so cash (net of pending) is
    // what actually limits the "with pending" proposal.
    const withoutPending = computeProposedPosition({
      action: 'BUY_MORE',
      confidenceScore: 10,
      cashBalance: 200,
      totalPortfolioValue: 300,
      currentPositionMarketValue: 0,
      isEvaluationAccount: true,
    });
    const withPending = computeProposedPosition({
      action: 'BUY_MORE',
      confidenceScore: 10,
      cashBalance: 200,
      totalPortfolioValue: 300,
      currentPositionMarketValue: 0,
      isEvaluationAccount: true,
      pendingCommittedDollarAmount: 175, // $175 already spent, not yet reflected in cashBalance
    });
    expect(withPending.proposedDollarAmount!).toBeLessThan(withoutPending.proposedDollarAmount!);
    expect(withPending.proposedDollarAmount!).toBeLessThanOrEqual(25); // 200 cash - 175 pending
  });

  it('counts pending commitments toward the evaluation ceiling as well as against cash', () => {
    const result = computeProposedPosition({
      action: 'BUY_MORE',
      confidenceScore: 10,
      cashBalance: 500,
      totalPortfolioValue: 500, // nothing in synced holdings yet
      currentPositionMarketValue: 0,
      isEvaluationAccount: true,
      pendingCommittedDollarAmount: 500, // but $500 already committed via a pending manual execution / open order
    });
    expect(result.proposedDollarAmount).toBe(0);
  });

  it('respects an overridden evaluationMaxCapital for testing without touching the real default', () => {
    const result = computeProposedPosition({
      action: 'BUY_MORE',
      confidenceScore: 10,
      cashBalance: 1000,
      totalPortfolioValue: 1000,
      currentPositionMarketValue: 0,
      isEvaluationAccount: true,
      evaluationMaxCapital: 100,
    });
    expect(result.proposedDollarAmount!).toBeLessThanOrEqual(100);
  });

  it('never lets pending commitments push verified available cash below zero', () => {
    const result = computeProposedPosition({
      action: 'BUY_MORE',
      confidenceScore: 10,
      cashBalance: 100,
      totalPortfolioValue: 100,
      currentPositionMarketValue: 0,
      isEvaluationAccount: true,
      pendingCommittedDollarAmount: 500, // more "pending" than cash on hand
    });
    expect(result.proposedDollarAmount).toBe(0);
  });
});
