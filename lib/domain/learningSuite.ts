import { runRecommendationLearningJob } from '@/lib/jobs/evaluateRecommendations';
import { runConfidenceCalibrationJob } from '@/lib/jobs/computeConfidenceCalibration';
import { runThesisAccuracyJob } from '@/lib/jobs/computeThesisAccuracy';
import { runScorecardJob } from '@/lib/jobs/computeScorecard';
import { runPatternDetectionJob } from '@/lib/jobs/detectPatterns';
import { pruneOldProviderCallLogs } from './dataFreshness';

export interface LearningSuiteResult {
  ok: boolean;
  results: Record<string, unknown>;
  errors: Record<string, string>;
}

/**
 * The continuous-learning suite, plus ProviderCallLog housekeeping —
 * extracted so /api/jobs/learning (the existing weekly cron entry) and
 * lib/domain/scheduler.ts (Phase 3.7's local scheduler, `npm run scheduler`)
 * share exactly one implementation instead of two copies of this step
 * list drifting apart. Each sub-job is independently idempotent; a
 * failure in one does not stop the others from running.
 */
export async function runLearningSuite(): Promise<LearningSuiteResult> {
  const results: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  const steps: Array<[string, () => Promise<unknown>]> = [
    ['recommendationLearning', () => runRecommendationLearningJob()],
    ['confidenceCalibration', () => runConfidenceCalibrationJob()],
    ['thesisAccuracy', () => runThesisAccuracyJob()],
    ['scorecard', () => runScorecardJob()],
    ['patterns', () => runPatternDetectionJob()],
    ['pruneProviderCallLogs', () => pruneOldProviderCallLogs()],
  ];

  for (const [name, run] of steps) {
    try {
      results[name] = await run();
    } catch (err) {
      errors[name] = err instanceof Error ? err.message : String(err);
      console.error(`Learning job step "${name}" failed:`, err);
    }
  }

  return { ok: Object.keys(errors).length === 0, results, errors };
}
