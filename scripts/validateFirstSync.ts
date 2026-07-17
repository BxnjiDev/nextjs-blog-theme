/**
 * First-live-sync validation report (Phase 3.7).
 *
 * Usage:
 *   npm run sync:validate
 *
 * Reads the most recent SyncLog (from `npm run sync:account` or the
 * `/api/sync/account` route — whichever ran last) and prints a field-by-
 * field Atlas-vs-Robinhood comparison: exact matches, tolerance-based
 * matches, mismatches, missing/unsupported fields, and an overall readiness
 * verdict. Run this once after the first real Robinhood sync to decide
 * whether Atlas's numbers can be trusted for recommendation-only testing —
 * it reads the database directly and never talks to Robinhood itself.
 */
import { getFirstSyncValidationReport } from '../lib/domain/firstSyncValidation';
import { prisma } from '../lib/prisma';

function fmt(value: number | string | null): string {
  if (value === null) return '(unavailable)';
  return typeof value === 'number' ? value.toString() : value;
}

async function main() {
  const report = await getFirstSyncValidationReport();

  console.log('\n=== First-Live-Sync Validation Report ===');
  if (!report.found) {
    console.log('No sync has been recorded yet. Run `npm run sync:account -- <payload.json>` first.');
    console.log('\nOverall readiness: NOT_READY');
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`Sync log id: ${report.syncLogId}`);
  console.log(`Synced at: ${report.syncedAt?.toISOString()}`);
  console.log(`Account id: ${report.accountId}`);
  console.log(`Sync succeeded: ${report.success}`);

  if (report.errors.length > 0) {
    console.log('\nErrors (sync rejected):');
    for (const e of report.errors) console.log(`  - ${e}`);
  }
  if (report.warnings.length > 0) {
    console.log('\nReconciliation warnings:');
    for (const w of report.warnings) console.log(`  - ${w}`);
  }

  if (report.details.length === 0) {
    console.log('\nNo structured field-by-field comparison is available for this sync (older SyncLog row, predates Phase 3.7).');
  } else {
    console.log('\nField-by-field comparison:');
    console.log('  Field                Symbol   Atlas            Robinhood        Status');
    console.log('  ' + '-'.repeat(88));
    for (const d of report.details) {
      const field = d.field.padEnd(20);
      const symbol = (d.symbol ?? '-').padEnd(8);
      const atlas = fmt(d.atlasValue).padEnd(16);
      const rh = fmt(d.robinhoodValue).padEnd(16);
      console.log(`  ${field} ${symbol} ${atlas} ${rh} ${d.status}`);
    }

    const counts = report.details.reduce<Record<string, number>>((acc, d) => {
      acc[d.status] = (acc[d.status] ?? 0) + 1;
      return acc;
    }, {});
    console.log('\nSummary:');
    for (const [status, count] of Object.entries(counts)) console.log(`  ${status}: ${count}`);
  }

  console.log(`\nOverall readiness: ${report.readiness}`);
  if (report.readiness === 'NOT_READY') {
    console.log('Atlas does not yet have a trustworthy picture of this account. Fix the errors/mismatches above and re-sync before generating recommendations.');
  } else if (report.readiness === 'READY_WITH_WARNINGS') {
    console.log('Atlas can be used for recommendation-only testing, but review the warnings/mismatches above — they reflect fields Atlas can\'t fully verify or that disagree slightly with Robinhood.');
  } else {
    console.log('Atlas\'s account state matches Robinhood\'s within tolerance on every checked field. Safe to proceed with recommendation-only testing.');
  }

  await prisma.$disconnect();
  process.exit(report.readiness === 'NOT_READY' ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
