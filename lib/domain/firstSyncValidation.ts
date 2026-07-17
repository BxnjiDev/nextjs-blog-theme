import { prisma } from '@/lib/prisma';
import type { ReconciliationDetail } from './accountSync';

export type SyncReadinessStatus = 'READY_FOR_RECOMMENDATION_ONLY_TESTING' | 'READY_WITH_WARNINGS' | 'NOT_READY';

/** Fields whose disagreement means Atlas's core financial picture of the
 * account (cash, share counts, total equity, record completeness) can't be
 * trusted yet — that's a hard NOT_READY, not a warning. Everything else
 * compared in reconcile() (avg cost basis, market value, unrealized/realized
 * P&L, buying power) is expected to sometimes disagree with Robinhood by a
 * little (quote timing, provider rounding) and only downgrades to
 * READY_WITH_WARNINGS. */
const CRITICAL_FIELDS = new Set(['cashBalance', 'quantity', 'totalEquity', 'transactions', 'openOrders']);

export interface SyncLogForValidation {
  success: boolean;
  errors: string[];
  warnings: string[];
}

/** Pure — takes exactly what's needed to decide, nothing DB-shaped, so it's
 * trivially unit-testable and reusable from both the CLI and (later) a page. */
export function computeReadinessStatus(syncLog: SyncLogForValidation, details: ReconciliationDetail[]): SyncReadinessStatus {
  if (!syncLog.success || syncLog.errors.length > 0) return 'NOT_READY';

  const criticalMismatch = details.some((d) => d.status === 'MISMATCH' && CRITICAL_FIELDS.has(d.field));
  if (criticalMismatch) return 'NOT_READY';

  const hasNonCriticalIssue =
    syncLog.warnings.length > 0 ||
    details.some((d) => d.status === 'MISMATCH' || d.status === 'TOLERANCE_MATCH' || d.status === 'MISSING_FIELD');

  return hasNonCriticalIssue ? 'READY_WITH_WARNINGS' : 'READY_FOR_RECOMMENDATION_ONLY_TESTING';
}

export interface FirstSyncValidationReport {
  found: boolean;
  syncLogId: string | null;
  syncedAt: Date | null;
  accountId: string | null;
  success: boolean;
  errors: string[];
  warnings: string[];
  details: ReconciliationDetail[];
  readiness: SyncReadinessStatus;
}

/** Loads the most recent SyncLog (any source: CLI or API route — whichever
 * ran last) and applies computeReadinessStatus to it. Returns
 * found:false if no sync has ever been recorded. */
export async function getFirstSyncValidationReport(): Promise<FirstSyncValidationReport> {
  const latest = await prisma.syncLog.findFirst({ orderBy: { syncedAt: 'desc' } });
  if (!latest) {
    return {
      found: false,
      syncLogId: null,
      syncedAt: null,
      accountId: null,
      success: false,
      errors: [],
      warnings: [],
      details: [],
      readiness: 'NOT_READY',
    };
  }
  const details = (Array.isArray(latest.reconciliationDetails) ? latest.reconciliationDetails : []) as unknown as ReconciliationDetail[];
  const errors = (Array.isArray(latest.errors) ? latest.errors : []) as unknown as string[];
  const warnings = (Array.isArray(latest.warnings) ? latest.warnings : []) as unknown as string[];
  const readiness = computeReadinessStatus({ success: latest.success, errors, warnings }, details);
  return {
    found: true,
    syncLogId: latest.id,
    syncedAt: latest.syncedAt,
    accountId: latest.accountId,
    success: latest.success,
    errors,
    warnings,
    details,
    readiness,
  };
}
