'use server';

import { revalidatePath } from 'next/cache';
import { runJob, JOB_REGISTRY } from '@/lib/domain/scheduler';

/**
 * Manually reruns one scheduler job from the ops dashboard. Safe by
 * construction, not just by convention: every function in JOB_REGISTRY
 * (lib/domain/scheduler.ts) is one of the existing read/analyze/record job
 * functions already used by /api/jobs/* and the post-sync pipeline — none
 * of them has, or could have, a code path that calls Robinhood or submits
 * an order (see lib/domain/executionBoundary.test.ts, which scans the
 * whole source tree for exactly that). There is no separate "unsafe" job
 * this could accidentally expose; rerunning any registered job is
 * inherently read-only/analysis-only.
 */
export async function rerunJob(jobName: string): Promise<void> {
  if (!JOB_REGISTRY[jobName]) throw new Error(`Unknown job "${jobName}".`);
  await runJob(jobName, 'manual');
  revalidatePath('/connections');
}
