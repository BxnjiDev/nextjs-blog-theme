import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuthorized } from '@/lib/jobs/auth';
import { runLearningSuite } from '@/lib/domain/learningSuite';

export const dynamic = 'force-dynamic';

/**
 * Runs the continuous-learning suite in one route — grouped under a
 * single weekly cron entry (rather than one per sub-job) because they're
 * all low-frequency aggregations that only become meaningful once real
 * time has elapsed. See lib/domain/learningSuite.ts for the actual step
 * list (shared with lib/domain/scheduler.ts).
 */
export async function GET(req: NextRequest) {
  const unauthorized = assertCronAuthorized(req);
  if (unauthorized) return unauthorized;

  const { ok, results, errors } = await runLearningSuite();
  return NextResponse.json({ ok, results, errors });
}
