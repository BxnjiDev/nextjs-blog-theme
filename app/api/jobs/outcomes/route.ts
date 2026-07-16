import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuthorized } from '@/lib/jobs/auth';
import { runRecommendationOutcomesJob } from '@/lib/jobs/trackRecommendationOutcomes';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const unauthorized = assertCronAuthorized(req);
  if (unauthorized) return unauthorized;

  try {
    const result = await runRecommendationOutcomesJob();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error('Recommendation outcomes job failed:', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
