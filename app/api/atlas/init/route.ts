import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getInitializationSummary } from '@/lib/domain/initializationStatus';

export const dynamic = 'force-dynamic';

/**
 * Feeds the once-per-session initialization sequence
 * (components/init/InitializationGate.tsx). Deliberately NOT fetched by
 * the authenticated layout on every navigation — that would mean five
 * extra DB queries (getGlobalStatus + two counts) on every single page
 * load just to support an animation that only ever plays once per
 * browser session. Instead the client fetches this route lazily, only
 * when it has already determined (via sessionStorage) that the sequence
 * needs to play at all.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const summary = await getInitializationSummary();
  return NextResponse.json(summary);
}
