'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';

/**
 * Explicit user decision (REJECTED/DEFERRED) — the counterpart to the
 * automatic ACCEPTED/PARTIALLY_ACCEPTED detection in
 * lib/domain/recommendationDecisions.ts, which can only infer acceptance
 * from a matching transaction, never rejection from silence. A plain
 * Server Action rather than a new API route — this is a same-origin UI
 * mutation on a single-user local app, not something an external caller
 * needs to reach.
 */
export async function setRecommendationDecision(recommendationId: string, decision: 'REJECTED' | 'DEFERRED', note: string) {
  await prisma.recommendation.update({
    where: { id: recommendationId },
    data: {
      userDecision: decision,
      userDecisionAt: new Date(),
      userDecisionNote: note || null,
    },
  });
  revalidatePath('/recommendations');
  revalidatePath(`/recommendations/${recommendationId}`);
}
