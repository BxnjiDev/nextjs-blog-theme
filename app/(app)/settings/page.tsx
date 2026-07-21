import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getOperatingMode } from '@/lib/domain/operatingMode';
import { getGlobalStatus } from '@/lib/domain/globalStatus';
import { getActiveAccountId } from '@/lib/domain/portfolio';
import { ROBINHOOD_INBOX_DIR, type RobinhoodIngestResult } from '@/lib/domain/robinhoodSyncIngest';
import { prisma } from '@/lib/prisma';
import { logout } from '@/app/login/actions';
import { formatRelativeTime } from '@/lib/format';
import StatusBanner from '@/components/StatusBanner';
import { syncRobinhoodPayload, checkRobinhoodInbox } from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ searchParams }: { searchParams: { synced?: string; syncError?: string; syncInfo?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const mode = getOperatingMode();
  const activeAccountId = await getActiveAccountId();
  const [status, latestSyncLog, latestIngestRun] = await Promise.all([
    getGlobalStatus(),
    // Scoped to the active account — an unscoped "most recent SyncLog
    // anywhere" would let a rejected attempt for a stale test fixture or
    // an old CLI experiment (accountId is null on schema-rejected
    // payloads, since they're rejected before an account is resolved)
    // outrank and hide the real account's own status just for being more
    // recent. See globalStatus.ts for the same fix applied there.
    activeAccountId
      ? prisma.syncLog.findFirst({ where: { accountId: activeAccountId }, orderBy: { syncedAt: 'desc' } })
      : null,
    prisma.schedulerRun.findFirst({ where: { jobName: 'robinhoodSyncIngest' }, orderBy: { startedAt: 'desc' } }),
  ]);
  const activeAccount = activeAccountId ? await prisma.account.findUnique({ where: { id: activeAccountId } }) : null;
  const sync = status.robinhoodSync;
  const syncErrors = (latestSyncLog?.errors as unknown as string[]) ?? [];
  const syncWarnings = (latestSyncLog?.warnings as unknown as string[]) ?? [];
  const ingestResult = latestIngestRun?.result as unknown as RobinhoodIngestResult | null;
  const nextWatchTick = latestIngestRun?.trigger === 'scheduled' && latestIngestRun.finishedAt
    ? new Date(latestIngestRun.finishedAt.getTime() + Number(process.env.ROBINHOOD_SYNC_INTERVAL_SECONDS ?? 300) * 1000)
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-atlas-text">Settings</h1>
        <p className="mt-1.5 text-sm text-atlas-text-secondary">Account, operating mode, and operational tools.</p>
      </div>

      <div className="rounded-xl border border-atlas-border bg-atlas-surface p-5">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Account</h2>
        <div className="flex items-center justify-between">
          <p className="text-sm text-atlas-text">{user.email}</p>
          <form action={logout}>
            <button type="submit" className="rounded-lg border border-atlas-border px-3 py-1.5 text-xs text-atlas-text-secondary hover:text-atlas-text">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-xl border border-atlas-border bg-atlas-surface p-5">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Operating mode</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-atlas-text">
              {mode === 'live-evaluation' ? 'Live evaluation' : 'Development'}
            </p>
            <p className="mt-1 text-xs text-atlas-text-tertiary">
              {mode === 'live-evaluation'
                ? 'Recommendations require real, fresh market data and fundamentals — mock data blocks rather than substitutes.'
                : 'Mock/heuristic providers are expected and safe. Set ATLAS_MODE=live-evaluation once every required provider is configured.'}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-atlas-border bg-atlas-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Robinhood sync</h2>
          <Link href="/connections" className="text-xs text-atlas-text-tertiary underline hover:text-atlas-text-secondary">
            Full history →
          </Link>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              !sync.lastSyncedAt ? 'bg-atlas-text-tertiary' : sync.success === false ? 'bg-risk-high' : 'bg-risk-low'
            }`}
          />
          <div>
            <p className="text-sm text-atlas-text">
              {!sync.lastSyncedAt
                ? 'Never synced'
                : sync.success === false
                  ? 'Last sync rejected'
                  : `Synced ${sync.ageHours !== null ? `${sync.ageHours.toFixed(1)}h ago` : ''}`}
            </p>
            {latestSyncLog && (
              <p className="mt-0.5 text-xs text-atlas-text-tertiary">
                {latestSyncLog.syncedAt.toLocaleString()} · source: {latestSyncLog.source}
              </p>
            )}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-atlas-canvas p-3 text-xs sm:grid-cols-4">
          <div>
            <p className="text-atlas-text-tertiary">Active account</p>
            <p className="mt-0.5 text-atlas-text">{activeAccount ? `${activeAccount.provider} · ${activeAccount.externalId}` : 'None'}</p>
          </div>
          <div>
            <p className="text-atlas-text-tertiary">Cash</p>
            <p className="mt-0.5 text-atlas-text">{activeAccount ? `$${Number(activeAccount.cashBalance).toFixed(2)}` : '—'}</p>
          </div>
          <div>
            <p className="text-atlas-text-tertiary">Inbox watcher</p>
            <p className="mt-0.5 text-atlas-text">
              {latestIngestRun ? `Last checked ${formatRelativeTime(latestIngestRun.finishedAt)}` : 'Never run'}
            </p>
          </div>
          <div>
            <p className="text-atlas-text-tertiary">Next scheduled check</p>
            <p className="mt-0.5 text-atlas-text">
              {nextWatchTick ? nextWatchTick.toLocaleTimeString() : 'Not running'}
            </p>
          </div>
        </div>

        {ingestResult && ingestResult.errors.length > 0 && (
          <StatusBanner variant="error" className="mb-3">
            {ingestResult.errors.map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </StatusBanner>
        )}

        {syncErrors.length > 0 && (
          <StatusBanner variant="error" className="mb-3">
            {syncErrors.map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </StatusBanner>
        )}
        {syncWarnings.length > 0 && (
          <StatusBanner variant="warning" className="mb-3">
            {syncWarnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </StatusBanner>
        )}

        {searchParams.synced === '1' && (
          <StatusBanner variant="success" className="mb-3">
            Synced successfully.
          </StatusBanner>
        )}
        {searchParams.syncError && (
          <StatusBanner variant="error" className="mb-3">
            {searchParams.syncError}
          </StatusBanner>
        )}
        {searchParams.syncInfo && (
          <StatusBanner variant="info" className="mb-3">
            {searchParams.syncInfo}
          </StatusBanner>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <form action={checkRobinhoodInbox}>
            <button
              type="submit"
              className="rounded-lg bg-atlas-accent px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-atlas-accent-bright hover:shadow-glow-accent active:scale-[0.97]"
            >
              Check inbox now
            </button>
          </form>
          <p className="text-xs text-atlas-text-tertiary">
            Processes anything already dropped in <code className="rounded bg-atlas-surface-raised px-1">{ROBINHOOD_INBOX_DIR}</code> — no
            pasting required. Run <code className="rounded bg-atlas-surface-raised px-1">npm run sync:robinhood:watch</code> in a terminal to
            have this happen automatically every few minutes.
          </p>
        </div>

        <details className="group mt-4">
          <summary className="cursor-pointer text-xs font-medium text-atlas-text-secondary hover:text-atlas-text">
            Paste a sync payload instead
          </summary>
          <form action={syncRobinhoodPayload} className="mt-3 space-y-2">
            <p className="text-xs text-atlas-text-tertiary">
              Paste the account-sync JSON produced by an agent session with the Robinhood Agentic Trading MCP
              connector active (see <code className="rounded bg-atlas-surface-raised px-1">lib/domain/accountSyncSchema.ts</code>). Read-only on
              the Robinhood side — this never places, modifies, or cancels an order, and no credential is ever
              sent from this browser.
            </p>
            <textarea
              name="payload"
              rows={8}
              placeholder='{"schemaVersion":"1.0","asOf":"...","accountExternalId":"...","cashBalance":0,"buyingPower":0,"holdings":[]}'
              className="w-full rounded-lg border border-atlas-border bg-atlas-canvas px-3 py-2 font-mono text-xs text-atlas-text placeholder:text-atlas-text-tertiary focus:border-atlas-accent/40 focus:outline-none"
            />
            <button type="submit" className="rounded-lg border border-atlas-border px-3 py-1.5 text-xs font-medium text-atlas-text-secondary hover:text-atlas-text">
              Sync now
            </button>
          </form>
        </details>
      </div>

      <div className="rounded-xl border border-atlas-border bg-atlas-surface p-5">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Operations</h2>
        <p className="mb-3 text-sm text-atlas-text-secondary">
          Provider health, scheduled jobs, sync status, and data-quality blocks live on the operations dashboard.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/connections" className="rounded-lg border border-atlas-border px-3 py-1.5 text-xs text-atlas-text-secondary hover:text-atlas-text">
            Operations dashboard →
          </Link>
          <Link href="/executions" className="rounded-lg border border-atlas-border px-3 py-1.5 text-xs text-atlas-text-secondary hover:text-atlas-text">
            Record a manual trade →
          </Link>
        </div>
      </div>
    </div>
  );
}
