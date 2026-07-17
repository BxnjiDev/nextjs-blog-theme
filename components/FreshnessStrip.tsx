import type { DataSourceFreshness } from '@/lib/domain/dataFreshness';

/** Shared with components/StatusIndicator.tsx (the site-wide header strip)
 * so staleness reads the same color everywhere in the app. */
export const STALENESS_STYLES: Record<string, string> = {
  fresh: 'bg-risk-low/10 text-risk-low',
  aging: 'bg-risk-medium/10 text-risk-medium',
  stale: 'bg-risk-high/10 text-risk-high',
  unknown: 'bg-atlas-surface-raised text-atlas-text-tertiary',
};

export default function FreshnessStrip({ sources }: { sources: DataSourceFreshness[] }) {
  return (
    <div className="rounded-lg border border-atlas-border bg-atlas-surface p-3">
      <p className="mb-2 text-xs font-medium uppercase text-atlas-text-tertiary">Data freshness</p>
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
