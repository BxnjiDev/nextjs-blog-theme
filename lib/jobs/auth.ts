import { NextRequest, NextResponse } from 'next/server';

/**
 * Guards the /api/jobs/* routes. Vercel Cron sends `Authorization: Bearer
 * $CRON_SECRET` automatically when CRON_SECRET is set as a project env var,
 * so this doubles as the trigger's auth without any extra wiring. If the
 * secret isn't configured, the route refuses to run rather than being
 * silently triggerable by anyone who finds the URL.
 */
export function assertCronAuthorized(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured on the server.' }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
