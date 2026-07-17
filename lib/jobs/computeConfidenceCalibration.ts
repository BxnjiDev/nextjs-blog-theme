import { prisma } from '@/lib/prisma';

export interface ConfidenceCalibrationJobResult {
  skipped: boolean;
  sampleSize?: number;
  overallBrierScore?: number | null;
}

interface Bucket {
  label: string;
  min: number;
  max: number;
}

export interface CalibrationBucketResult {
  label: string;
  sampleSize: number;
  avgPredictedConfidence: number | null;
  actualWinRatePct: number | null;
  avgAlpha90d: number | null;
  note: string | null;
}

export interface CalibrationGradedInput {
  wasCorrect: boolean | null;
  alpha90d: number | null;
  confidenceScore: number;
}

export interface CalibrationMetrics {
  buckets: CalibrationBucketResult[];
  overallBrierScore: number | null;
}

/** confidenceScore is 1-10; treated as decile confidence bands (spec's
 * "50-60%, 60-70%..." examples map naturally onto this 5-bucket scale). */
const BUCKETS: Bucket[] = [
  { label: '1-2 (~10-20%)', min: 1, max: 2 },
  { label: '3-4 (~30-40%)', min: 3, max: 4 },
  { label: '5-6 (~50-60%)', min: 5, max: 6 },
  { label: '7-8 (~70-80%)', min: 7, max: 8 },
  { label: '9-10 (~90-100%)', min: 9, max: 10 },
];

/**
 * Pure computation, split out from runConfidenceCalibrationJob() so it's
 * replayable against hand-crafted historical outcomes in tests without
 * touching the database — the exact same function the real job calls
 * against live RecommendationOutcome rows. overallBrierScore is a real
 * statistical calibration metric — mean squared error between predicted
 * probability (confidenceScore/10) and the binary outcome — not a made-up
 * score. Small-sample buckets are labeled as such rather than presented as
 * statistically meaningful.
 */
export function computeCalibrationMetrics(graded: CalibrationGradedInput[]): CalibrationMetrics {
  const buckets = BUCKETS.map((b) => {
    const inBucket = graded.filter((g) => g.confidenceScore >= b.min && g.confidenceScore <= b.max);
    const sampleSize = inBucket.length;
    const avgPredictedConfidence = sampleSize > 0 ? inBucket.reduce((s, g) => s + g.confidenceScore, 0) / sampleSize / 10 : null;
    const wins = inBucket.filter((g) => g.wasCorrect === true).length;
    const actualWinRatePct = sampleSize > 0 ? (wins / sampleSize) * 100 : null;
    const alphaValues = inBucket.map((g) => g.alpha90d).filter((v): v is number => v !== null);
    const avgAlpha90d = alphaValues.length > 0 ? alphaValues.reduce((a, b2) => a + b2, 0) / alphaValues.length : null;

    return {
      label: b.label,
      sampleSize,
      avgPredictedConfidence,
      actualWinRatePct,
      avgAlpha90d,
      note: sampleSize < 5 ? 'Sample size too small to be statistically meaningful — directional only.' : null,
    };
  });

  const brierTerms = graded.map((g) => {
    const predicted = g.confidenceScore / 10;
    const actual = g.wasCorrect ? 1 : 0;
    return (predicted - actual) ** 2;
  });
  const overallBrierScore = brierTerms.length > 0 ? brierTerms.reduce((a, b) => a + b, 0) / brierTerms.length : null;

  return { buckets, overallBrierScore };
}

/**
 * Append-only calibration run: compares stated confidence against actual
 * win rate (from lib/jobs/evaluateRecommendations.ts's deterministic
 * wasCorrect grading).
 */
export async function runConfidenceCalibrationJob(): Promise<ConfidenceCalibrationJobResult> {
  const graded = await prisma.recommendationOutcome.findMany({
    where: { wasCorrect: { not: null } },
    include: { recommendation: { select: { confidenceScore: true } } },
  });

  if (graded.length === 0) return { skipped: true };

  const { buckets, overallBrierScore } = computeCalibrationMetrics(
    graded.map((g) => ({ wasCorrect: g.wasCorrect, alpha90d: g.alpha90d, confidenceScore: g.recommendation.confidenceScore }))
  );

  await prisma.confidenceCalibration.create({
    data: {
      buckets: JSON.parse(JSON.stringify(buckets)),
      overallBrierScore,
      sampleSize: graded.length,
      methodology: {
        bucketing: 'confidenceScore (1-10) grouped into 5 decile bands',
        wasCorrect: 'graded in lib/jobs/evaluateRecommendations.ts against alpha vs. SPY, not raw return',
        brierScore: 'mean((confidenceScore/10 - actualOutcome)^2) across all graded recommendations; lower is better calibrated',
        minSampleSizeForSignificance: 5,
      },
    },
  });

  return { skipped: false, sampleSize: graded.length, overallBrierScore };
}
