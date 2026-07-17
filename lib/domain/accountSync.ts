import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { marketDataProvider } from '@/lib/integrations';
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
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
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
    return { success: false, accountId: null, schemaVersion: schemaVersionGuess, recordsAdded: 0, recordsUpdated: 0, recordsSkipped: 0, errors, warnings, syncLogId };
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
    return { success: false, accountId: null, schemaVersion: payload.schemaVersion, recordsAdded: 0, recordsUpdated: 0, recordsSkipped: 0, errors, warnings, syncLogId };
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

  try {
    const accountId = await prisma.$transaction(async (tx) => {
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
          warnings.push(`${symbol} was not in this payload and had a nonzero quantity on record — treated as fully closed (quantity set to 0).`);
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

    // --- 6. Reconciliation (read-only, after commit — includes a live
    // quote fetch, which doesn't belong inside a DB transaction) ---
    await reconcile({ payload, accountId, previousHoldingsBySymbol, previousCashBalance, previousSyncedAt, warnings });

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
    });

    return { success: true, accountId, schemaVersion: payload.schemaVersion, recordsAdded, recordsUpdated, recordsSkipped, errors, warnings, syncLogId };
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
    return { success: false, accountId: existingAccount?.id ?? null, schemaVersion: payload.schemaVersion, recordsAdded: 0, recordsUpdated: 0, recordsSkipped: 0, errors, warnings, syncLogId };
  }
}

interface ReconcileInput {
  payload: AccountSyncPayload;
  accountId: string;
  previousHoldingsBySymbol: Map<string, { quantity: Prisma.Decimal; avgCostBasis: Prisma.Decimal }>;
  previousCashBalance: number;
  previousSyncedAt: Date;
  warnings: string[];
}

/** Every check here compares Robinhood's reported numbers (the payload)
 * against something Atlas can independently derive — its own live quote,
 * its own prior stored state, or its own accumulated transaction history —
 * never against itself. Appends to `warnings` in place; never throws. */
async function reconcile(input: ReconcileInput): Promise<void> {
  const { payload, accountId, previousHoldingsBySymbol, previousCashBalance, previousSyncedAt, warnings } = input;

  // --- Cash vs. transactions since the last sync ---
  const newTxnsSinceLastSync = payload.transactions.filter((t) => new Date(t.executedAt).getTime() > previousSyncedAt.getTime());
  const expectedCashDelta = newTxnsSinceLastSync.reduce((sum, t) => sum + (t.side === 'SELL' ? t.quantity * t.price : -t.quantity * t.price), 0);
  const actualCashDelta = payload.cashBalance - previousCashBalance;
  if (Math.abs(expectedCashDelta - actualCashDelta) > CASH_RECONCILIATION_TOLERANCE) {
    warnings.push(
      `Cash changed by $${actualCashDelta.toFixed(2)} since the last sync, but the reported transactions only account for $${expectedCashDelta.toFixed(2)} — a fee, dividend, transfer, or missing transaction may explain the gap.`
    );
  }

  // --- Per-symbol quantity vs. transactions, and cost-basis stability ---
  for (const h of payload.holdings) {
    const prev = previousHoldingsBySymbol.get(h.symbol);
    const prevQuantity = prev ? Number(prev.quantity) : 0;
    const symbolTxns = newTxnsSinceLastSync.filter((t) => t.symbol === h.symbol);
    const expectedQtyDelta = symbolTxns.reduce((sum, t) => sum + (t.side === 'BUY' ? t.quantity : -t.quantity), 0);
    const actualQtyDelta = h.quantity - prevQuantity;
    if (Math.abs(expectedQtyDelta - actualQtyDelta) > FLOAT_TOLERANCE) {
      warnings.push(
        `${h.symbol} quantity changed by ${actualQtyDelta} shares since the last sync, but the reported transactions only account for ${expectedQtyDelta} — history may be incomplete.`
      );
    }

    if (prev && symbolTxns.length === 0 && Math.abs(Number(prev.avgCostBasis) - h.avgCostBasis) > FLOAT_TOLERANCE) {
      warnings.push(`${h.symbol} cost basis changed from ${Number(prev.avgCostBasis).toFixed(2)} to ${h.avgCostBasis.toFixed(2)} with no corresponding transaction in this payload.`);
    }
  }

  // --- Market value vs. Atlas's own live quote ---
  for (const h of payload.holdings) {
    if (h.marketValue === undefined || h.quantity === 0) continue;
    try {
      const quote = await marketDataProvider.getQuote(h.symbol);
      const atlasMarketValue = quote.price * h.quantity;
      const pctDiff = Math.abs(atlasMarketValue - h.marketValue) / h.marketValue;
      if (pctDiff > MARKET_VALUE_RECONCILIATION_TOLERANCE_PCT) {
        warnings.push(
          `${h.symbol} market value from Robinhood ($${h.marketValue.toFixed(2)}) differs from Atlas's own quote-derived value ($${atlasMarketValue.toFixed(2)}, ${quote.quality}) by ${(pctDiff * 100).toFixed(1)}%.`
        );
      }
    } catch {
      // A quote-provider failure here shouldn't block reconciliation of
      // everything else — market-data fallback already handles its own
      // errors; if it still throws, just skip this one check.
    }
  }

  // --- Full transaction-history consistency (all stored transactions, not just this payload's) ---
  const allTxns = await prisma.transaction.findMany({ where: { accountId }, select: { symbol: true, side: true, quantity: true } });
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
}

export { ACCOUNT_SYNC_SCHEMA_VERSION };
