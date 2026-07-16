import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuthorized } from '@/lib/jobs/auth';
import { runNewsMonitorJob } from '@/lib/jobs/monitorNews';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const unauthorized = assertCronAuthorized(req);
  if (unauthorized) return unauthorized;

  try {
    const result = await runNewsMonitorJob();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error('News monitor job failed:', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
