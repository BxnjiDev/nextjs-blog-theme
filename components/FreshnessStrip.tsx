import type { DataSourceFreshness } from '@/lib/domain/dataFreshness';

/** Shared with components/StatusIndicator.tsx (the site-wide header strip)
 * so staleness reads the same color everywhere in the app. */
export const STALENESS_STYLES: Record<string, string> = {
  fresh: 'bg-risk-low/10 text-risk-low',
  aging: 'bg-risk-medium/10 text-risk-medium',
  stale: 'bg-risk-high/10 text-risk-high',
  unknown: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export default function FreshnessStrip({ sources }: { sources: DataSourceFreshness[] }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <p className="mb-2 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Data freshness</p>
      <div className="flex flex-wrap gap-2">
        {sources.map((s) => (
          <span
            key={s.provider}
            title={`${s.lastUpdated ? `Last updated ${s.lastUpdated.toLocaleString()}` : 'Never updated'}${
              s.reliabilityPct !== null ? ` · ${s.reliabilityPct}% reliable, ~${s.avgLatencyMs}ms avg` : ''
            }`}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STALENESS_STYLES[s.staleness]}`}
          >
            {s.label}
            {!s.configured && ' (mock)'}
            {s.staleness === 'stale' && ' — stale'}
          </span>
        ))}
      </div>
    </div>
  );
}
