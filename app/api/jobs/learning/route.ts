import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuthorized } from '@/lib/jobs/auth';
import { runRecommendationLearningJob } from '@/lib/jobs/evaluateRecommendations';
import { runConfidenceCalibrationJob } from '@/lib/jobs/computeConfidenceCalibration';
import { runThesisAccuracyJob } from '@/lib/jobs/computeThesisAccuracy';
import { runScorecardJob } from '@/lib/jobs/computeScorecard';
import { runPatternDetectionJob } from '@/lib/jobs/detectPatterns';

export const dynamic = 'force-dynamic';

/**
 * Runs the continuous-learning suite in one route. These five jobs are
 * grouped under a single weekly cron entry (rather than five separate
 * cron entries) because they're all low-frequency aggregations that only
 * become meaningful once real time has elapsed — see vercel.json and
 * ARCHITECTURE.md for the rationale. Each sub-job is independently
 * idempotent; a failure in one does not stop the others from running.
 */
export async function GET(req: NextRequest) {
  const unauthorized = assertCronAuthorized(req);
  if (unauthorized) return unauthorized;

  const results: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  const steps: Array<[string, () => Promise<unknown>]> = [
    ['recommendationLearning', () => runRecommendationLearningJob()],
    ['confidenceCalibration', () => runConfidenceCalibrationJob()],
    ['thesisAccuracy', () => runThesisAccuracyJob()],
    ['scorecard', () => runScorecardJob()],
    ['patterns', () => runPatternDetectionJob()],
  ];

  for (const [name, run] of steps) {
    try {
      results[name] = await run();
    } catch (err) {
      errors[name] = err instanceof Error ? err.message : String(err);
      console.error(`Learning job step "${name}" failed:`, err);
    }
  }

  return NextResponse.json({ ok: Object.keys(errors).length === 0, results, errors });
}
