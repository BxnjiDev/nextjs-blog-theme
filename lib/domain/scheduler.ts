import { prisma } from '@/lib/prisma';
import type { SchedulerRunStatus } from '@prisma/client';
import { withRetry } from '@/lib/integrations/retry';
import { runPortfolioRefreshJob } from '@/lib/jobs/refreshPortfolio';
import { runFundamentalsIngestJob } from '@/lib/jobs/ingestFundamentals';
import { runEarningsIngestJob } from '@/lib/jobs/ingestEarnings';
import { runNewsMonitorJob } from '@/lib/jobs/monitorNews';
import { runFilingsMonitorJob } from '@/lib/jobs/monitorFilings';
import { runRiskAssessmentJob } from '@/lib/jobs/generateRiskAssessment';
import { runThesisJob } from '@/lib/jobs/generateThesis';
import { runRecommendationJob } from '@/lib/jobs/generateRecommendations';
import { runPortfolioHealthJob } from '@/lib/jobs/generatePortfolioHealth';
import { runOpportunityComparisonJob } from '@/lib/jobs/generateOpportunityComparisons';
import { runStrategyMonitoringJob } from '@/lib/jobs/monitorStrategy';
import { runRecommendationOutcomesJob } from '@/lib/jobs/trackRecommendationOutcomes';
import { runBriefingJob } from '@/lib/jobs/generateBriefing';
import { runAlertDeliveryJob } from '@/lib/jobs/deliverAlerts';
import { runLearningSuite } from './learningSuite';
import { pruneOldProviderCallLogs } from './dataFreshness';
import { runRobinhoodSyncIngest } from './robinhoodSyncIngest';

/** How long a claimed lock is honored before it's considered abandoned
 * (e.g. the process was killed mid-run, or the MacBook slept hard enough
 * to lose the process) — long enough for the slowest real job (AI-backed
 * recommendation generation across a full portfolio) to finish, short
 * enough that a genuinely stuck job doesn't block the next scheduled run
 * for long. */
const LOCK_LEASE_MINUTES = 20;
/** Job-level retry: these are expensive, multi-network-call jobs, not a
 * single provider call (which already retries internally via
 * lib/integrations/retry.ts) — 2 attempts with a real gap covers the
 * common case of "the network wasn't up yet right after the Mac woke". */
const JOB_RETRY_ATTEMPTS = 2;
const JOB_RETRY_BASE_DELAY_MS = 5000;

async function checkAccountSyncFreshness(): Promise<{ overdueSyncHours: number | null; note: string }> {
  const latest = await prisma.syncLog.findFirst({ where: { success: true }, orderBy: { syncedAt: 'desc' } });
  if (!latest) return { overdueSyncHours: null, note: 'No successful Robinhood sync on record yet — run `npm run sync:account` once connected.' };
  const ageHours = (Date.now() - latest.syncedAt.getTime()) / (1000 * 60 * 60);
  return {
    overdueSyncHours: ageHours > 24 ? ageHours : null,
    note: ageHours > 24 ? `Last successful sync was ${ageHours.toFixed(0)}h ago — run \`npm run sync:account\` before relying on today's recommendations.` : `Last synced ${ageHours.toFixed(1)}h ago.`,
  };
}

/**
 * Every schedulable unit of work, reusing the exact job functions the
 * /api/jobs/* routes already call — this scheduler doesn't reimplement or
 * duplicate any job logic, it only adds locking/retry/history/enable-
 * disable on top. Order matches the existing post-sync pipeline's
 * dependency order (lib/domain/accountSyncPipeline.ts) and vercel.json's
 * cron schedule, so `runAllJobs()` produces the same end state either
 * pipeline would.
 *
 * `accountSyncPrep` is deliberately NOT a real sync — no backend process
 * can call Robinhood (see ARCHITECTURE.md's "Execution boundary"), so
 * this is a readiness check/reminder, not automation of step 1 of the
 * workflow, which stays inherently manual/agent-driven.
 */
export const JOB_REGISTRY: Record<string, { label: string; run: () => Promise<unknown> }> = {
  accountSyncPrep: { label: 'Morning account sync freshness check', run: checkAccountSyncFreshness },
  /// Processes whatever's waiting in data/robinhood-inbox/ (see
  /// lib/domain/robinhoodSyncIngest.ts) — the automatable half of the
  /// Robinhood sync workflow. Fetching the data still requires an agent
  /// session with the MCP connector active; this job just means once that
  /// data lands on disk, nothing further needs to happen by hand.
  robinhoodSyncIngest: { label: 'Robinhood inbox sync', run: runRobinhoodSyncIngest },
  marketDataRefresh: { label: 'Market-data refresh', run: runPortfolioRefreshJob },
  fundamentalsRefresh: { label: 'Fundamentals refresh', run: runFundamentalsIngestJob },
  earningsRefresh: { label: 'Earnings refresh', run: runEarningsIngestJob },
  newsRefresh: { label: 'News refresh', run: runNewsMonitorJob },
  filingsMonitor: { label: 'SEC filings monitor', run: runFilingsMonitorJob },
  riskAssessment: { label: 'Risk assessment', run: runRiskAssessmentJob },
  thesisReview: { label: 'Thesis review', run: () => runThesisJob() },
  recommendationGeneration: { label: 'Recommendation generation', run: () => runRecommendationJob() },
  portfolioHealth: { label: 'Portfolio health calculation', run: runPortfolioHealthJob },
  opportunityComparison: { label: 'Opportunity comparison', run: runOpportunityComparisonJob },
  strategyMonitoring: { label: 'Strategy & market monitoring', run: runStrategyMonitoringJob },
  outcomeTracking: { label: 'Outcome tracking', run: runRecommendationOutcomesJob },
  dailyBriefing: { label: 'Daily briefing', run: runBriefingJob },
  alertDelivery: { label: 'Alert delivery', run: runAlertDeliveryJob },
  weeklyLearning: { label: 'Weekly learning + scorecard update (includes provider-log pruning)', run: runLearningSuite },
  pruneProviderLogs: { label: 'Provider-log pruning (standalone — already included in weeklyLearning)', run: () => pruneOldProviderCallLogs() },
};

/** Dependency order for `runAllJobs()` — refresh before anything that
 * reads fresh quotes; risk/thesis before health/recommendations; briefing
 * last since it reads everything. Matches accountSyncPipeline.ts. */
export const RUN_ALL_ORDER = [
  'accountSyncPrep',
  'robinhoodSyncIngest',
  'marketDataRefresh',
  'fundamentalsRefresh',
  'earningsRefresh',
  'newsRefresh',
  'filingsMonitor',
  'riskAssessment',
  'thesisReview',
  'recommendationGeneration',
  'portfolioHealth',
  'opportunityComparison',
  'strategyMonitoring',
  'outcomeTracking',
  'dailyBriefing',
  'alertDelivery',
];

export interface JobRunOutcome {
  jobName: string;
  status: SchedulerRunStatus;
  schedulerRunId: string | null;
}

function resultLooksLikeWarning(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.errors) && r.errors.length > 0) return true;
  if (typeof r.ok === 'boolean' && r.ok === false) return true;
  return false;
}

/** Atomically claims the lease-based lock for one job — an INSERT ...
 * ON CONFLICT DO UPDATE ... WHERE the existing lease has already expired,
 * so two overlapping scheduler invocations (e.g. a manual `npm run
 * scheduler run X` firing while launchd's scheduled run is still mid-flight)
 * can never both proceed. Returns whether the lock was actually claimed. */
async function acquireLock(jobName: string): Promise<boolean> {
  const leaseUntil = new Date(Date.now() + LOCK_LEASE_MINUTES * 60 * 1000);
  const holder = process.env.SCHEDULER_HOLDER || `${process.platform}:${process.pid}`;
  const affected = await prisma.$executeRaw`
    INSERT INTO "SchedulerLock" ("jobName", "lockedAt", "leaseUntil", "holder")
    VALUES (${jobName}, now(), ${leaseUntil}, ${holder})
    ON CONFLICT ("jobName") DO UPDATE
      SET "lockedAt" = now(), "leaseUntil" = ${leaseUntil}, "holder" = ${holder}
      WHERE "SchedulerLock"."leaseUntil" < now()
  `;
  return affected > 0;
}

/** Releases immediately on completion (success or failure) rather than
 * waiting out the full lease, so the next scheduled run doesn't need to
 * wait — the lease is only a safety net for a crashed/killed process. */
async function releaseLock(jobName: string): Promise<void> {
  await prisma.$executeRaw`UPDATE "SchedulerLock" SET "leaseUntil" = now() WHERE "jobName" = ${jobName}`;
}

/**
 * Runs one registered job with locking, retry, and full run-history
 * logging. Never throws — a failure is recorded as a FAILURE-status
 * SchedulerRun and returned, not thrown, so `runAllJobs()` can continue
 * past it.
 */
export async function runJob(jobName: string, trigger: 'scheduled' | 'manual' = 'manual'): Promise<JobRunOutcome> {
  const job = JOB_REGISTRY[jobName];
  if (!job) throw new Error(`Unknown scheduler job "${jobName}". Known jobs: ${Object.keys(JOB_REGISTRY).join(', ')}`);

  const config = await prisma.schedulerJobConfig.findUnique({ where: { jobName } });
  if (config && !config.enabled) {
    const run = await prisma.schedulerRun.create({ data: { jobName, status: 'SKIPPED', trigger, finishedAt: new Date(), error: 'Job is disabled.' } });
    return { jobName, status: 'SKIPPED', schedulerRunId: run.id };
  }

  const locked = await acquireLock(jobName);
  if (!locked) {
    const run = await prisma.schedulerRun.create({
      data: { jobName, status: 'SKIPPED', trigger, finishedAt: new Date(), error: 'Another run of this job is already in progress (lock held).' },
    });
    return { jobName, status: 'SKIPPED', schedulerRunId: run.id };
  }

  const run = await prisma.schedulerRun.create({ data: { jobName, status: 'RUNNING', trigger, attempt: 1 } });
  const start = Date.now();
  let attempt = 0;

  try {
    const result = await withRetry(
      async () => {
        attempt++;
        return job.run();
      },
      { attempts: JOB_RETRY_ATTEMPTS, baseDelayMs: JOB_RETRY_BASE_DELAY_MS }
    );

    const status: SchedulerRunStatus = resultLooksLikeWarning(result) ? 'WARNING' : 'SUCCESS';
    await prisma.schedulerRun.update({
      where: { id: run.id },
      data: {
        status,
        attempt,
        finishedAt: new Date(),
        durationMs: Date.now() - start,
        result: JSON.parse(JSON.stringify(result ?? null)),
      },
    });
    return { jobName, status, schedulerRunId: run.id };
  } catch (err) {
    await prisma.schedulerRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILURE',
        attempt,
        finishedAt: new Date(),
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return { jobName, status: 'FAILURE', schedulerRunId: run.id };
  } finally {
    await releaseLock(jobName);
  }
}

/** Runs every job in RUN_ALL_ORDER, best-effort — one job failing doesn't
 * stop the rest, matching accountSyncPipeline.ts's philosophy. Each job's
 * own idempotency window (e.g. RECOMMENDATION_REFRESH_HOURS) is what makes
 * this safe to call after a missed scheduled run: it just produces
 * up-to-date data instead of duplicating anything, no special "catch up"
 * logic needed here. */
export async function runAllJobs(trigger: 'scheduled' | 'manual' = 'manual'): Promise<JobRunOutcome[]> {
  const outcomes: JobRunOutcome[] = [];
  for (const jobName of RUN_ALL_ORDER) {
    outcomes.push(await runJob(jobName, trigger));
  }
  return outcomes;
}

export interface SchedulerJobStatus {
  jobName: string;
  label: string;
  enabled: boolean;
  locked: boolean;
  lastRun: {
    status: SchedulerRunStatus;
    trigger: string;
    startedAt: Date;
    finishedAt: Date | null;
    durationMs: number | null;
    error: string | null;
  } | null;
}

/** Everything the ops dashboard (/connections) and `npm run scheduler
 * status` need — one query per job for its config/lock/latest run,
 * reusing the same SchedulerRun/SchedulerLock/SchedulerJobConfig tables
 * runJob() writes to. */
export async function getSchedulerStatus(): Promise<SchedulerJobStatus[]> {
  const jobNames = Object.keys(JOB_REGISTRY);
  return Promise.all(
    jobNames.map(async (jobName) => {
      const [config, lock, lastRun] = await Promise.all([
        prisma.schedulerJobConfig.findUnique({ where: { jobName } }),
        prisma.schedulerLock.findUnique({ where: { jobName } }),
        prisma.schedulerRun.findFirst({ where: { jobName }, orderBy: { startedAt: 'desc' } }),
      ]);
      return {
        jobName,
        label: JOB_REGISTRY[jobName].label,
        enabled: config?.enabled ?? true,
        locked: Boolean(lock && lock.leaseUntil.getTime() > Date.now()),
        lastRun: lastRun
          ? {
              status: lastRun.status,
              trigger: lastRun.trigger,
              startedAt: lastRun.startedAt,
              finishedAt: lastRun.finishedAt,
              durationMs: lastRun.durationMs,
              error: lastRun.error,
            }
          : null,
      };
    })
  );
}

export async function setJobEnabled(jobName: string, enabled: boolean): Promise<void> {
  if (!JOB_REGISTRY[jobName]) throw new Error(`Unknown scheduler job "${jobName}".`);
  await prisma.schedulerJobConfig.upsert({
    where: { jobName },
    update: { enabled },
    create: { jobName, enabled },
  });
}
