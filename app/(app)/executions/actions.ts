'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getActiveAccountId } from '@/lib/domain/portfolio';

export interface RecordManualExecutionInput {
  symbol: string;
  side: 'BUY' | 'SELL';
  executedAt: string; // datetime-local input value
  quantity: number;
  dollarAmount: number;
  executionPrice: number;
  fees: number;
  note: string;
  recommendationId: string | null;
}

/**
 * Records a trade the user says they ALREADY executed themselves in
 * Robinhood. This never submits, previews, or otherwise causes a trade: it
 * only writes a ManualExecution row for the next sync's reconciliation
 * step (lib/domain/executionReconciliation.ts) to check against the real
 * Robinhood transaction once it's ingested. See
 * lib/domain/executionBoundary.test.ts, which scans for exactly this kind
 * of unintended capability.
 */
export async function recordManualExecution(input: RecordManualExecutionInput): Promise<{ ok: boolean; error?: string }> {
  const accountId = await getActiveAccountId();
  if (!accountId) return { ok: false, error: 'No account on record to attach this execution to.' };

  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) return { ok: false, error: 'Symbol is required.' };
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return { ok: false, error: 'Quantity must be a positive number.' };
  if (!Number.isFinite(input.dollarAmount) || input.dollarAmount <= 0) return { ok: false, error: 'Dollar amount must be a positive number.' };
  if (!Number.isFinite(input.executionPrice) || input.executionPrice <= 0) return { ok: false, error: 'Execution price must be a positive number.' };
  const executedAt = new Date(input.executedAt);
  if (Number.isNaN(executedAt.getTime())) return { ok: false, error: 'Execution time is invalid.' };

  await prisma.manualExecution.create({
    data: {
      accountId,
      symbol,
      side: input.side,
      executedAt,
      quantity: input.quantity,
      dollarAmount: input.dollarAmount,
      executionPrice: input.executionPrice,
      fees: Number.isFinite(input.fees) ? input.fees : 0,
      note: input.note.trim() || null,
      recommendationId: input.recommendationId || null,
    },
  });

  revalidatePath('/executions');
  return { ok: true };
}

/** Plain-form adapter — the rest of the app's mutations (e.g.
 * setRecommendationDecision) use plain `<form action={...}>` with no
 * client JS, and this follows the same convention rather than introducing
 * a client component just for this page. */
export async function recordManualExecutionFromForm(formData: FormData): Promise<void> {
  await recordManualExecution({
    symbol: String(formData.get('symbol') ?? ''),
    side: (String(formData.get('side') ?? 'BUY') as 'BUY' | 'SELL'),
    executedAt: String(formData.get('executedAt') ?? ''),
    quantity: Number(formData.get('quantity')),
    dollarAmount: Number(formData.get('dollarAmount')),
    executionPrice: Number(formData.get('executionPrice')),
    fees: Number(formData.get('fees') ?? 0),
    note: String(formData.get('note') ?? ''),
    recommendationId: String(formData.get('recommendationId') ?? '') || null,
  });
}
