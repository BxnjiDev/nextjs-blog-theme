import { describe, it, expect } from 'vitest';
import { linearRiskScore, annualizedVolatility, computeBeta, computeRisk, type RiskHoldingInput } from './risk';
import type { HistoricalPricePoint } from '@/lib/integrations';
import type { HoldingView } from './portfolio';

function history(days: number, startClose: number, dailyDrift = 0): HistoricalPricePoint[] {
  const points: HistoricalPricePoint[] = [];
  const now = new Date('2026-07-01T00:00:00Z');
  let close = startClose;
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    points.push({ date, close, volume: 1_000_000 });
    close *= 1 + dailyDrift;
  }
  return points.reverse(); // newest-first, matching provider convention
}

function view(overrides: Partial<HoldingView>): HoldingView {
  return {
    id: overrides.symbol ?? 'TEST',
    symbol: 'TEST',
    name: 'Test Co',
    sector: 'Technology',
    quantity: 10,
    avgCostBasis: 100,
    currentPrice: 100,
    changePercent: 0,
    marketValue: 1000,
    unrealizedPnl: 0,
    unrealizedPnlPercent: 0,
    quoteAsOf: new Date(),
    quoteQuality: 'mock',
    convictionScore: null,
    thesisLastReviewedAt: null,
    ...overrides,
  };
}

function holdingInput(overrides: Partial<RiskHoldingInput> & { view: HoldingView }): RiskHoldingInput {
  return {
    history: history(60, 100, 0.001),
    fundamentals: null,
    daysSinceLastFiling: null,
    daysToNextEarnings: null,
    negativeNewsCritical: 0,
    negativeNewsHigh: 0,
    ...overrides,
  };
}

describe('linearRiskScore', () => {
  it('clamps to 0 at or below the low bound', () => {
    expect(linearRiskScore(0, 5, 40)).toBe(0);
    expect(linearRiskScore(-100, 5, 40)).toBe(0);
  });

  it('clamps to 100 at or above the high bound', () => {
    expect(linearRiskScore(40, 5, 40)).toBe(100);
    expect(linearRiskScore(1000, 5, 40)).toBe(100);
  });

  it('interpolates linearly in between', () => {
    expect(linearRiskScore(22.5, 5, 40)).toBe(50);
  });

  it('returns a neutral 50 when low === high (degenerate band)', () => {
    expect(linearRiskScore(10, 10, 10)).toBe(50);
  });
});

describe('annualizedVolatility', () => {
  it('returns null with fewer than 10 daily returns', () => {
    expect(annualizedVolatility(history(5, 100))).toBeNull();
  });

  it('returns 0 for a perfectly flat price series', () => {
    const flat = history(30, 100, 0);
    expect(annualizedVolatility(flat)).toBe(0);
  });

  it('is higher for a more volatile series than a calmer one', () => {
    const calm = history(40, 100, 0.001);
    const wild: HistoricalPricePoint[] = calm.map((p, i) => ({
      ...p,
      close: p.close * (1 + (i % 2 === 0 ? 0.05 : -0.05)),
    }));
    const calmVol = annualizedVolatility(calm)!;
    const wildVol = annualizedVolatility(wild)!;
    expect(wildVol).toBeGreaterThan(calmVol);
  });
});

describe('computeBeta', () => {
  it('returns null with insufficient overlapping history', () => {
    expect(computeBeta(history(3, 100), history(3, 100))).toBeNull();
  });

  it('is close to 1 when a symbol moves identically to the benchmark', () => {
    const benchmark = history(40, 500, 0.002);
    const identical = benchmark.map((p) => ({ ...p }));
    const beta = computeBeta(identical, benchmark);
    expect(beta).not.toBeNull();
    expect(beta!).toBeCloseTo(1, 0);
  });
});

describe('computeRisk', () => {
  it('scores higher concentration risk for a single-holding portfolio than a diversified one', () => {
    const concentrated = computeRisk({
      holdings: [holdingInput({ view: view({ symbol: 'ONE', marketValue: 10000 }) })],
      totalValue: 10000,
      cashBalance: 0,
      sp500History: history(60, 500, 0.0005),
      portfolioHistory: [],
      quoteQualities: ['mock'],
    });

    const diversified = computeRisk({
      holdings: Array.from({ length: 10 }, (_, i) =>
        holdingInput({ view: view({ symbol: `SYM${i}`, marketValue: 1000, sector: `Sector${i}` }) })
      ),
      totalValue: 10000,
      cashBalance: 0,
      sp500History: history(60, 500, 0.0005),
      portfolioHistory: [],
      quoteQualities: Array(10).fill('mock'),
    });

    expect(concentrated.concentrationRisk.score).toBeGreaterThan(diversified.concentrationRisk.score);
    expect(concentrated.sectorRisk.score).toBeGreaterThan(diversified.sectorRisk.score);
  });

  it('produces an overallScore within 0-100', () => {
    const result = computeRisk({
      holdings: [
        holdingInput({ view: view({ symbol: 'AAA', marketValue: 6000 }) }),
        holdingInput({ view: view({ symbol: 'BBB', marketValue: 4000, sector: 'Healthcare' }) }),
      ],
      totalValue: 10000,
      cashBalance: 0,
      sp500History: history(60, 500, 0.0005),
      portfolioHistory: [],
      quoteQualities: ['mock', 'mock'],
    });
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it('falls back to a neutral score when there is not enough history for volatility/beta', () => {
    const result = computeRisk({
      holdings: [holdingInput({ view: view({ symbol: 'NEW' }), history: history(3, 100) })],
      totalValue: 1000,
      cashBalance: 0,
      sp500History: history(3, 500),
      portfolioHistory: [],
      quoteQualities: ['mock'],
    });
    expect(result.volatilityRisk.score).toBe(50);
    expect(result.betaRisk.score).toBe(50);
  });
});
