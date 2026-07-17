import { NextRequest, NextResponse } from 'next/server';
import { assertSyncAuthorized } from '@/lib/jobs/auth';
import { syncAccount } from '@/lib/domain/accountSync';
import { runPostSyncPipeline } from '@/lib/domain/accountSyncPipeline';

export const dynamic = 'force-dynamic';

/**
 * Accepts one account-state snapshot (see lib/domain/accountSyncSchema.ts)
 * that an agent session with the Robinhood Agentic Trading MCP connector
 * active has read directly from Robinhood. This route never talks to
 * Robinhood itself and this app never stores brokerage credentials, MCP
 * tokens, or session secrets — see ARCHITECTURE.md. On a successful sync,
 * triggers the same six jobs the evaluation workflow depends on
 * (lib/domain/accountSyncPipeline.ts).
 */
export async function POST(req: NextRequest) {
  const unauthorized = assertSyncAuthorized(req);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, errors: ['Request body is not valid JSON.'] }, { status: 400 });
  }

  const result = await syncAccount(body, 'api');
  if (!result.success) {
    return NextResponse.json({ ok: false, sync: result }, { status: 422 });
  }

  const pipeline = await runPostSyncPipeline();
  return NextResponse.json({ ok: true, sync: result, pipeline });
}
