import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { marketDataProvider } from '@/lib/integrations';
import { withRetry } from '@/lib/integrations/retry';
import {
  AccountSyncPayloadSchema,
  ACCOUNT_SYNC_SCHEMA_VERSION,
  type AccountSyncPayload,
} from './accountSyncSchema';
import { EVALUATION_MAX_CAPITAL, EVALUATION_CAPITAL_WARNING_MULTIPLE, MARGIN_TOLERANCE_PCT } from './evaluationConfig';

const SYNC_STALE_MINUTES = Number(process.env.SYNC_STALE_MINUTES ?? 60);
/** Tolerance for the cash/quantity reconciliation checks below — small
 * mismatches are expected (dividends, fees, rounding) and shouldn't be
 * flagged as noise. */
const CASH_RECONCILIATION_TOLERANCE = 5; // dollars
const MARKET_VALUE_RECONCILIATION_TOLERANCE_PCT = 0.05; // 5%
const FLOAT_TOLERANCE = 1e-6;

export interface SyncResult {
  success: boolean;
  accountId: string | null;
  schemaVersion: string;
  recordsAdded: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errors: string[];
  warnings: string[];
  syncLogId: string | null;
  reconciliationDetails: ReconciliationDetail[];
}

/**
 * One field-by-field Atlas-vs-Robinhood comparison, structured for
 * scripts/validateFirstSync.ts (Phase 3.7). `warnings` (free text) stays the
 * primary audit trail; this is the same underlying numbers, machine-readable.
 * `atlasValue`/`robinhoodValue` are `null` to mean "not available" — never a
 * stand-in for zero (see accountSyncSchema.ts on realizedPnl/marketValue
 * being optional).
 */
export interface ReconciliationDetail {
  field: string;
  symbol?: string;
  atlasValue: number | string | null;
  robinhoodValue: number | string | null;
  status: 'MATCH' | 'TOLERANCE_MATCH' | 'MISMATCH' | 'MISSING_FIELD' | 'NOT_INDEPENDENTLY_VERIFIABLE';
  message: string;
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** P2034: "transaction failed due to a write conflict or a deadlock" —
 * Prisma's own docs recommend retrying the whole transaction, which is
 * exactly what withRetry(..., { isRetryable: isWriteConflictError }) does
 * around the $transaction call below. Any other error is not retried, since
 * repeating a transaction that failed validation or on a real constraint
 * violation would just fail again. */
function isWriteConflictError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
}

async function writeSyncLog(input: {
  accountId: string | null;
  source: string;
  schemaVersion: string;
  payloadAsOf: Date | null;
  success: boolean;
  recordsAdded: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errors: string[];
  warnings: string[];
  reconciliationDetails?: ReconciliationDetail[];
}): Promise<string> {
  const row = await prisma.syncLog.create({
    data: {
      accountId: input.accountId,
      source: input.source,
      schemaVersion: input.schemaVersion,
      payloadAsOf: input.payloadAsOf,
      success: input.success,
      recordsAdded: input.recordsAdded,
      recordsUpdated: input.recordsUpdated,
      recordsSkipped: input.recordsSkipped,
      errors: input.errors,
      warnings: input.warnings,
      reconciliationDetails: (input.reconciliationDetails ?? []) as unknown as Prisma.InputJsonValue,
    },
  });
  return row.id;
}

/**
 * Validates, then idempotently synchronizes, one account-state snapshot
 * reported by an agent session with the Robinhood Agentic Trading MCP
 * connector active. This is the single entry point both the CLI
 * (scripts/syncAccount.ts) and the API route (app/api/sync/account) call —
 * neither has any sync logic of its own.
 *
 * Rejection (returns success:false, writes nothing but an audit row) vs.
 * warning (returns success:true, writes the sync, but flags a
 * discrepancy) is a deliberate split: malformed/incomplete/duplicated/stale
 * data is rejected outright because acting on it could corrupt the record;
 * a numeric disagreement between Atlas and Robinhood (cash, quantity, cost
 * basis, market value, transaction history) is surfaced as a warning
 * because rejecting the whole sync over it would make the account
 * impossible to keep current.
 */
export async function syncAccount(rawPayload: unknown, source: string): Promise<SyncResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- 1. Schema validation (malformed / incomplete) ---
  const parsed = AccountSyncPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    const schemaVersionGuess =
      typeof rawPayload === 'object' && rawPayload !== null && 'schemaVersion' in rawPayload
        ? String((rawPayload as Record<string, unknown>).schemaVersion)
        : 'unknown';
    const syncLogId = await writeSyncLog({
      accountId: null,
      source,
      schemaVersion: schemaVersionGuess,
      payloadAsOf: null,
      success: false,
      recordsAdded: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      errors,
      warnings,
    });
    return { success: false, accountId: null, schemaVersion: schemaVersionGuess, recordsAdded: 0, recordsUpdated: 0, recordsSkipped: 0, errors, warnings, syncLogId, reconciliationDetails: [] };
  }

  const payload: AccountSyncPayload = parsed.data;
  const asOfDate = new Date(payload.asOf);

  // --- 2. Staleness ---
  const ageMinutes = (Date.now() - asOfDate.getTime()) / 60000;
  if (ageMinutes > SYNC_STALE_MINUTES) {
    errors.push(`Payload is stale: asOf is ${ageMinutes.toFixed(0)} minutes old, exceeds the ${SYNC_STALE_MINUTES}-minute freshness threshold (SYNC_STALE_MINUTES).`);
  }
  if (ageMinutes < -5) {
    errors.push(`Payload's asOf timestamp is ${Math.abs(ageMinutes).toFixed(0)} minutes in the future — check the clock on the machine that produced it.`);
  }

  // --- 3. Internal duplicates ---
  const symbolCounts = new Map<string, number>();
  for (const h of payload.holdings) symbolCounts.set(h.symbol, (symbolCounts.get(h.symbol) ?? 0) + 1);
  const dupSymbols = [...symbolCounts.entries()].filter(([, c]) => c > 1).map(([s]) => s);
  if (dupSymbols.length > 0) errors.push(`Duplicate holding(s) in payload for: ${dupSymbols.join(', ')}.`);

  const txnIdCounts = new Map<string, number>();
  for (const t of payload.transactions) txnIdCounts.set(t.externalId, (txnIdCounts.get(t.externalId) ?? 0) + 1);
  const dupTxnIds = [...txnIdCounts.entries()].filter(([, c]) => c > 1).map(([id]) => id);
  if (dupTxnIds.length > 0) errors.push(`Duplicate transaction externalId(s) in payload: ${dupTxnIds.join(', ')}.`);

  const orderIdCounts = new Map<string, number>();
  for (const o of payload.openOrders) orderIdCounts.set(o.externalId, (orderIdCounts.get(o.externalId) ?? 0) + 1);
  const dupOrderIds = [...orderIdCounts.entries()].filter(([, c]) => c > 1).map(([id]) => id);
  if (dupOrderIds.length > 0) errors.push(`Duplicate open-order externalId(s) in payload: ${dupOrderIds.join(', ')}.`);

  if (errors.length > 0) {
    const syncLogId = await writeSyncLog({
      accountId: null,
      source,
      schemaVersion: payload.schemaVersion,
      payloadAsOf: asOfDate,
      success: false,
      recordsAdded: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      errors,
      warnings,
    });
    return { success: false, accountId: null, schemaVersion: payload.schemaVersion, recordsAdded: 0, recordsUpdated: 0, recordsSkipped: 0, errors, warnings, syncLogId, reconciliationDetails: [] };
  }

  // --- 4. Evaluation-config checks (warnings, not rejections) ---
  if (payload.buyingPower > payload.cashBalance * (1 + MARGIN_TOLERANCE_PCT)) {
    warnings.push(
      `Buying power ($${payload.buyingPower.toFixed(2)}) exceeds cash ($${payload.cashBalance.toFixed(2)}) by more than ${(MARGIN_TOLERANCE_PCT * 100).toFixed(0)}% — this account may have margin enabled, which the evaluation configuration disallows.`
    );
  }
  const capitalCommitted = payload.cashBalance + payload.holdings.reduce((s, h) => s + h.quantity * h.avgCostBasis, 0);
  if (payload.isEvaluationAccount && capitalCommitted > EVALUATION_MAX_CAPITAL * EVALUATION_CAPITAL_WARNING_MULTIPLE) {
    warnings.push(
      `Cash + cost basis of holdings ($${capitalCommitted.toFixed(2)}) exceeds ${EVALUATION_CAPITAL_WARNING_MULTIPLE}x the configured $${EVALUATION_MAX_CAPITAL} evaluation cap — confirm this is still the intended experimental account.`
    );
  }

  // --- 5. Snapshot "before" state for reconciliation ---
  const existingAccount = await prisma.account.findUnique({
    where: { externalId: payload.accountExternalId },
    include: { holdings: true },
  });
  const previousHoldingsBySymbol = new Map((existingAccount?.holdings ?? []).map((h) => [h.symbol, h]));
  const previousCashBalance = existingAccount ? Number(existingAccount.cashBalance) : 0;
  const previousSyncedAt = existingAccount?.lastSyncedAt ?? existingAccount?.createdAt ?? new Date(0);

  let recordsAdded = 0;
  let recordsUpdated = 0;
  let recordsSkipped = 0;
  // Collected separately from `warnings` so a retried attempt (write
  // conflict/deadlock) can be reset cleanly without double-appending
  // warnings from an earlier, discarded attempt.
  const closedPositionWarnings: string[] = [];

  try {
    const runTransaction = () => {
      recordsAdded = 0;
      recordsUpdated = 0;
      recordsSkipped = 0;
      closedPositionWarnings.length = 0;
      return prisma.$transaction(async (tx) => {
      const account = await tx.account.upsert({
        where: { externalId: payload.accountExternalId },
        update: {
          cashBalance: payload.cashBalance,
          buyingPower: payload.buyingPower,
          lastSyncedAt: new Date(),
          isEvaluationAccount: payload.isEvaluationAccount,
        },
        create: {
          provider: 'robinhood',
          externalId: payload.accountExternalId,
          cashBalance: payload.cashBalance,
          buyingPower: payload.buyingPower,
          lastSyncedAt: new Date(),
          isEvaluationAccount: payload.isEvaluationAccount,
        },
      });
      existingAccount ? recordsUpdated++ : recordsAdded++;

      const payloadSymbols = new Set(payload.holdings.map((h) => h.symbol));

      for (const h of payload.holdings) {
        const existed = previousHoldingsBySymbol.has(h.symbol);
        await tx.holding.upsert({
          where: { accountId_symbol: { accountId: account.id, symbol: h.symbol } },
          update: {
            name: h.name,
            assetClass: h.assetClass,
            sector: h.sector ?? null,
            quantity: h.quantity,
            avgCostBasis: h.avgCostBasis,
            realizedPnl: h.realizedPnl ?? 0,
          },
          create: {
            accountId: account.id,
            symbol: h.symbol,
            name: h.name,
            assetClass: h.assetClass,
            sector: h.sector ?? null,
            quantity: h.quantity,
            avgCostBasis: h.avgCostBasis,
            realizedPnl: h.realizedPnl ?? 0,
          },
        });
        existed ? recordsUpdated++ : recordsAdded++;
      }

      // Positions previously known but absent from this payload are
      // treated as fully closed — zeroed out, never deleted (preserves
      // thesis/recommendation history for the symbol).
      for (const [symbol, prev] of previousHoldingsBySymbol) {
        if (!payloadSymbols.has(symbol) && Number(prev.quantity) !== 0) {
          await tx.holding.update({ where: { id: prev.id }, data: { quantity: 0 } });
          recordsUpdated++;
          closedPositionWarnings.push(`${symbol} was not in this payload and had a nonzero quantity on record — treated as fully closed (quantity set to 0).`);
        }
      }

      for (const t of payload.transactions) {
        try {
          await tx.transaction.create({
            data: {
              accountId: account.id,
              symbol: t.symbol,
              side: t.side,
              quantity: t.quantity,
              price: t.price,
              source: 'MANUAL',
              externalId: t.externalId,
              executedAt: new Date(t.executedAt),
            },
          });
          recordsAdded++;
        } catch (err) {
          if (isUniqueConstraintError(err)) {
            recordsSkipped++; // already synced — this is the idempotency path, not an error
          } else {
            throw err;
          }
        }
      }

      for (const o of payload.openOrders) {
        const existingOrder = await tx.openOrder.findUnique({
          where: { accountId_externalId: { accountId: account.id, externalId: o.externalId } },
        });
        await tx.openOrder.upsert({
          where: { accountId_externalId: { accountId: account.id, externalId: o.externalId } },
          update: {
            symbol: o.symbol,
            side: o.side,
            quantity: o.quantity,
            orderType: o.orderType,
            limitPrice: o.limitPrice ?? null,
            stopPrice: o.stopPrice ?? null,
            status: o.status,
            submittedAt: new Date(o.submittedAt),
          },
          create: {
            accountId: account.id,
            externalId: o.externalId,
            symbol: o.symbol,
            side: o.side,
            quantity: o.quantity,
            orderType: o.orderType,
            limitPrice: o.limitPrice ?? null,
            stopPrice: o.stopPrice ?? null,
            status: o.status,
            submittedAt: new Date(o.submittedAt),
          },
        });
        existingOrder ? recordsUpdated++ : recordsAdded++;
      }

      return account.id;
      });
    };

    const accountId = await withRetry(runTransaction, { attempts: 3, baseDelayMs: 200, isRetryable: isWriteConflictError });
    warnings.push(...closedPositionWarnings);

    // --- 6. Reconciliation (read-only, after commit — includes a live
    // quote fetch, which doesn't belong inside a DB transaction) ---
    const reconciliationDetails: ReconciliationDetail[] = [];
    await reconcile({ payload, accountId, previousHoldingsBySymbol, previousCashBalance, previousSyncedAt, warnings, details: reconciliationDetails });

    const syncLogId = await writeSyncLog({
      accountId,
      source,
      schemaVersion: payload.schemaVersion,
      payloadAsOf: asOfDate,
      success: true,
      recordsAdded,
      recordsUpdated,
      recordsSkipped,
      errors,
      warnings,
      reconciliationDetails,
    });

    return { success: true, accountId, schemaVersion: payload.schemaVersion, recordsAdded, recordsUpdated, recordsSkipped, errors, warnings, syncLogId, reconciliationDetails };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Sync transaction failed: ${message}`);
    const syncLogId = await writeSyncLog({
      accountId: existingAccount?.id ?? null,
      source,
      schemaVersion: payload.schemaVersion,
      payloadAsOf: asOfDate,
      success: false,
      recordsAdded: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      errors,
      warnings,
    });
    return { success: false, accountId: existingAccount?.id ?? null, schemaVersion: payload.schemaVersion, recordsAdded: 0, recordsUpdated: 0, recordsSkipped: 0, errors, warnings, syncLogId, reconciliationDetails: [] };
  }
}

interface ReconcileInput {
  payload: AccountSyncPayload;
  accountId: string;
  previousHoldingsBySymbol: Map<string, { quantity: Prisma.Decimal; avgCostBasis: Prisma.Decimal }>;
  previousCashBalance: number;
  previousSyncedAt: Date;
  warnings: string[];
  /** Structured twin of `warnings` — one entry per field compared, whether
   * it matched or not (scripts/validateFirstSync.ts needs the full picture,
   * not just the failures). Appended in place; never throws. */
  details: ReconciliationDetail[];
}

function classifyNumeric(atlasValue: number, robinhoodValue: number, tolerance: number, isPercentTolerance: boolean): 'MATCH' | 'TOLERANCE_MATCH' | 'MISMATCH' {
  const diff = Math.abs(atlasValue - robinhoodValue);
  const effectiveTolerance = isPercentTolerance ? Math.abs(robinhoodValue) * tolerance : tolerance;
  if (diff <= FLOAT_TOLERANCE) return 'MATCH';
  if (diff <= effectiveTolerance) return 'TOLERANCE_MATCH';
  return 'MISMATCH';
}

/** Every check here compares Robinhood's reported numbers (the payload)
 * against something Atlas can independently derive — its own live quote,
 * its own prior stored state, or its own accumulated transaction history —
 * never against itself. Appends to `warnings`/`details` in place; never
 * throws. `details` is the same comparisons in machine-readable form for
 * scripts/validateFirstSync.ts (Phase 3.7) — no computation here is
 * duplicated solely for that report; it's built alongside the warning text. */
async function reconcile(input: ReconcileInput): Promise<void> {
  const { payload, accountId, previousHoldingsBySymbol, previousCashBalance, previousSyncedAt, warnings, details } = input;

  // --- Cash vs. transactions since the last sync ---
  const newTxnsSinceLastSync = payload.transactions.filter((t) => new Date(t.executedAt).getTime() > previousSyncedAt.getTime());
  const expectedCashDelta = newTxnsSinceLastSync.reduce((sum, t) => sum + (t.side === 'SELL' ? t.quantity * t.price : -t.quantity * t.price), 0);
  const actualCashDelta = payload.cashBalance - previousCashBalance;
  const expectedCashBalance = previousCashBalance + expectedCashDelta;
  if (Math.abs(expectedCashDelta - actualCashDelta) > CASH_RECONCILIATION_TOLERANCE) {
    warnings.push(
      `Cash changed by $${actualCashDelta.toFixed(2)} since the last sync, but the reported transactions only account for $${expectedCashDelta.toFixed(2)} — a fee, dividend, transfer, or missing transaction may explain the gap.`
    );
  }
  const cashStatus = classifyNumeric(expectedCashBalance, payload.cashBalance, CASH_RECONCILIATION_TOLERANCE, false);
  details.push({
    field: 'cashBalance',
    atlasValue: Number(expectedCashBalance.toFixed(2)),
    robinhoodValue: payload.cashBalance,
    status: cashStatus,
    message: cashStatus === 'MISMATCH'
      ? `Atlas expects $${expectedCashBalance.toFixed(2)} (previous cash + this payload's new transactions) vs. $${payload.cashBalance.toFixed(2)} reported.`
      : `Cash balance reconciles against transaction history (${cashStatus}).`,
  });

  // Robinhood-reported only — Atlas has no independent source for buying
  // power (margin/leverage usage is checked separately in syncAccount()).
  details.push({
    field: 'buyingPower',
    atlasValue: null,
    robinhoodValue: payload.buyingPower,
    status: 'NOT_INDEPENDENTLY_VERIFIABLE',
    message: 'Atlas has no independent buying-power source; reported value is passed through as-is.',
  });

  // --- Per-symbol quantity vs. transactions, and cost-basis stability ---
  for (const h of payload.holdings) {
    const prev = previousHoldingsBySymbol.get(h.symbol);
    const prevQuantity = prev ? Number(prev.quantity) : 0;
    const symbolTxns = newTxnsSinceLastSync.filter((t) => t.symbol === h.symbol);
    const expectedQtyDelta = symbolTxns.reduce((sum, t) => sum + (t.side === 'BUY' ? t.quantity : -t.quantity), 0);
    const actualQtyDelta = h.quantity - prevQuantity;
    const expectedQuantity = prevQuantity + expectedQtyDelta;
    if (Math.abs(expectedQtyDelta - actualQtyDelta) > FLOAT_TOLERANCE) {
      warnings.push(
        `${h.symbol} quantity changed by ${actualQtyDelta} shares since the last sync, but the reported transactions only account for ${expectedQtyDelta} — history may be incomplete.`
      );
    }
    const qtyStatus = classifyNumeric(expectedQuantity, h.quantity, FLOAT_TOLERANCE, false);
    details.push({
      field: 'quantity',
      symbol: h.symbol,
      atlasValue: expectedQuantity,
      robinhoodValue: h.quantity,
      status: qtyStatus,
      message: qtyStatus === 'MISMATCH'
        ? `Atlas expects ${expectedQuantity} shares (previous + this payload's transactions) vs. ${h.quantity} reported.`
        : `Quantity reconciles against transaction history (${qtyStatus}).`,
    });

    if (prev && symbolTxns.length === 0 && Math.abs(Number(prev.avgCostBasis) - h.avgCostBasis) > FLOAT_TOLERANCE) {
      warnings.push(`${h.symbol} cost basis changed from ${Number(prev.avgCostBasis).toFixed(2)} to ${h.avgCostBasis.toFixed(2)} with no corresponding transaction in this payload.`);
    }
  }

  // --- Market value + unrealized P&L vs. Atlas's own live quote ---
  let atlasTotalMarketValue = 0;
  let robinhoodTotalMarketValue = 0;
  for (const h of payload.holdings) {
    if (h.quantity === 0) continue;
    if (h.marketValue === undefined) {
      details.push({ field: 'marketValue', symbol: h.symbol, atlasValue: null, robinhoodValue: null, status: 'MISSING_FIELD', message: 'Robinhood did not report a market value for this holding.' });
      continue;
    }
    robinhoodTotalMarketValue += h.marketValue;
    try {
      const quote = await marketDataProvider.getQuote(h.symbol);
      const atlasMarketValue = quote.price * h.quantity;
      atlasTotalMarketValue += atlasMarketValue;
      const pctDiff = Math.abs(atlasMarketValue - h.marketValue) / h.marketValue;
      if (pctDiff > MARKET_VALUE_RECONCILIATION_TOLERANCE_PCT) {
        warnings.push(
          `${h.symbol} market value from Robinhood ($${h.marketValue.toFixed(2)}) differs from Atlas's own quote-derived value ($${atlasMarketValue.toFixed(2)}, ${quote.quality}) by ${(pctDiff * 100).toFixed(1)}%.`
        );
      }
      const mvStatus = classifyNumeric(atlasMarketValue, h.marketValue, MARKET_VALUE_RECONCILIATION_TOLERANCE_PCT, true);
      details.push({
        field: 'marketValue',
        symbol: h.symbol,
        atlasValue: Number(atlasMarketValue.toFixed(2)),
        robinhoodValue: h.marketValue,
        status: mvStatus,
        message: `Atlas quote-derived value vs. Robinhood-reported value (${quote.quality} quote, ${mvStatus}).`,
      });

      if (h.unrealizedPnl === undefined) {
        details.push({ field: 'unrealizedPnl', symbol: h.symbol, atlasValue: null, robinhoodValue: null, status: 'MISSING_FIELD', message: 'Robinhood did not report unrealized P&L for this holding.' });
      } else {
        const atlasUnrealizedPnl = atlasMarketValue - h.quantity * h.avgCostBasis;
        const pnlStatus = classifyNumeric(atlasUnrealizedPnl, h.unrealizedPnl, CASH_RECONCILIATION_TOLERANCE, false);
        details.push({
          field: 'unrealizedPnl',
          symbol: h.symbol,
          atlasValue: Number(atlasUnrealizedPnl.toFixed(2)),
          robinhoodValue: h.unrealizedPnl,
          status: pnlStatus,
          message: `Atlas-derived (quote value minus reported cost basis) vs. Robinhood-reported unrealized P&L (${pnlStatus}).`,
        });
      }
    } catch {
      // A quote-provider failure here shouldn't block reconciliation of
      // everything else — market-data fallback already handles its own
      // errors; if it still throws, just skip this one check.
      robinhoodTotalMarketValue -= h.marketValue; // exclude from the total-equity comparison below — Atlas has no value to add against it
      details.push({ field: 'marketValue', symbol: h.symbol, atlasValue: null, robinhoodValue: h.marketValue, status: 'MISSING_FIELD', message: 'Atlas could not fetch a live quote to compare against.' });
    }

    // Realized P&L is passed through from Robinhood; Atlas has no
    // independent ledger for it (would require full lot-level fill history).
    if (h.realizedPnl === undefined) {
      details.push({ field: 'realizedPnl', symbol: h.symbol, atlasValue: null, robinhoodValue: null, status: 'MISSING_FIELD', message: 'Robinhood did not report realized P&L for this holding.' });
    } else {
      details.push({ field: 'realizedPnl', symbol: h.symbol, atlasValue: null, robinhoodValue: h.realizedPnl, status: 'NOT_INDEPENDENTLY_VERIFIABLE', message: 'Atlas has no independent realized-P&L ledger; reported value is passed through as-is.' });
    }
  }
  const totalEquityStatus = classifyNumeric(payload.cashBalance + atlasTotalMarketValue, payload.cashBalance + robinhoodTotalMarketValue, MARKET_VALUE_RECONCILIATION_TOLERANCE_PCT, true);
  details.push({
    field: 'totalEquity',
    atlasValue: Number((payload.cashBalance + atlasTotalMarketValue).toFixed(2)),
    robinhoodValue: Number((payload.cashBalance + robinhoodTotalMarketValue).toFixed(2)),
    status: totalEquityStatus,
    message: `Cash + sum of per-holding market values (Atlas quote-derived vs. Robinhood-reported), excluding any holding Atlas couldn't quote (${totalEquityStatus}).`,
  });

  // --- Full transaction-history consistency (all stored transactions, not just this payload's) ---
  const allTxns = await prisma.transaction.findMany({ where: { accountId }, select: { symbol: true, side: true, quantity: true, price: true, executedAt: true } });
  const reconstructedBySymbol = new Map<string, number>();
  for (const t of allTxns) {
    const delta = t.side === 'BUY' ? Number(t.quantity) : -Number(t.quantity);
    reconstructedBySymbol.set(t.symbol, (reconstructedBySymbol.get(t.symbol) ?? 0) + delta);
  }
  for (const h of payload.holdings) {
    const reconstructed = reconstructedBySymbol.get(h.symbol) ?? 0;
    if (Math.abs(reconstructed - h.quantity) > FLOAT_TOLERANCE) {
      warnings.push(
        `${h.symbol}: reconstructing quantity from all stored transactions gives ${reconstructed}, but the reported quantity is ${h.quantity} — likely a pre-Atlas purchase or transfer that was never synced as a transaction.`
      );
    }
  }

  // --- Average cost basis: reconstruct a weighted-average from Atlas's own
  // stored fill history (BUYs add cost proportionally, SELLs reduce it
  // proportionally), and compare against Robinhood's reported figure. ---
  const txnsBySymbol = new Map<string, typeof allTxns>();
  for (const t of allTxns) {
    const list = txnsBySymbol.get(t.symbol) ?? [];
    list.push(t);
    txnsBySymbol.set(t.symbol, list);
  }
  for (const h of payload.holdings) {
    if (h.quantity === 0) continue;
    const symbolTxns = (txnsBySymbol.get(h.symbol) ?? []).slice().sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime());
    if (symbolTxns.length === 0) {
      details.push({ field: 'avgCostBasis', symbol: h.symbol, atlasValue: null, robinhoodValue: h.avgCostBasis, status: 'NOT_INDEPENDENTLY_VERIFIABLE', message: 'No stored fill history for this symbol (pre-Atlas position) — cannot reconstruct independently.' });
      continue;
    }
    let runningQty = 0;
    let runningCost = 0;
    for (const t of symbolTxns) {
      const qty = Number(t.quantity);
      const price = Number(t.price);
      if (t.side === 'BUY') {
        runningCost += qty * price;
        runningQty += qty;
      } else {
        if (runningQty > 0) runningCost -= (runningCost / runningQty) * qty;
        runningQty -= qty;
      }
    }
    if (runningQty <= FLOAT_TOLERANCE) {
      details.push({ field: 'avgCostBasis', symbol: h.symbol, atlasValue: null, robinhoodValue: h.avgCostBasis, status: 'NOT_INDEPENDENTLY_VERIFIABLE', message: 'Reconstructed quantity from fill history is zero or negative — likely a pre-Atlas position with partial history.' });
      continue;
    }
    const reconstructedAvgCost = runningCost / runningQty;
    const costStatus = classifyNumeric(reconstructedAvgCost, h.avgCostBasis, MARKET_VALUE_RECONCILIATION_TOLERANCE_PCT, true);
    details.push({
      field: 'avgCostBasis',
      symbol: h.symbol,
      atlasValue: Number(reconstructedAvgCost.toFixed(4)),
      robinhoodValue: h.avgCostBasis,
      status: costStatus,
      message: `Reconstructed from Atlas's own stored fill history vs. Robinhood-reported average cost basis (${costStatus}).`,
    });
  }

  // --- Transactions and open orders: every payload row should now exist as
  // a stored record (either newly created this sync, or already-idempotent
  // from a prior one) — mismatch here would mean a create silently failed. ---
  if (payload.transactions.length > 0) {
    const storedCount = await prisma.transaction.count({ where: { accountId, externalId: { in: payload.transactions.map((t) => t.externalId) } } });
    details.push({
      field: 'transactions',
      atlasValue: storedCount,
      robinhoodValue: payload.transactions.length,
      status: storedCount === payload.transactions.length ? 'MATCH' : 'MISMATCH',
      message: `${storedCount} of ${payload.transactions.length} reported transactions are stored in Atlas.`,
    });
  }
  if (payload.openOrders.length > 0) {
    const storedOrderCount = await prisma.openOrder.count({ where: { accountId, externalId: { in: payload.openOrders.map((o) => o.externalId) } } });
    details.push({
      field: 'openOrders',
      atlasValue: storedOrderCount,
      robinhoodValue: payload.openOrders.length,
      status: storedOrderCount === payload.openOrders.length ? 'MATCH' : 'MISMATCH',
      message: `${storedOrderCount} of ${payload.openOrders.length} reported open orders are stored in Atlas (read-only mirror — Atlas never places, modifies, or cancels orders).`,
    });
  } else {
    details.push({ field: 'openOrders', atlasValue: 0, robinhoodValue: 0, status: 'MATCH', message: 'No open orders reported.' });
  }
}

export { ACCOUNT_SYNC_SCHEMA_VERSION };
