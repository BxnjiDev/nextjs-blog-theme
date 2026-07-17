import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getOperatingMode } from '@/lib/domain/operatingMode';
import { logout } from '@/app/login/actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const mode = getOperatingMode();

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
