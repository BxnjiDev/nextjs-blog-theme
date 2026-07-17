import Link from 'next/link';
import type { GlobalStatus } from '@/lib/domain/globalStatus';
import { STALENESS_STYLES } from './FreshnessStrip';

function Pill({ label, className, title }: { label: string; className: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function sourcePill(label: string, source: GlobalStatus['marketData']) {
  const suffix = !source.configured ? ' (mock)' : source.staleness === 'stale' ? ' — stale' : '';
  return (
    <Pill
      key={label}
      label={`${label}${suffix}`}
      className={STALENESS_STYLES[source.staleness]}
      title={source.lastUpdated ? `Last updated ${source.lastUpdated.toLocaleString()}` : 'Never updated'}
    />
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
  const modeStyle =
    status.mode === 'live-evaluation'
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
      : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400';

  const syncStyle = !status.robinhoodSync.lastSyncedAt
    ? STALENESS_STYLES.unknown
    : status.robinhoodSync.success === false
      ? STALENESS_STYLES.stale
      : status.robinhoodSync.ageHours !== null && status.robinhoodSync.ageHours < 24
        ? STALENESS_STYLES.fresh
        : STALENESS_STYLES.stale;

  const syncLabel = !status.robinhoodSync.lastSyncedAt
    ? 'Robinhood: never synced'
    : status.robinhoodSync.success === false
      ? 'Robinhood: last sync rejected'
      : `Robinhood: synced ${status.robinhoodSync.ageHours !== null ? `${status.robinhoodSync.ageHours.toFixed(0)}h ago` : ''}`;

  return (
    <div className="border-b border-gray-200 bg-gray-50 px-6 py-1.5 dark:border-gray-800 dark:bg-gray-900/50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 text-xs">
        <Pill label={status.mode === 'live-evaluation' ? 'LIVE-EVALUATION MODE' : 'development mode'} className={modeStyle} />
        {sourcePill('Market data', status.marketData)}
        {sourcePill('Fundamentals', status.fundamentals)}
        {sourcePill('News', status.news)}
        <Pill label={syncLabel} className={syncStyle} />
        <span className="text-gray-400 dark:text-gray-600">
          Last full run:{' '}
          {status.lastFullIntelligenceRunAt ? status.lastFullIntelligenceRunAt.toLocaleString() : 'never'}
        </span>
        <Link href="/connections" className="ml-auto underline text-gray-500 dark:text-gray-400">
          Operations →
        </Link>
      </div>
    </div>
  );
}
