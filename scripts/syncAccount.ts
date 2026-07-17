/**
 * Local CLI for the Phase 3.5 live-evaluation sync workflow.
 *
 * Usage:
 *   npm run sync:account -- ./account-snapshot.json
 *   cat account-snapshot.json | npm run sync:account -- --stdin
 *
 * Reads one account-sync payload (see lib/domain/accountSyncSchema.ts),
 * validates and idempotently syncs it, then — on success — runs the same
 * six jobs the workflow depends on (portfolio refresh, risk assessment,
 * thesis review, recommendation generation, portfolio health, daily
 * briefing). This talks to Postgres directly via DATABASE_URL; it does not
 * require `npm run dev`/`next start` to be running. It never talks to
 * Robinhood itself — the JSON payload is expected to already have been
 * produced by an agent session with the Robinhood Agentic Trading MCP
 * connector active, reading real account state.
 */
import { readFileSync } from 'fs';
import { syncAccount } from '../lib/domain/accountSync';
import { runPostSyncPipeline } from '../lib/domain/accountSyncPipeline';
import { prisma } from '../lib/prisma';

function readInput(): unknown {
  const args = process.argv.slice(2);
  const stdinFlagIndex = args.indexOf('--stdin');
  if (stdinFlagIndex !== -1) {
    const raw = readFileSync(0, 'utf-8'); // fd 0 = stdin
    return JSON.parse(raw);
  }
  const filePath = args.find((a) => !a.startsWith('--'));
  if (!filePath) {
    console.error('Usage: npm run sync:account -- <path-to-json>   (or --stdin)');
    process.exit(2);
  }
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function main() {
  let payload: unknown;
  try {
    payload = readInput();
  } catch (err) {
    console.error(`Failed to read/parse input: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  const result = await syncAccount(payload, 'cli');

  console.log('\n=== Account Sync ===');
  console.log(`Success: ${result.success}`);
  console.log(`Schema version: ${result.schemaVersion}`);
  console.log(`Records added: ${result.recordsAdded}`);
  console.log(`Records updated: ${result.recordsUpdated}`);
  console.log(`Records skipped (already synced): ${result.recordsSkipped}`);
  console.log(`Sync log id: ${result.syncLogId}`);

  if (result.errors.length > 0) {
    console.log('\nErrors (sync rejected):');
    for (const e of result.errors) console.log(`  - ${e}`);
  }
  if (result.warnings.length > 0) {
    console.log('\nReconciliation warnings:');
    for (const w of result.warnings) console.log(`  - ${w}`);
  }

  if (!result.success) {
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('\n=== Post-sync pipeline ===');
  const pipeline = await runPostSyncPipeline();
  for (const [step, outcome] of Object.entries(pipeline.steps)) {
    if (outcome.ok) {
      console.log(`  ✓ ${step}: ${JSON.stringify(outcome.result)}`);
    } else {
      console.log(`  ✗ ${step}: ${outcome.error}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
