import Link from 'next/link';
import type { GlobalStatus } from '@/lib/domain/globalStatus';
import Badge from './ui/Badge';
import { STALENESS_TONE } from '@/lib/theme/tone';

function sourcePill(label: string, source: GlobalStatus['marketData']) {
  const suffix = !source.configured ? ' (mock)' : source.staleness === 'stale' ? ' — stale' : '';
  return (
    <Badge
      key={label}
      tone={STALENESS_TONE[source.staleness] ?? 'muted'}
      title={source.lastUpdated ? `Last updated ${source.lastUpdated.toLocaleString()}` : 'Never updated'}
    >
      {label}
      {suffix}
    </Badge>
  );
}

/**
 * Site-wide operating-mode + data-status strip, rendered once from
 * app/layout.tsx (same placement pattern as EvaluationBanner) so every
 * page — not just /connections — makes clear whether what's on screen is
 * live, stale, unavailable, or mock. See lib/domain/globalStatus.ts for
 * the data assembly (itself reusing getDataFreshnessSnapshot,
 * getOperatingMode) and /connections for the fuller operational
 * dashboard this links to.
 */
export default function StatusIndicator({ status }: { status: GlobalStatus }) {
  const modeTone = status.mode === 'live-evaluation' ? 'warning' : 'muted';

  const syncTone = !status.robinhoodSync.lastSyncedAt
    ? STALENESS_TONE.unknown
    : status.robinhoodSync.success === false
      ? STALENESS_TONE.stale
      : status.robinhoodSync.ageHours !== null && status.robinhoodSync.ageHours < 24
        ? STALENESS_TONE.fresh
        : STALENESS_TONE.stale;

  const syncLabel = !status.robinhoodSync.lastSyncedAt
    ? 'Robinhood: never synced'
    : status.robinhoodSync.success === false
      ? 'Robinhood: last sync rejected'
      : `Robinhood: synced ${status.robinhoodSync.ageHours !== null ? `${status.robinhoodSync.ageHours.toFixed(0)}h ago` : ''}`;

  return (
    <div className="border-b border-atlas-border bg-atlas-surface/60 px-6 py-1.5">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 text-xs">
        <Badge tone={modeTone}>{status.mode === 'live-evaluation' ? 'LIVE-EVALUATION MODE' : 'development mode'}</Badge>
        {sourcePill('Market data', status.marketData)}
        {sourcePill('Fundamentals', status.fundamentals)}
        {sourcePill('News', status.news)}
        <Badge tone={syncTone}>{syncLabel}</Badge>
        <span className="text-atlas-text-tertiary">
          Last full run:{' '}
          {status.lastFullIntelligenceRunAt ? status.lastFullIntelligenceRunAt.toLocaleString() : 'never'}
        </span>
        <Link href="/connections" className="ml-auto underline text-atlas-text-tertiary hover:text-atlas-text-secondary">
          Operations →
        </Link>
      </div>
    </div>
  );
}
