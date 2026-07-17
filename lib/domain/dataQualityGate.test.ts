import { describe, it, expect } from 'vitest';
import { evaluateDataQuality, applyDataQualityConfidenceCap, type DataQualityGateInput } from './dataQualityGate';
import type { Quote, CompanyFundamentals } from '@/lib/integrations';

function quote(overrides: Partial<Quote> = {}): Quote {
  return { symbol: 'TEST', price: 100, changePercent: 0, volume: 1000, asOf: new Date(), quality: 'delayed', ...overrides };
}

function fundamentals(overrides: Partial<CompanyFundamentals> = {}): CompanyFundamentals {
  return {
    symbol: 'TEST',
    name: 'Test Co',
    sector: 'Technology',
    industry: null,
    marketCap: 1_000_000,
    peRatio: 20,
    eps: 2,
    dividendYield: 0,
    description: null,
    asOf: new Date(),
    quality: 'delayed',
    ...overrides,
  };
}

function baseInput(overrides: Partial<DataQualityGateInput> = {}): DataQualityGateInput {
  return {
    mode: 'development',
    symbol: 'TEST',
    quote: quote(),
    fundamentals: fundamentals(),
    accountLastSyncedAt: new Date(),
    newsCount: 3,
    filingsCount: 1,
    daysToNextEarnings: 30,
    marketDataReliabilityPct: 95,
    fundamentalsReliabilityPct: 95,
    ...overrides,
  };
}

describe('evaluateDataQuality', () => {
  it('passes clean with all real, fresh data', () => {
    const result = evaluateDataQuality(baseInput());
    expect(result.status).toBe('PASS');
    expect(result.checks.every((c) => c.status === 'ok')).toBe(true);
  });

  it('never blocks on mock quote/fundamentals in development mode', () => {
    const result = evaluateDataQuality(baseInput({ mode: 'development', quote: quote({ quality: 'mock' }), fundamentals: fundamentals({ quality: 'mock' }) }));
    expect(result.status).not.toBe('BLOCKED');
  });

  it('blocks on mock quote in live-evaluation mode', () => {
    const result = evaluateDataQuality(baseInput({ mode: 'live-evaluation', quote: quote({ quality: 'mock' }) }));
    expect(result.status).toBe('BLOCKED');
    expect(result.checks.find((c) => c.name === 'quote')?.status).toBe('blocking');
  });

  it('blocks on mock fundamentals in live-evaluation mode', () => {
    const result = evaluateDataQuality(baseInput({ mode: 'live-evaluation', fundamentals: fundamentals({ quality: 'mock' }) }));
    expect(result.status).toBe('BLOCKED');
    expect(result.checks.find((c) => c.name === 'fundamentals')?.status).toBe('blocking');
  });

  it('blocks when there is no quote at all', () => {
    const result = evaluateDataQuality(baseInput({ quote: null }));
    expect(result.status).toBe('BLOCKED');
  });

  it('warns (does not block) on missing fundamentals data entirely', () => {
    const result = evaluateDataQuality(baseInput({ fundamentals: null }));
    expect(result.status).toBe('PASS_WITH_WARNINGS');
    expect(result.checks.find((c) => c.name === 'fundamentals')?.status).toBe('warning');
  });

  it('blocks in live-evaluation mode when the account has never been synced', () => {
    const result = evaluateDataQuality(baseInput({ mode: 'live-evaluation', accountLastSyncedAt: null }));
    expect(result.status).toBe('BLOCKED');
    expect(result.checks.find((c) => c.name === 'account_freshness')?.status).toBe('blocking');
  });

  it('blocks in live-evaluation mode when the account sync is more than 7 days stale', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const result = evaluateDataQuality(baseInput({ mode: 'live-evaluation', accountLastSyncedAt: eightDaysAgo }));
    expect(result.status).toBe('BLOCKED');
  });

  it('warns (does not block) in live-evaluation mode when the account sync is moderately stale', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const result = evaluateDataQuality(baseInput({ mode: 'live-evaluation', accountLastSyncedAt: threeDaysAgo }));
    expect(result.status).toBe('PASS_WITH_WARNINGS');
  });

  it('does not enforce account freshness in development mode even with no sync at all', () => {
    const result = evaluateDataQuality(baseInput({ mode: 'development', accountLastSyncedAt: null }));
    expect(result.status).not.toBe('BLOCKED');
  });

  it('never blocks on empty news — treats it as acceptable', () => {
    const result = evaluateDataQuality(baseInput({ newsCount: 0 }));
    expect(result.status).toBe('PASS');
    expect(result.checks.find((c) => c.name === 'news')?.status).toBe('ok');
  });

  it('warns (does not block) when there is no earnings-calendar data', () => {
    const result = evaluateDataQuality(baseInput({ daysToNextEarnings: null }));
    expect(result.status).toBe('PASS_WITH_WARNINGS');
  });

  it('warns when provider reliability has degraded', () => {
    const result = evaluateDataQuality(baseInput({ marketDataReliabilityPct: 30 }));
    expect(result.status).toBe('PASS_WITH_WARNINGS');
    expect(result.checks.find((c) => c.name === 'market_data_reliability')?.status).toBe('warning');
  });
});

describe('applyDataQualityConfidenceCap', () => {
  it('leaves confidence untouched on PASS', () => {
    expect(applyDataQualityConfidenceCap(10, 'PASS')).toBe(10);
  });

  it('caps confidence on PASS_WITH_WARNINGS', () => {
    expect(applyDataQualityConfidenceCap(10, 'PASS_WITH_WARNINGS')).toBeLessThan(10);
  });

  it('never raises confidence — a low score stays low even under the cap', () => {
    expect(applyDataQualityConfidenceCap(3, 'PASS_WITH_WARNINGS')).toBe(3);
  });
});
