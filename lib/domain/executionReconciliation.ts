import { prisma } from '@/lib/prisma';
import type { ExecutionMatchStatus } from '@prisma/client';
import {
  EXECUTION_MATCH_PRICE_TOLERANCE_PCT,
  EXECUTION_MATCH_QUANTITY_TOLERANCE_PCT,
  EXECUTION_MATCH_AMOUNT_TOLERANCE_PCT,
  EXECUTION_MATCH_TIMING_TOLERANCE_HOURS,
  EXECUTION_MATCH_SEARCH_WINDOW_DAYS,
  EXECUTION_MATCH_MIN_PARTIAL_FRACTION,
} from './evaluationConfig';
import { getActiveAccountId } from './portfolio';

export interface ManualExecutionForMatching {
  symbol: string;
  side: 'BUY' | 'SELL';
  executedAt: Date;
  quantity: number;
  dollarAmount: number;
  executionPrice: number;
}

export interface CandidateTransaction {
  id: string;
  quantity: number;
  price: number;
  executedAt: Date;
}

export interface MatchResult {
  matchStatus: ExecutionMatchStatus;
  matchedTransactionId: string | null;
  reconciliationNote: string;
}

/**
 * Pure matching logic, split out from reconcileManualExecutions() so it's
 * unit-testable without any I/O. Never triggers, causes, or requires a
 * trade — this only classifies how well a trade the user says they
 * already made (ManualExecution) lines up with a real Transaction the
 * Robinhood sync already ingested.
 *
 * Picks the single candidate transaction whose (quantity × price) is
 * closest to the manually-reported dollar amount, rather than aggregating
 * multiple transactions — safer than summing, which could silently absorb
 * an unrelated same-symbol trade that happened to fall in the search
 * window.
 */
export function matchExecution(manual: ManualExecutionForMatching, candidates: CandidateTransaction[]): MatchResult {
  if (candidates.length === 0) {
    return {
      matchStatus: 'UNMATCHED',
      matchedTransactionId: null,
      reconciliationNote: `No transaction for ${manual.symbol} (${manual.side}) found within ${EXECUTION_MATCH_SEARCH_WINDOW_DAYS} days of the recorded execution — this trade has not yet appeared in a Robinhood sync.`,
    };
  }

  const best = [...candidates].sort(
    (a, b) => Math.abs(a.quantity * a.price - manual.dollarAmount) - Math.abs(b.quantity * b.price - manual.dollarAmount)
  )[0];

  const bestAmount = best.quantity * best.price;
  const quantityDiffPct = manual.quantity > 0 ? Math.abs(best.quantity - manual.quantity) / manual.quantity : 0;
  const priceDiffPct = manual.executionPrice > 0 ? Math.abs(best.price - manual.executionPrice) / manual.executionPrice : 0;
  const amountDiffPct = manual.dollarAmount > 0 ? Math.abs(bestAmount - manual.dollarAmount) / manual.dollarAmount : 0;
  const timingDiffHours = Math.abs(best.executedAt.getTime() - manual.executedAt.getTime()) / (1000 * 60 * 60);

  const quantityOk = quantityDiffPct <= EXECUTION_MATCH_QUANTITY_TOLERANCE_PCT;
  const priceOk = priceDiffPct <= EXECUTION_MATCH_PRICE_TOLERANCE_PCT;
  const amountOk = amountDiffPct <= EXECUTION_MATCH_AMOUNT_TOLERANCE_PCT;
  const timingOk = timingDiffHours <= EXECUTION_MATCH_TIMING_TOLERANCE_HOURS;

  const summary = `Closest match: ${best.quantity} sh @ $${best.price.toFixed(2)} (~$${bestAmount.toFixed(2)}) on ${best.executedAt.toISOString()}, vs. recorded ${manual.quantity} sh @ $${manual.executionPrice.toFixed(2)} (~$${manual.dollarAmount.toFixed(2)}) on ${manual.executedAt.toISOString()}.`;

  if (quantityOk && priceOk && amountOk && timingOk) {
    return { matchStatus: 'MATCHED', matchedTransactionId: best.id, reconciliationNote: `Matched within tolerance. ${summary}` };
  }

  // A found quantity meaningfully below what was reported, but not so far
  // below it looks unrelated, reads as a genuine partial fill rather than
  // a data-entry discrepancy.
  const partialFraction = manual.quantity > 0 ? best.quantity / manual.quantity : 1;
  if (best.quantity < manual.quantity && partialFraction >= EXECUTION_MATCH_MIN_PARTIAL_FRACTION && priceOk && timingOk) {
    return {
      matchStatus: 'PARTIALLY_MATCHED',
      matchedTransactionId: best.id,
      reconciliationNote: `Only ${(partialFraction * 100).toFixed(0)}% of the recorded quantity was found in this transaction — looks like a partial fill. ${summary}`,
    };
  }

  // Order matters: quantity/price are checked before the combined amount,
  // since amount = quantity × price — a pure quantity or price discrepancy
  // will almost always also fail the amount check, and the more specific
  // diagnosis (which single input is actually wrong) is more useful than
  // the downstream consequence. AMOUNT_MISMATCH is reserved for when
  // quantity and price individually look fine but the total still doesn't
  // (e.g. a fee rolled into the reported amount, or a rounding artifact).
  if (!timingOk) {
    return { matchStatus: 'TIMING_MISMATCH', matchedTransactionId: best.id, reconciliationNote: `Execution times differ by ${timingDiffHours.toFixed(1)}h, beyond the ${EXECUTION_MATCH_TIMING_TOLERANCE_HOURS}h tolerance. ${summary}` };
  }
  if (!quantityOk) {
    return { matchStatus: 'QUANTITY_MISMATCH', matchedTransactionId: best.id, reconciliationNote: `Quantities differ by ${(quantityDiffPct * 100).toFixed(1)}%, beyond the ${(EXECUTION_MATCH_QUANTITY_TOLERANCE_PCT * 100).toFixed(0)}% tolerance. ${summary}` };
  }
  if (!priceOk) {
    return { matchStatus: 'PRICE_MISMATCH', matchedTransactionId: best.id, reconciliationNote: `Prices differ by ${(priceDiffPct * 100).toFixed(1)}%, beyond the ${(EXECUTION_MATCH_PRICE_TOLERANCE_PCT * 100).toFixed(0)}% tolerance. ${summary}` };
  }
  return { matchStatus: 'AMOUNT_MISMATCH', matchedTransactionId: best.id, reconciliationNote: `Dollar amounts differ by ${(amountDiffPct * 100).toFixed(1)}%, beyond the ${(EXECUTION_MATCH_AMOUNT_TOLERANCE_PCT * 100).toFixed(0)}% tolerance despite quantity/price individually looking consistent. ${summary}` };
}

export interface ReconciliationResult {
  checked: number;
  matched: number;
  partiallyMatched: number;
  unmatched: number;
  mismatched: number;
}

/**
 * Reconciles every still-PENDING ManualExecution against Transaction rows
 * the account has on record — called from the post-sync pipeline
 * (accountSyncPipeline.ts) right after a sync ingests new transactions, so
 * a manual record gets checked against the freshest data available. Purely
 * a read of Transaction + a write to ManualExecution; never creates,
 * modifies, or cancels anything Robinhood-side. Resolves the active
 * account itself (same as detectRecommendationDecisions) so every
 * post-sync pipeline step shares one calling convention.
 */
export async function reconcileManualExecutions(explicitAccountId?: string): Promise<ReconciliationResult> {
  const result: ReconciliationResult = { checked: 0, matched: 0, partiallyMatched: 0, unmatched: 0, mismatched: 0 };

  const accountId = explicitAccountId ?? (await getActiveAccountId());
  if (!accountId) return result;

  const pending = await prisma.manualExecution.findMany({ where: { accountId, matchStatus: 'PENDING' } });
  if (pending.length === 0) return result;

  for (const execution of pending) {
    result.checked++;
    const searchStart = new Date(execution.executedAt.getTime() - EXECUTION_MATCH_SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const searchEnd = new Date(execution.executedAt.getTime() + EXECUTION_MATCH_SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const candidates = await prisma.transaction.findMany({
      where: {
        accountId,
        symbol: execution.symbol,
        side: execution.side,
        executedAt: { gte: searchStart, lte: searchEnd },
        manualExecution: null, // never match the same Transaction to two different manual records
      },
      select: { id: true, quantity: true, price: true, executedAt: true },
    });

    const match = matchExecution(
      {
        symbol: execution.symbol,
        side: execution.side,
        executedAt: execution.executedAt,
        quantity: Number(execution.quantity),
        dollarAmount: Number(execution.dollarAmount),
        executionPrice: Number(execution.executionPrice),
      },
      candidates.map((c) => ({ id: c.id, quantity: Number(c.quantity), price: Number(c.price), executedAt: c.executedAt }))
    );

    await prisma.manualExecution.update({
      where: { id: execution.id },
      data: {
        matchStatus: match.matchStatus,
        matchedTransactionId: match.matchedTransactionId,
        reconciledAt: new Date(),
        reconciliationNote: match.reconciliationNote,
      },
    });

    if (match.matchStatus === 'MATCHED') result.matched++;
    else if (match.matchStatus === 'PARTIALLY_MATCHED') result.partiallyMatched++;
    else if (match.matchStatus === 'UNMATCHED') result.unmatched++;
    else result.mismatched++;
  }

  return result;
}
