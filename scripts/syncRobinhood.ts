/**
 * One-shot processor for the Robinhood sync inbox (data/robinhood-inbox/).
 *
 * Usage:
 *   npm run sync:robinhood
 *
 * This does NOT fetch anything from Robinhood itself — nothing in this
 * codebase can (see ARCHITECTURE.md's "Execution boundary" and
 * lib/domain/robinhoodSyncIngest.ts's module docstring for why). It
 * processes whatever payload file(s) an agent session with the Robinhood
 * Agentic Trading MCP connector active has already dropped into the inbox
 * — validating, syncing, and running the post-sync pipeline exactly like
 * `npm run sync:account` does for a single file, except pointed at the
 * inbox directory and going through the scheduler (lib/domain/scheduler.ts)
 * for locking/retry/run-history. Safe to run with nothing waiting — it's a
 * no-op in that case. For continuous processing, use `npm run
 * sync:robinhood:watch` instead.
 */
import { prisma } from '../lib/prisma';
import { runJob } from '../lib/domain/scheduler';
import { ROBINHOOD_INBOX_DIR, type RobinhoodIngestResult } from '../lib/domain/robinhoodSyncIngest';

async function main() {
  console.log(`Checking ${ROBINHOOD_INBOX_DIR} for a payload to sync...`);
  const outcome = await runJob('robinhoodSyncIngest', 'manual');
  const run = await prisma.schedulerRun.findUnique({ where: { id: outcome.schedulerRunId! } });
  const result = run?.result as unknown as RobinhoodIngestResult | null;

  console.log(`\nStatus: ${outcome.status}`);
  if (result) {
    console.log(`Files found: ${result.filesFound}`);
    console.log(`Synced: ${result.synced}`);
    console.log(`Rejected: ${result.rejected}`);
    if (result.errors.length > 0) {
      console.log('Errors:');
      for (const e of result.errors) console.log(`  - ${e}`);
    }
    if (result.pipelineRan) console.log('Post-sync pipeline ran.');
  } else if (run?.error) {
    console.log(`Error: ${run.error}`);
  }

  await prisma.$disconnect();
  process.exit(outcome.status === 'FAILURE' ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
