import { runPortfolioRefreshJob } from '@/lib/jobs/refreshPortfolio';
import { runRiskAssessmentJob } from '@/lib/jobs/generateRiskAssessment';
import { runPortfolioHealthJob } from '@/lib/jobs/generatePortfolioHealth';
import { runThesisJob } from '@/lib/jobs/generateThesis';
import { runRecommendationJob } from '@/lib/jobs/generateRecommendations';
import { runBriefingJob } from '@/lib/jobs/generateBriefing';
import { detectRecommendationDecisions } from './recommendationDecisions';
import { reconcileManualExecutions } from './executionReconciliation';

export interface PostSyncPipelineResult {
  steps: Record<string, { ok: boolean; result?: unknown; error?: string }>;
}

/**
 * Runs the same six jobs a successful sync should trigger, in the order
 * their data dependencies require: refresh needs the newly-synced holdings
 * to price the portfolio; risk and thesis both want fresh quotes from that
 * refresh; portfolio health reads the risk assessment and the thesis job's
 * conviction scores, so it has to run after both; recommendations can run
 * independently of health but after thesis so its "AI memory" sees the
 * latest conviction; the briefing reads everything, so it runs last. This
 * is the same dependency order already used by vercel.json's cron
 * schedule — no new job logic is introduced here, this only orchestrates
 * the existing job functions.
 *
 * Best-effort: one step failing doesn't stop the rest, since the sync
 * itself already succeeded and partial downstream analysis is still more
 * useful than none. Every step's outcome is reported back to the caller.
 *
 * `recommendationDecisions` and `executionReconciliation` both run first,
 * before anything else — they match the transactions this sync just
 * ingested against, respectively, still-PENDING recommendations
 * (lib/domain/recommendationDecisions.ts) and still-PENDING manually-
 * recorded executions (lib/domain/executionReconciliation.ts), so
 * downstream jobs and pages see up-to-date decision/reconciliation status.
 */
export async function runPostSyncPipeline(): Promise<PostSyncPipelineResult> {
  const steps: PostSyncPipelineResult['steps'] = {};

  const run = async (name: string, fn: () => Promise<unknown>) => {
    try {
      steps[name] = { ok: true, result: await fn() };
    } catch (err) {
      steps[name] = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  await run('recommendationDecisions', () => detectRecommendationDecisions());
  await run('executionReconciliation', () => reconcileManualExecutions());
  await run('portfolioRefresh', () => runPortfolioRefreshJob());
  await run('riskAssessment', () => runRiskAssessmentJob());
  await run('thesisReview', () => runThesisJob());
  await run('recommendationGeneration', () => runRecommendationJob());
  await run('portfolioHealth', () => runPortfolioHealthJob());
  await run('dailyBriefing', () => runBriefingJob());

  return { steps };
}
