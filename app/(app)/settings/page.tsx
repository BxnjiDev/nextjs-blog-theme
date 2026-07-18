import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getOperatingMode } from '@/lib/domain/operatingMode';
import { getGlobalStatus } from '@/lib/domain/globalStatus';
import { prisma } from '@/lib/prisma';
import { logout } from '@/app/login/actions';
import { syncRobinhoodPayload } from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ searchParams }: { searchParams: { synced?: string; syncError?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const mode = getOperatingMode();
  const [status, latestSyncLog] = await Promise.all([getGlobalStatus(), prisma.syncLog.findFirst({ orderBy: { syncedAt: 'desc' } })]);
  const sync = status.robinhoodSync;
  const syncErrors = (latestSyncLog?.errors as unknown as string[]) ?? [];
  const syncWarnings = (latestSyncLog?.warnings as unknown as string[]) ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-atlas-text">Settings</h1>
        <p className="mt-1 text-sm text-atlas-text-secondary">Account, operating mode, and operational tools.</p>
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

        {syncErrors.length > 0 && (
          <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {syncErrors.map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </div>
        )}
        {syncWarnings.length > 0 && (
          <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            {syncWarnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        )}

        {searchParams.synced === '1' && (
          <div className="mb-3 rounded-lg border border-risk-low/20 bg-risk-low/10 px-3 py-2 text-xs text-risk-low">Synced successfully.</div>
        )}
        {searchParams.syncError && (
          <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{searchParams.syncError}</div>
        )}

        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-atlas-text-secondary hover:text-atlas-text">
            Paste a sync payload
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
            <button type="submit" className="rounded-lg bg-atlas-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-atlas-accent/90">
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
