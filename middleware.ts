import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

/**
 * Gates every page and Atlas OS API route behind a signed session cookie.
 * Runs on the Edge runtime, so the check here is signature+expiry only (no
 * DB round-trip) — see lib/auth/currentUser.ts for the fuller check used by
 * anything that needs the actual user record.
 *
 * Deliberately excluded from this gate: /api/jobs/* and /api/sync/*, which
 * predate Atlas OS and already enforce their own bearer-token auth
 * (CRON_SECRET/SYNC_SECRET — see lib/jobs/auth.ts) for external callers
 * (Vercel Cron, an agent session posting a sync payload) that don't have a
 * browser session and shouldn't need one.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === '/login' || pathname.startsWith('/api/jobs') || pathname.startsWith('/api/sync')) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match everything except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico
     * - any file with an extension (e.g. .svg, .png) — static assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
