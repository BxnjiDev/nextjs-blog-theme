import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { JOB_REGISTRY, runJob, setJobEnabled, getSchedulerStatus } from './scheduler';

/**
 * Real integration tests against the dev Postgres database — the locking
 * behavior specifically only means anything against a real DB (it's an
 * atomic INSERT ... ON CONFLICT ... WHERE), so this doesn't mock Prisma.
 * Registers a temporary fake job in JOB_REGISTRY (removed afterward)
 * rather than exercising a real job function, so these tests are fast and
 * don't depend on network/AI providers.
 */
const TEST_JOB = '__test_scheduler_job__';

async function cleanupJobRows() {
  await prisma.schedulerRun.deleteMany({ where: { jobName: TEST_JOB } });
  await prisma.schedulerLock.deleteMany({ where: { jobName: TEST_JOB } });
  await prisma.schedulerJobConfig.deleteMany({ where: { jobName: TEST_JOB } });
}

beforeEach(async () => {
  await cleanupJobRows();
});

afterEach(() => {
  delete JOB_REGISTRY[TEST_JOB];
});

afterAll(async () => {
  await cleanupJobRows();
});

describe('runJob', () => {
  it('records a SUCCESS run for a job that resolves cleanly', async () => {
    JOB_REGISTRY[TEST_JOB] = { label: 'test', run: async () => ({ ok: true }) };
    const outcome = await runJob(TEST_JOB, 'manual');
    expect(outcome.status).toBe('SUCCESS');

    const run = await prisma.schedulerRun.findUniqueOrThrow({ where: { id: outcome.schedulerRunId! } });
    expect(run.status).toBe('SUCCESS');
    expect(run.finishedAt).not.toBeNull();
    expect(run.durationMs).not.toBeNull();
  });

  it('records WARNING when the job result itself reports errors', async () => {
    JOB_REGISTRY[TEST_JOB] = { label: 'test', run: async () => ({ errors: ['something minor'] }) };
    const outcome = await runJob(TEST_JOB, 'manual');
    expect(outcome.status).toBe('WARNING');
  });

  it(
    'retries a failing job before recording FAILURE, and records the attempt count',
    async () => {
      let calls = 0;
      JOB_REGISTRY[TEST_JOB] = {
        label: 'test',
        run: async () => {
          calls++;
          throw new Error('boom');
        },
      };
      const outcome = await runJob(TEST_JOB, 'manual');
      expect(outcome.status).toBe('FAILURE');
      expect(calls).toBeGreaterThanOrEqual(2); // JOB_RETRY_ATTEMPTS

      const run = await prisma.schedulerRun.findUniqueOrThrow({ where: { id: outcome.schedulerRunId! } });
      expect(run.error).toContain('boom');
      expect(run.attempt).toBe(calls);
    },
    15000 // job-level retry backoff (JOB_RETRY_BASE_DELAY_MS=5000) alone exceeds vitest's default 5s test timeout
  );

  it('releases the lock after completion so the next run is not blocked', async () => {
    JOB_REGISTRY[TEST_JOB] = { label: 'test', run: async () => ({ ok: true }) };
    await runJob(TEST_JOB, 'manual');
    const second = await runJob(TEST_JOB, 'manual');
    expect(second.status).toBe('SUCCESS'); // not SKIPPED — lock was released
  });

  it('skips a run when the job is disabled', async () => {
    JOB_REGISTRY[TEST_JOB] = { label: 'test', run: async () => ({ ok: true }) };
    await setJobEnabled(TEST_JOB, false);
    const outcome = await runJob(TEST_JOB, 'manual');
    expect(outcome.status).toBe('SKIPPED');

    await setJobEnabled(TEST_JOB, true);
    const reEnabled = await runJob(TEST_JOB, 'manual');
    expect(reEnabled.status).toBe('SUCCESS');
  });

  it('skips an overlapping run while the same job is still in flight (lock held)', async () => {
    let releaseFirst: (() => void) | null = null;
    const firstRunStarted = new Promise<void>((resolveStarted) => {
      JOB_REGISTRY[TEST_JOB] = {
        label: 'test',
        run: () =>
          new Promise((resolveRun) => {
            releaseFirst = () => resolveRun({ ok: true });
            resolveStarted();
          }),
      };
    });

    const firstRunPromise = runJob(TEST_JOB, 'manual');
    await firstRunStarted;
    // The first run has claimed the lock but not finished — a second
    // attempt right now must be skipped, not run concurrently.
    const secondOutcome = await runJob(TEST_JOB, 'manual');
    expect(secondOutcome.status).toBe('SKIPPED');

    releaseFirst!();
    const firstOutcome = await firstRunPromise;
    expect(firstOutcome.status).toBe('SUCCESS');
  });
});

describe('getSchedulerStatus', () => {
  it('reflects enabled/disabled state and the most recent run', async () => {
    JOB_REGISTRY[TEST_JOB] = { label: 'Test Job Label', run: async () => ({ ok: true }) };
    await runJob(TEST_JOB, 'scheduled');

    const status = await getSchedulerStatus();
    const entry = status.find((s) => s.jobName === TEST_JOB)!;
    expect(entry.label).toBe('Test Job Label');
    expect(entry.enabled).toBe(true);
    expect(entry.locked).toBe(false);
    expect(entry.lastRun?.status).toBe('SUCCESS');
    expect(entry.lastRun?.trigger).toBe('scheduled');
  });
});
