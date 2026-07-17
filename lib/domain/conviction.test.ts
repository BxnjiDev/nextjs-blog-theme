import { describe, it, expect } from 'vitest';
import { computeConviction, type ConvictionInput } from './conviction';
import type { CompanyFundamentals, HistoricalPricePoint } from '@/lib/integrations';

function history(days: number, startClose = 100): HistoricalPricePoint[] {
  const points: HistoricalPricePoint[] = [];
  const now = new Date('2026-07-01T00:00:00Z');
  for (let i = 0; i < days; i++) {
    points.push({ date: new Date(now.getTime() - i * 24 * 60 * 60 * 1000), close: startClose, volume: 1_000_000 });
  }
  return points;
}

function fundamentals(overrides: Partial<CompanyFundamentals>): CompanyFundamentals {
  return {
    symbol: 'TEST',
    name: 'Test Co',
    sector: 'Technology',
    industry: null,
    marketCap: 50_000_000_000,
    peRatio: 25,
    eps: 3,
    dividendYield: 0,
    description: null,
    asOf: new Date(),
    quality: 'mock',
    ...overrides,
  };
}

function baseInput(overrides: Partial<ConvictionInput> = {}): ConvictionInput {
  return {
    symbol: 'TEST',
    fundamentals: null,
    fundamentalHistory: [],
    history: history(60),
    sp500History: history(60, 500),
    sector: 'Technology',
    daysToNextEarnings: null,
    ...overrides,
  };
}

describe('computeConviction', () => {
  it('marks qualitative categories with no deterministic formula as unavailable regardless of input', () => {
    const result = computeConviction(baseInput({ fundamentals: fundamentals({}) }));
    for (const key of ['competitiveMoat', 'aiPositioning', 'managementExecution', 'industryLeadership', 'productInnovation'] as const) {
      expect(result[key].score).toBeNull();
      expect(result[key].dataAvailable).toBe(false);
    }
  });

  it('scores valuation as unavailable when no P/E data exists', () => {
    const result = computeConviction(baseInput({ fundamentals: null }));
    expect(result.valuation.score).toBeNull();
    expect(result.valuation.dataAvailable).toBe(false);
  });

  it('scores a lower P/E as more attractively valued than a higher P/E', () => {
    const cheap = computeConviction(baseInput({ fundamentals: fundamentals({ peRatio: 12 }) }));
    const expensive = computeConviction(baseInput({ fundamentals: fundamentals({ peRatio: 80 }) }));
    expect(cheap.valuation.score!).toBeGreaterThan(expensive.valuation.score!);
  });

  it('never fabricates financial-strength/revenue-growth scores with zero data available', () => {
    const result = computeConviction(baseInput());
    expect(result.financialStrength.dataAvailable).toBe(false);
    expect(result.revenueGrowth.dataAvailable).toBe(false);
    expect(result.balanceSheet.dataAvailable).toBe(false);
  });

  it('uses real fundamentals-history data for revenue growth when available', () => {
    const result = computeConviction(
      baseInput({
        fundamentalHistory: [
          {
            fiscalYear: 2026,
            fiscalPeriod: 'Q2',
            reportDate: new Date('2026-06-01'),
            revenue: 1_000_000,
            revenueGrowth: 0.2,
            grossMargin: 0.5,
            operatingMargin: 0.2,
            netMargin: 0.15,
            freeCashFlow: 100_000,
            eps: 2,
            epsGrowth: 0.1,
            roe: 0.2,
            roic: 0.15,
            debtToEquity: 0.5,
            currentRatio: 1.5,
            cash: 500_000,
            totalDebt: 200_000,
          },
        ],
      })
    );
    expect(result.revenueGrowth.dataAvailable).toBe(true);
    expect(result.revenueGrowth.score).toBeGreaterThan(50);
  });

  it('always produces an overallScore clamped to 0-100', () => {
    const withData = computeConviction(baseInput({ fundamentals: fundamentals({ peRatio: 200 }) }));
    const withoutData = computeConviction(baseInput());
    for (const result of [withData, withoutData]) {
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    }
  });
});
