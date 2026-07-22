import { describe, it, expect } from 'vitest';
import { buildDecision, type BuildDecisionInput } from './engine';
import { DEFAULT_TIMEFRAME_ROLES, type DemandZone, type LiquidityEvidence, type LiquiditySweepEvent, type MultiTimeframeContext, type TechnicalEvidence, type TimeframeConflict } from '@/lib/strategy/types';

const NOW = new Date('2025-01-15T00:00:00Z');

function baseInput(overrides: Partial<BuildDecisionInput> = {}): BuildDecisionInput {
  return {
    symbol: 'TEST',
    isHeld: true,
    holdingWeightPct: 5,
    sector: 'Technology',
    recommendation: {
      id: 'rec_1',
      action: 'BUY_MORE', // -> baseAction INCREASE (bullish) when isHeld
      confidenceScore: 7, // base confidence 70
      generatedAt: NOW, // ageDays = 0, never stale in these tests
      dataQualityStatus: 'PASS',
      thesis: 'Test thesis',
      bearCase: 'Test bear case',
      catalysts: 'Test catalysts',
      risks: 'Test risks',
      technicalTrend: null,
      explainability: null,
    },
    conviction: {
      current: 70,
      previous: 65,
      trend: 'STABLE',
      valuationScore: 60,
      latestChangeEvent: null,
      sellConditions: null,
    },
    portfolioRisk: null,
    daysToNextEarnings: null,
    latestMaterialNews: null,
    now: NOW,
    ...overrides,
  };
}

const CONFLICT: TimeframeConflict = {
  higherTimeframe: '1D',
  lowerTimeframe: '30m',
  higherTone: 'negative',
  lowerTone: 'positive',
  description: '1D structure reads negative while 30m reads positive — a 30m signal does not override 1D structure; this conflict lowers confidence rather than being ignored.',
};

function multiTimeframeContext(conflicts: TimeframeConflict[]): MultiTimeframeContext {
  return { snapshots: [], roles: DEFAULT_TIMEFRAME_ROLES, conflicts, hasConflict: conflicts.length > 0, overallTone: 'neutral' };
}

const RETESTED_ZONE: DemandZone = {
  priceLevel: 100,
  priceHigh: 105,
  formedAt: new Date('2025-01-01'),
  timeframe: '1D',
  impulseMovePct: 15,
  volumeExpansionRatio: 1.8,
  priorReactionCount: 1,
  mitigated: false,
  recentlyRetested: true,
  distanceFromPricePct: 1,
  qualityScore: 70,
  description: 'a potential demand zone at $100.00–$105.00.',
};

const SUPPORTIVE_TECHNICAL: TechnicalEvidence = { factors: [], available: true, overallTone: 'positive' };
const CONFLICTING_TECHNICAL: TechnicalEvidence = { factors: [], available: true, overallTone: 'negative' };

function sweepEvent(direction: 'buy_side' | 'sell_side'): LiquiditySweepEvent {
  return {
    classification: 'confirmed_sweep_reclaim',
    direction,
    sweptLevel: 95,
    sweepCandleTime: new Date('2025-01-10'),
    timeframe: '1D',
    wickToBodyRatio: 3,
    volumeConfirmed: true,
    followThroughConfirmed: true,
    description: 'Confirmed sweep-and-reclaim near $95.00. This is a price-structure inference from OHLC candles only — Atlas has no order-flow or resting-liquidity data.',
  };
}

function liquidityWith(event: LiquiditySweepEvent): LiquidityEvidence {
  return { available: true, events: [event], note: 'Price-structure inference from OHLC candles only.' };
}

describe('buildDecision — multi-timeframe integration', () => {
  it('applies no confidence penalty when multiTimeframe context has no conflicts', () => {
    const decision = buildDecision(baseInput({ multiTimeframe: multiTimeframeContext([]) }));
    expect(decision.confidence).toBe(70);
  });

  it('applies a flat -8 confidence penalty when timeframes conflict', () => {
    const decision = buildDecision(baseInput({ multiTimeframe: multiTimeframeContext([CONFLICT]) }));
    expect(decision.confidence).toBe(62);
    expect(decision.confidenceReasoning.some((r) => r.includes('Conflicting timeframe structure'))).toBe(true);
  });

  it('caps the conflict penalty at -8 regardless of how many conflicting pairs are found', () => {
    const decision = buildDecision(baseInput({ multiTimeframe: multiTimeframeContext([CONFLICT, CONFLICT, CONFLICT]) }));
    expect(decision.confidence).toBe(62);
  });

  it('never determines the action itself — a conflict only ever adjusts confidence', () => {
    const withConflict = buildDecision(baseInput({ multiTimeframe: multiTimeframeContext([CONFLICT]) }));
    const withoutConflict = buildDecision(baseInput());
    expect(withConflict.action).toBe(withoutConflict.action);
  });

  it('exposes timeframeRoles/timeframeConflicts only when multiTimeframe context is supplied', () => {
    const withContext = buildDecision(baseInput({ multiTimeframe: multiTimeframeContext([CONFLICT]) }));
    expect(withContext.timeframeRoles).toEqual(DEFAULT_TIMEFRAME_ROLES);
    expect(withContext.timeframeConflicts).toEqual([CONFLICT]);

    const withoutContext = buildDecision(baseInput());
    expect(withoutContext.timeframeRoles).toBeUndefined();
    expect(withoutContext.timeframeConflicts).toBeUndefined();
  });
});

describe('buildDecision — demand-zone confidence integration', () => {
  it('adds a +5 bonus for a demand-zone retest only when reinforced by supportive technical evidence and non-weakening conviction', () => {
    const decision = buildDecision(baseInput({ demandZones: [RETESTED_ZONE], technicalEvidence: SUPPORTIVE_TECHNICAL }));
    expect(decision.confidence).toBe(75);
  });

  it('does not add the bonus when technical evidence conflicts with the call instead of supporting it', () => {
    const decision = buildDecision(baseInput({ demandZones: [RETESTED_ZONE], technicalEvidence: CONFLICTING_TECHNICAL }));
    expect(decision.confidenceReasoning.some((r) => r.includes('demand-zone retest'))).toBe(false);
  });

  it('never labels the zone as institutional buying in its reasoning factor', () => {
    const decision = buildDecision(baseInput({ demandZones: [RETESTED_ZONE], technicalEvidence: SUPPORTIVE_TECHNICAL }));
    const factor = decision.reasoning.find((f) => f.key === 'supplyDemandContext');
    expect(factor?.summary.toLowerCase()).not.toContain('institutional');
  });
});

describe('buildDecision — liquidity-sweep confidence integration', () => {
  it('adds a +4 bonus for a confirmed sell-side sweep-and-reclaim reinforcing a bullish call', () => {
    const decision = buildDecision(baseInput({ liquidityEvidence: liquidityWith(sweepEvent('sell_side')) }));
    expect(decision.confidence).toBe(74);
    expect(decision.confidenceReasoning.some((r) => r.includes('confirmed liquidity sweep-and-reclaim'))).toBe(true);
  });

  it('does not add the bonus when the sweep direction does not support the action (buy-side sweep, bullish call)', () => {
    const decision = buildDecision(baseInput({ liquidityEvidence: liquidityWith(sweepEvent('buy_side')) }));
    expect(decision.confidence).toBe(70);
    expect(decision.confidenceReasoning.some((r) => r.includes('confirmed liquidity sweep-and-reclaim'))).toBe(false);
  });

  it('never claims order-flow or institutional-positioning knowledge in the liquidity reasoning factor', () => {
    const decision = buildDecision(baseInput({ liquidityEvidence: liquidityWith(sweepEvent('sell_side')) }));
    const factor = decision.reasoning.find((f) => f.key === 'liquidityAnalysis');
    expect(factor?.summary.toLowerCase()).toContain('price-structure inference');
  });
});
