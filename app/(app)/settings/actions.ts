'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { syncAccount } from '@/lib/domain/accountSync';
import { runPostSyncPipeline } from '@/lib/domain/accountSyncPipeline';
import { runJob } from '@/lib/domain/scheduler';
import { prisma } from '@/lib/prisma';
import type { RobinhoodIngestResult } from '@/lib/domain/robinhoodSyncIngest';

/** The exact page set a successful sync can change the displayed data on
 * — kept in one place so both sync entry points below revalidate
 * identically. */
function revalidateAfterSync(): void {
  revalidatePath('/');
  revalidatePath('/portfolio');
  revalidatePath('/intelligence');
  revalidatePath('/recommendations');
  revalidatePath('/settings');
  revalidatePath('/connections');
}

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

  revalidateAfterSync();
  redirect('/settings?synced=1');
}

/**
 * The "Check inbox now" button — processes whatever's currently waiting in
 * data/robinhood-inbox/ (see lib/domain/robinhoodSyncIngest.ts) via the
 * exact same scheduler job the watch script (`npm run
 * sync:robinhood:watch`) runs on a timer, so a manual click and the
 * background loop can never race each other (the scheduler's Postgres
 * lock, see lib/domain/scheduler.ts, is shared by both). Does not require
 * pasting anything — for when an agent session has already dropped a
 * payload on disk and you don't want to wait for the next scheduled tick.
 */
export async function checkRobinhoodInbox(): Promise<void> {
  const outcome = await runJob('robinhoodSyncIngest', 'manual');
  const run = await prisma.schedulerRun.findUnique({ where: { id: outcome.schedulerRunId! } });
  const result = run?.result as unknown as RobinhoodIngestResult | null;

  if (outcome.status === 'FAILURE') {
    redirect('/settings?syncError=' + encodeURIComponent(run?.error ?? 'Inbox check failed for an unspecified reason.'));
  }
  if (outcome.status === 'SKIPPED') {
    redirect('/settings?syncError=' + encodeURIComponent(run?.error ?? 'Another sync was already in progress — try again in a moment.'));
  }
  if (!result || result.filesFound === 0) {
    redirect('/settings?syncInfo=' + encodeURIComponent('Checked the inbox — nothing waiting to sync.'));
  }
  if (result.rejected > 0 && result.synced === 0) {
    redirect('/settings?syncError=' + encodeURIComponent(result.errors.join(' ')));
  }

  revalidateAfterSync();
  redirect('/settings?synced=1');
}
