'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { syncAccount } from '@/lib/domain/accountSync';
import { runPostSyncPipeline } from '@/lib/domain/accountSyncPipeline';

/**
 * Browser-facing entry point for the Phase 3.5 sync workflow
 * (lib/domain/accountSync.ts, scripts/syncAccount.ts, /api/sync/account) —
 * a fourth caller of the same syncAccount() function, not a new sync path.
 * Deliberately a Server Action rather than a form posting to
 * /api/sync/account: that route is gated by SYNC_SECRET for *external*
 * callers (an agent session, a deployed instance) that have no browser
 * session, and a browser form would have to expose that secret client-side
 * to set the Authorization header. This runs entirely server-side, behind
 * the same session-cookie auth (middleware.ts) that already protects every
 * /settings request — no secret ever reaches the browser.
 *
 * The payload text is expected to already conform to
 * lib/domain/accountSyncSchema.ts — produced by an agent session with the
 * Robinhood Agentic Trading MCP connector active, the same as the CLI/API
 * paths. This action never talks to Robinhood itself.
 */
export async function syncRobinhoodPayload(formData: FormData): Promise<void> {
  const raw = String(formData.get('payload') ?? '').trim();
  if (!raw) {
    redirect('/settings?syncError=' + encodeURIComponent('Paste a sync payload JSON before submitting.'));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    redirect('/settings?syncError=' + encodeURIComponent(`Not valid JSON: ${err instanceof Error ? err.message : String(err)}`));
  }

  const result = await syncAccount(parsed, 'settings-ui');
  if (!result.success) {
    redirect('/settings?syncError=' + encodeURIComponent(result.errors.join(' ') || 'Sync was rejected for an unspecified reason.'));
  }

  await runPostSyncPipeline();

  revalidatePath('/settings');
  revalidatePath('/');
  revalidatePath('/portfolio');
  revalidatePath('/connections');
  redirect('/settings?synced=1');
}
