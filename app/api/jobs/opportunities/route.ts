import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuthorized } from '@/lib/jobs/auth';
import { runOpportunityComparisonJob } from '@/lib/jobs/generateOpportunityComparisons';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const unauthorized = assertCronAuthorized(req);
  if (unauthorized) return unauthorized;

  try {
    const result = await runOpportunityComparisonJob();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error('Opportunity comparison job failed:', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
