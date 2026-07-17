import { describe, it, expect } from 'vitest';
import { rankEntries, CASH_BASELINE_SCORE, type ComparisonEntry } from './compareOpportunities';
import type { ConvictionResult, ConvictionCategoryResult } from './conviction';

const CATEGORY: ConvictionCategoryResult = { score: 50, dataAvailable: true, explanation: '' };

function conviction(overrides: Partial<Record<keyof ConvictionResult, number>>): ConvictionResult {
  const base: ConvictionResult = {
    financialStrength: { ...CATEGORY },
    revenueGrowth: { ...CATEGORY },
    profitability: { ...CATEGORY },
    balanceSheet: { ...CATEGORY },
    competitiveMoat: { ...CATEGORY },
    aiPositioning: { ...CATEGORY },
    managementExecution: { ...CATEGORY },
    industryLeadership: { ...CATEGORY },
    productInnovation: { ...CATEGORY },
    valuation: { ...CATEGORY },
    executionRisk: { ...CATEGORY },
    regulatoryRisk: { ...CATEGORY },
    macroSensitivity: { ...CATEGORY },
    overallScore: 50,
    methodology: {},
  };
  for (const [key, score] of Object.entries(overrides)) {
    (base as unknown as Record<string, ConvictionCategoryResult | number>)[key] = { score, dataAvailable: true, explanation: '' };
  }
  return base;
}

function entry(overrides: Partial<ComparisonEntry> & { symbol: string; overallScore: number }): ComparisonEntry {
  return {
    isCash: false,
    name: null,
    sector: null,
    isHeld: false,
    conviction: null,
    quote: null,
    latestRecommendationId: null,
    error: null,
    ...overrides,
  };
}

describe('rankEntries', () => {
  it('ranks strictly by overallScore, highest first', () => {
    const ranked = rankEntries([
      entry({ symbol: 'LOW', overallScore: 20 }),
      entry({ symbol: 'HIGH', overallScore: 90 }),
      entry({ symbol: 'MID', overallScore: 55 }),
    ]);
    expect(ranked.map((r) => r.symbol)).toEqual(['HIGH', 'MID', 'LOW']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('ranks cash by its fixed neutral baseline relative to real opportunities', () => {
    const ranked = rankEntries([
      entry({ symbol: 'WEAK', overallScore: 30 }),
      entry({ symbol: 'CASH', overallScore: CASH_BASELINE_SCORE, isCash: true }),
      entry({ symbol: 'STRONG', overallScore: 80 }),
    ]);
    expect(ranked.map((r) => r.symbol)).toEqual(['STRONG', 'CASH', 'WEAK']);
  });

  it('gives the top entry a distinct, non-empty explanation', () => {
    const ranked = rankEntries([entry({ symbol: 'ONLY', overallScore: 70, conviction: conviction({}) })]);
    expect(ranked[0].explanation.length).toBeGreaterThan(0);
  });

  it("explains a lower-ranked entry's loss by referencing its biggest category gap vs. the top pick", () => {
    const top = conviction({ valuation: 90, revenueGrowth: 85 });
    const second = conviction({ valuation: 20, revenueGrowth: 30 });
    const ranked = rankEntries([
      entry({ symbol: 'WINNER', overallScore: 88, conviction: top }),
      entry({ symbol: 'LOSER', overallScore: 40, conviction: second }),
    ]);
    const loser = ranked.find((r) => r.symbol === 'LOSER')!;
    expect(loser.explanation).toContain('WINNER');
    expect(loser.explanation.toLowerCase()).toMatch(/valuation|revenue growth/);
  });

  it('surfaces analysis errors instead of silently ranking a failed symbol', () => {
    const ranked = rankEntries([
      entry({ symbol: 'OK', overallScore: 60 }),
      entry({ symbol: 'BROKEN', overallScore: 0, error: 'provider timeout' }),
    ]);
    const broken = ranked.find((r) => r.symbol === 'BROKEN')!;
    expect(broken.explanation).toContain('provider timeout');
  });
});
