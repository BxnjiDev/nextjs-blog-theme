import { describe, it, expect } from 'vitest';
import {
  normalizeBriefingPortfolioSummary,
  normalizeBriefingMarketRecap,
  normalizeExplainability,
  normalizeDataQualityChecks,
} from './legacyNormalization';

describe('normalizeBriefingPortfolioSummary — legacy/partial-record resilience (Phase 3.7)', () => {
  it('fills every field with a safe default for null (record predates Phase 3.6, before the column existed at all)', () => {
    const summary = normalizeBriefingPortfolioSummary(null);
    expect(summary.totalValue).toBeNull();
    expect(summary.performance).toEqual({ daily: { available: false }, weekly: { available: false }, monthly: { available: false } });
    expect(summary.recommendedActions).toEqual([]);
    expect(summary.whatAtlasWouldDoToday).toEqual([]);
  });

  it('fills defaults for undefined the same way as null', () => {
    const summary = normalizeBriefingPortfolioSummary(undefined);
    expect(summary.materialRisks).toBeNull();
    expect(summary.biggestOpportunities).toEqual([]);
  });

  it('treats a bare empty object the same as a missing record (partial historical record with no keys at all)', () => {
    const summary = normalizeBriefingPortfolioSummary({});
    expect(summary.cashBalance).toBeNull();
    expect(summary.convictionHighlights).toEqual([]);
    expect(summary.changesSinceYesterday).toBeNull();
  });

  it('preserves an old record that only has the original (pre-Phase-3.6) fields', () => {
    const legacy = {
      totalValue: 1000,
      cashBalance: 200,
      capitalDeployed: 800,
      dayChangeValue: 5,
      dayChangePercent: 0.5,
      sp500Level: 5000,
      largestWinner: null,
      largestLoser: null,
      performance: { daily: { available: true, returnPercent: 1, vsSp500Percent: 0.2 }, weekly: { available: false }, monthly: { available: false } },
      recommendedActions: [{ symbol: 'AAPL', action: 'HOLD', confidenceScore: 5 }],
      convictionHighlights: [],
      materialRisks: null,
      portfolioHealth: null,
      // thesisChangesSinceYesterday, changesSinceYesterday, biggestOpportunities,
      // whatAtlasWouldDoToday, whatAtlasWouldAvoidToday: absent, as JSON.stringify
      // would have dropped them entirely before those fields existed.
    };
    const summary = normalizeBriefingPortfolioSummary(legacy);
    expect(summary.totalValue).toBe(1000);
    expect(summary.recommendedActions).toEqual([{ symbol: 'AAPL', action: 'HOLD', confidenceScore: 5 }]);
    expect(summary.biggestOpportunities).toEqual([]);
    expect(summary.thesisChangesSinceYesterday).toEqual([]);
    expect(summary.whatAtlasWouldDoToday).toEqual([]);
  });

  it('distinguishes a present-but-null value from a field that was never set', () => {
    const summary = normalizeBriefingPortfolioSummary({ totalValue: null, cashBalance: 0 });
    expect(summary.totalValue).toBeNull();
    expect(summary.cashBalance).toBe(0); // 0 is a real value, not "missing" — must survive `?? null`
  });
});

describe('normalizeBriefingMarketRecap — legacy/partial-record resilience (Phase 3.7)', () => {
  it('fills every array field for null instead of crashing on .length/.map at the read boundary', () => {
    const recap = normalizeBriefingMarketRecap(null);
    expect(recap.portfolioNews).toEqual([]);
    expect(recap.upcomingEvents).toEqual([]);
    expect(recap.notes).toEqual([]);
  });

  it('fills defaults when a key is present but not an array (malformed/partial record)', () => {
    const recap = normalizeBriefingMarketRecap({ portfolioNews: null, upcomingEvents: 'not-an-array', notes: undefined });
    expect(recap.portfolioNews).toEqual([]);
    expect(recap.upcomingEvents).toEqual([]);
    expect(recap.notes).toEqual([]);
  });

  it('preserves well-formed data unchanged', () => {
    const recap = normalizeBriefingMarketRecap({
      portfolioNews: [{ symbol: 'AAPL', headline: 'h', source: 's', url: null, publishedAt: '2026-01-01T00:00:00Z', materialityLevel: 'HIGH', whyItMatters: 'w' }],
      upcomingEvents: [],
      notes: ['note one'],
    });
    expect(recap.portfolioNews).toHaveLength(1);
    expect(recap.notes).toEqual(['note one']);
  });
});

describe('normalizeExplainability — legacy/partial-record resilience (Phase 3.7)', () => {
  it('returns null when explainability was never generated for this recommendation', () => {
    expect(normalizeExplainability(null)).toBeNull();
    expect(normalizeExplainability(undefined)).toBeNull();
  });

  it('fills every Phase-3.6 "Investment Memo" field with a labeled placeholder for a pre-3.6 record that only has the original 7 fields', () => {
    const legacy = {
      whyNow: 'because X',
      whyNot: 'risk Y',
      supportingEvidence: 'evidence',
      contradictingEvidence: 'counter-evidence',
      keyAssumptions: 'assumptions',
      invalidationConditions: 'conditions',
      vsCashAndSpy: 'better than cash',
      // baseCase, primaryCatalyst, biggestUnknown, biggestRisk,
      // whyConfidenceNotHigher, portfolioImpact, opportunityCost,
      // vsCurrentAllocation: absent — added in Phase 3.6.
    };
    const e = normalizeExplainability(legacy)!;
    expect(e.whyNow).toBe('because X');
    expect(e.baseCase).toBe('Not assessed.');
    expect(e.primaryCatalyst).toBe('Not assessed.');
    expect(e.vsCurrentAllocation).toBe('Not assessed.');
  });

  it('normalizes an empty object to all-placeholder rather than throwing on property access', () => {
    const e = normalizeExplainability({})!;
    expect(e.whyNow).toBe('Not assessed.');
    expect(e.opportunityCost).toBe('Not assessed.');
  });
});

describe('normalizeDataQualityChecks — legacy/partial-record resilience (Phase 3.7)', () => {
  it('returns an empty array for a pre-Phase-3.7 recommendation (field never existed)', () => {
    expect(normalizeDataQualityChecks(null)).toEqual([]);
    expect(normalizeDataQualityChecks(undefined)).toEqual([]);
  });

  it('returns an empty array when the stored value is not an array at all', () => {
    expect(normalizeDataQualityChecks({ not: 'an array' })).toEqual([]);
  });

  it('drops malformed entries and fills safe defaults for partially-malformed ones rather than crashing on .map', () => {
    const checks = normalizeDataQualityChecks([
      { name: 'quote_freshness', status: 'ok', detail: 'fresh' },
      null,
      'not an object',
      { status: 'nonsense-status' }, // missing name/detail, invalid status
    ]);
    expect(checks).toHaveLength(2);
    expect(checks[0]).toEqual({ name: 'quote_freshness', status: 'ok', detail: 'fresh' });
    expect(checks[1]).toEqual({ name: 'unknown', status: 'warning', detail: '' });
  });
});
