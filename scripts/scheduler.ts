/**
 * Local operational scheduler CLI (Phase 3.7) — the recommended way to run
 * Atlas's background jobs on a MacBook without Vercel Cron. This process
 * itself does no scheduling (that's launchd's or cron's job, invoking this
 * on a timer — see docs/OPERATIONS.md for a launchd .plist template and
 * crontab alternative); what it adds on top is locking (no overlapping
 * runs of the same job), retry, and durable run history
 * (lib/domain/scheduler.ts, backed by SchedulerRun/SchedulerLock/
 * SchedulerJobConfig).
 *
 * Usage:
 *   npm run scheduler -- status
 *   npm run scheduler -- run <jobName> [--scheduled]
 *   npm run scheduler -- run-all [--scheduled]
 *   npm run scheduler -- enable <jobName>
 *   npm run scheduler -- disable <jobName>
 *   npm run scheduler -- list
 *
 * `--scheduled` marks the run's `trigger` as "scheduled" rather than
 * "manual" in its history — pass this from launchd/cron; omit it when
 * running by hand. Talks to Postgres directly via DATABASE_URL; does not
 * require `npm run dev`/`next start` to be running.
 */
import { prisma } from '../lib/prisma';
import { JOB_REGISTRY, RUN_ALL_ORDER, runJob, runAllJobs, getSchedulerStatus, setJobEnabled, type JobRunOutcome } from '../lib/domain/scheduler';

function printOutcome(outcome: JobRunOutcome): void {
  const symbol = outcome.status === 'SUCCESS' ? '✓' : outcome.status === 'WARNING' ? '⚠' : outcome.status === 'SKIPPED' ? '·' : '✗';
  console.log(`  ${symbol} ${outcome.jobName}: ${outcome.status}`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const scheduled = rest.includes('--scheduled');
  const arg = rest.find((a) => !a.startsWith('--'));

  if (!command || command === 'list') {
    console.log('Known jobs (in run-all order, plus standalone-only ones):');
    for (const jobName of RUN_ALL_ORDER) console.log(`  ${jobName} — ${JOB_REGISTRY[jobName].label}`);
    for (const jobName of Object.keys(JOB_REGISTRY)) {
      if (!RUN_ALL_ORDER.includes(jobName)) console.log(`  ${jobName} — ${JOB_REGISTRY[jobName].label} (standalone only, not part of run-all)`);
    }
    await prisma.$disconnect();
    return;
  }

  if (command === 'status') {
    const status = await getSchedulerStatus();
    console.log('=== Scheduler status ===');
    for (const s of status) {
      console.log(`\n${s.label} [${s.jobName}]`);
      console.log(`  Enabled: ${s.enabled}`);
      console.log(`  Currently running (lock held): ${s.locked}`);
      if (s.lastRun) {
        console.log(`  Last run: ${s.lastRun.status} (${s.lastRun.trigger}) started ${s.lastRun.startedAt.toISOString()}${s.lastRun.durationMs !== null ? `, took ${s.lastRun.durationMs}ms` : ''}`);
        if (s.lastRun.error) console.log(`  Last error: ${s.lastRun.error}`);
      } else {
        console.log('  Last run: never');
      }
    }
    await prisma.$disconnect();
    return;
  }

  if (command === 'run') {
    if (!arg) {
      console.error('Usage: npm run scheduler -- run <jobName> [--scheduled]');
      process.exit(2);
    }
    if (!JOB_REGISTRY[arg]) {
      console.error(`Unknown job "${arg}". Run \`npm run scheduler -- list\` to see known jobs.`);
      process.exit(2);
    }
    const outcome = await runJob(arg, scheduled ? 'scheduled' : 'manual');
    printOutcome(outcome);
    await prisma.$disconnect();
    process.exit(outcome.status === 'FAILURE' ? 1 : 0);
  }

  if (command === 'run-all') {
    console.log('=== Running all jobs ===');
    const outcomes = await runAllJobs(scheduled ? 'scheduled' : 'manual');
    for (const outcome of outcomes) printOutcome(outcome);
    const failures = outcomes.filter((o) => o.status === 'FAILURE');
    console.log(`\n${outcomes.length} job(s) run, ${failures.length} failure(s).`);
    await prisma.$disconnect();
    process.exit(failures.length > 0 ? 1 : 0);
  }

  if (command === 'enable' || command === 'disable') {
    if (!arg) {
      console.error(`Usage: npm run scheduler -- ${command} <jobName>`);
      process.exit(2);
    }
    if (!JOB_REGISTRY[arg]) {
      console.error(`Unknown job "${arg}". Run \`npm run scheduler -- list\` to see known jobs.`);
      process.exit(2);
    }
    await setJobEnabled(arg, command === 'enable');
    console.log(`${arg} is now ${command === 'enable' ? 'enabled' : 'disabled'}.`);
    await prisma.$disconnect();
    return;
  }

  console.error(`Unknown command "${command}". See this file's header comment for usage.`);
  process.exit(2);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
