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
