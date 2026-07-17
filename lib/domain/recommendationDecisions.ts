import { prisma } from '@/lib/prisma';
import { getActiveAccountId } from './portfolio';

export interface DecisionDetectionResult {
  accepted: number;
  partiallyAccepted: number;
  checked: number;
}

const MATCH_WINDOW_DAYS = 30;
const ACCEPTED_THRESHOLD_PCT = 0.9; // executed dollar amount >= 90% of proposed => ACCEPTED

const BUY_ACTIONS = new Set(['BUY_MORE']);
const SELL_ACTIONS = new Set(['REDUCE', 'SELL']);

/**
 * Auto-detects ACCEPTED/PARTIALLY_ACCEPTED by matching newly-synced
 * transactions against still-PENDING recommendations for the same symbol
 * and compatible direction (BUY_MORE -> BUY transactions, REDUCE/SELL ->
 * SELL transactions), executed after the recommendation and within a
 * 30-day window. Compares realized dollar amount against
 * proposedDollarAmount rather than share count, since a recommendation
 * doesn't pin an exact share price. REJECTED/DEFERRED are never set here —
 * there is no way to infer "the user decided not to" from the absence of a
 * transaction, only an explicit user action can mean that (see the
 * setRecommendationDecision server action on /recommendations).
 *
 * Called from the post-sync pipeline (lib/domain/accountSyncPipeline.ts),
 * reusing the transactions that sync already ingested — no separate fetch
 * or duplicate matching logic.
 */
export async function detectRecommendationDecisions(): Promise<DecisionDetectionResult> {
  const result: DecisionDetectionResult = { accepted: 0, partiallyAccepted: 0, checked: 0 };

  const accountId = await getActiveAccountId();
  if (!accountId) return result;

  const pending = await prisma.recommendation.findMany({
    where: {
      userDecision: 'PENDING',
      proposedDollarAmount: { not: null },
      holding: { accountId },
      generatedAt: { gte: new Date(Date.now() - MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000) },
    },
    orderBy: { generatedAt: 'asc' },
  });

  for (const rec of pending) {
    if (!BUY_ACTIONS.has(rec.action) && !SELL_ACTIONS.has(rec.action)) continue;
    result.checked++;

    const side = BUY_ACTIONS.has(rec.action) ? 'BUY' : 'SELL';
    const windowEnd = new Date(rec.generatedAt.getTime() + MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const matchingTxns = await prisma.transaction.findMany({
      where: {
        accountId,
        symbol: rec.symbol,
        side,
        executedAt: { gte: rec.generatedAt, lte: windowEnd },
      },
    });
    if (matchingTxns.length === 0) continue;

    const executedDollarAmount = matchingTxns.reduce((sum, t) => sum + Number(t.quantity) * Number(t.price), 0);
    const proposedDollarAmount = Number(rec.proposedDollarAmount);
    if (proposedDollarAmount <= 0) continue;

    const fraction = executedDollarAmount / proposedDollarAmount;
    const decision = fraction >= ACCEPTED_THRESHOLD_PCT ? 'ACCEPTED' : 'PARTIALLY_ACCEPTED';
    const latestTxnAt = matchingTxns.reduce((latest, t) => (t.executedAt > latest ? t.executedAt : latest), matchingTxns[0].executedAt);

    await prisma.recommendation.update({
      where: { id: rec.id },
      data: {
        userDecision: decision,
        userDecisionAt: latestTxnAt,
        userDecisionNote: `Auto-detected from ${matchingTxns.length} transaction(s) totaling $${executedDollarAmount.toFixed(0)} (${(fraction * 100).toFixed(0)}% of the $${proposedDollarAmount.toFixed(0)} proposed).`,
      },
    });

    if (decision === 'ACCEPTED') result.accepted++;
    else result.partiallyAccepted++;
  }

  return result;
}
