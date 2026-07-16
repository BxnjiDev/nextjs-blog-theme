import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuthorized } from '@/lib/jobs/auth';
import { runThesisJob } from '@/lib/jobs/generateThesis';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const unauthorized = assertCronAuthorized(req);
  if (unauthorized) return unauthorized;

  try {
    const force = req.nextUrl.searchParams.get('force') === 'true';
    const result = await runThesisJob({ force });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error('Thesis job failed:', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
