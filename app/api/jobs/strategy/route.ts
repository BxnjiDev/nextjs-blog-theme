import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuthorized } from '@/lib/jobs/auth';
import { runStrategyMonitoringJob } from '@/lib/jobs/monitorStrategy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const unauthorized = assertCronAuthorized(req);
  if (unauthorized) return unauthorized;

  try {
    const result = await runStrategyMonitoringJob();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error('Strategy monitoring job failed:', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
