import { describe, it, expect } from 'vitest';
import { computeScorecardMetrics, type ScorecardRecommendationInput, type ScorecardOutcomeInput } from './computeScorecard';
import { computeCalibrationMetrics, type CalibrationGradedInput } from './computeConfidenceCalibration';

/**
 * Historical replay tests: hand-crafted RecommendationOutcome-shaped rows,
 * fed through the exact pure functions the scorecard/calibration jobs use
 * against live data (lib/jobs/computeScorecard.ts, computeConfidenceCalibration.ts),
 * with expected results computed by hand — verifying the math itself, not
 * just "it runs." Deliberately doesn't seed the real database: the dev DB
 * already carries real accumulated Recommendation/RecommendationOutcome
 * rows from prior phases, so a DB-seeded version of this test would be
 * asserting against a moving target instead of known values.
 */

const day = (n: number) => new Date(2026, 0, n);

describe('computeScorecardMetrics (historical replay)', () => {
  const recommendations: ScorecardRecommendationInput[] = [
    { symbol: 'AAA', action: 'BUY_MORE', generatedAt: day(1), userDecision: 'ACCEPTED' },
    { symbol: 'AAA', action: 'HOLD', generatedAt: day(11), userDecision: 'PENDING' },
    { symbol: 'BBB', action: 'REDUCE', generatedAt: day(5), userDecision: 'REJECTED' },
    { symbol: 'CCC', action: 'SELL', generatedAt: day(3), userDecision: 'PARTIALLY_ACCEPTED' },
    { symbol: 'DDD', action: 'WATCH', generatedAt: day(2), userDecision: 'PENDING' },
  ];

  const outcomes: ScorecardOutcomeInput[] = [
    { wasCorrect: true, alpha90d: 8, action: 'BUY_MORE' },
    { wasCorrect: true, alpha90d: 4, action: 'HOLD' },
    { wasCorrect: false, alpha90d: -6, action: 'REDUCE' },
    { wasCorrect: false, alpha90d: -2, action: 'SELL' },
    // DDD (WATCH) has no outcome yet — not graded.
  ];

  it('counts actions correctly', () => {
    const metrics = computeScorecardMetrics(recommendations, outcomes);
    expect(metrics).toMatchObject({ buyCount: 1, holdCount: 1, reduceCount: 1, sellCount: 1, watchCount: 1 });
  });

  it('computes win rate only over graded outcomes', () => {
    const metrics = computeScorecardMetrics(recommendations, outcomes);
    // 4 graded outcomes, 2 correct -> 50%
    expect(metrics.gradedSampleSize).toBe(4);
    expect(metrics.winRatePct).toBe(50);
  });

  it('counts false positives (bullish calls graded wrong) and false negatives (bearish calls graded wrong) separately', () => {
    const metrics = computeScorecardMetrics(recommendations, outcomes);
    expect(metrics.falsePositives).toBe(0); // both bullish (BUY_MORE/HOLD) calls were correct
    expect(metrics.falseNegatives).toBe(2); // both bearish (REDUCE/SELL) calls were wrong
  });

  it('computes avgGainPct and avgDrawdownPct from positive/negative alpha respectively', () => {
    const metrics = computeScorecardMetrics(recommendations, outcomes);
    // Winning alphas: 8, 4 -> avg 6
    expect(metrics.avgGainPct).toBe(6);
    // Losing alphas: -6, -2 -> avg magnitude 4
    expect(metrics.avgDrawdownPct).toBe(4);
  });

  it('computes alphaVsSpyAvgPct across every outcome with alpha, graded or not', () => {
    const metrics = computeScorecardMetrics(recommendations, outcomes);
    // (8 + 4 - 6 - 2) / 4 = 1
    expect(metrics.alphaVsSpyAvgPct).toBe(1);
  });

  it('computes utilization and acceptance rate from userDecision', () => {
    const metrics = computeScorecardMetrics(recommendations, outcomes);
    // 3 of 5 recommendations have a non-PENDING decision (ACCEPTED, REJECTED, PARTIALLY_ACCEPTED)
    expect(metrics.utilizationPct).toBe(60);
    // Of those 3 decided, 2 were ACCEPTED or PARTIALLY_ACCEPTED
    expect(metrics.acceptanceRatePct).toBeCloseTo((2 / 3) * 100, 5);
  });

  it('computes avgHoldingPeriodDays as the gap between successive recommendations for the same symbol', () => {
    const metrics = computeScorecardMetrics(recommendations, outcomes);
    // Only AAA has two recommendations, 10 days apart (day 1 -> day 11)
    expect(metrics.avgHoldingPeriodDays).toBe(10);
  });

  it('returns nulls rather than fabricated numbers with zero data', () => {
    const metrics = computeScorecardMetrics([], []);
    expect(metrics.winRatePct).toBeNull();
    expect(metrics.alphaVsSpyAvgPct).toBeNull();
    expect(metrics.avgGainPct).toBeNull();
    expect(metrics.avgDrawdownPct).toBeNull();
    expect(metrics.utilizationPct).toBeNull();
    expect(metrics.acceptanceRatePct).toBeNull();
    expect(metrics.avgHoldingPeriodDays).toBeNull();
  });
});

describe('computeCalibrationMetrics (historical replay)', () => {
  it('buckets graded outcomes by confidence and computes actual win rate per bucket', () => {
    const graded: CalibrationGradedInput[] = [
      { wasCorrect: true, alpha90d: 5, confidenceScore: 9 },
      { wasCorrect: true, alpha90d: 3, confidenceScore: 10 },
      { wasCorrect: false, alpha90d: -4, confidenceScore: 9 },
      { wasCorrect: false, alpha90d: -1, confidenceScore: 3 },
    ];
    const { buckets } = computeCalibrationMetrics(graded);

    const highBucket = buckets.find((b) => b.label.startsWith('9-10'))!;
    expect(highBucket.sampleSize).toBe(3);
    // 2 correct out of 3 in the 9-10 bucket
    expect(highBucket.actualWinRatePct).toBeCloseTo((2 / 3) * 100, 5);

    const lowBucket = buckets.find((b) => b.label.startsWith('3-4'))!;
    expect(lowBucket.sampleSize).toBe(1);
    expect(lowBucket.actualWinRatePct).toBe(0);

    const emptyBucket = buckets.find((b) => b.label.startsWith('1-2'))!;
    expect(emptyBucket.sampleSize).toBe(0);
    expect(emptyBucket.actualWinRatePct).toBeNull();
  });

  it('flags small-sample buckets rather than presenting them as statistically meaningful', () => {
    const graded: CalibrationGradedInput[] = [{ wasCorrect: true, alpha90d: 1, confidenceScore: 7 }];
    const { buckets } = computeCalibrationMetrics(graded);
    const bucket = buckets.find((b) => b.label.startsWith('7-8'))!;
    expect(bucket.sampleSize).toBe(1);
    expect(bucket.note).toMatch(/too small/i);
  });

  it('computes a perfect Brier score of 0 when confidence exactly matches outcomes', () => {
    // confidenceScore 10 -> predicted probability 1.0, and it was correct (actual 1) => (1-1)^2 = 0
    // confidenceScore 1 -> predicted probability 0.1, and it was wrong (actual 0) => (0.1-0)^2 = 0.01
    const graded: CalibrationGradedInput[] = [
      { wasCorrect: true, alpha90d: 1, confidenceScore: 10 },
      { wasCorrect: true, alpha90d: 1, confidenceScore: 10 },
    ];
    const { overallBrierScore } = computeCalibrationMetrics(graded);
    expect(overallBrierScore).toBe(0);
  });

  it('computes a worse (higher) Brier score for confidently wrong calls', () => {
    const confidentAndRight: CalibrationGradedInput[] = [{ wasCorrect: true, alpha90d: 1, confidenceScore: 10 }];
    const confidentAndWrong: CalibrationGradedInput[] = [{ wasCorrect: false, alpha90d: -1, confidenceScore: 10 }];
    const right = computeCalibrationMetrics(confidentAndRight).overallBrierScore!;
    const wrong = computeCalibrationMetrics(confidentAndWrong).overallBrierScore!;
    expect(wrong).toBeGreaterThan(right);
  });

  it('returns null rather than a fabricated score with zero graded outcomes', () => {
    const { overallBrierScore, buckets } = computeCalibrationMetrics([]);
    expect(overallBrierScore).toBeNull();
    expect(buckets.every((b) => b.sampleSize === 0)).toBe(true);
  });
});
