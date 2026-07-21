import type { DataSourceFreshness } from '@/lib/domain/dataFreshness';
import Badge from './ui/Badge';
import Panel from './ui/Panel';
import { STALENESS_TONE } from '@/lib/theme/tone';

export default function FreshnessStrip({ sources }: { sources: DataSourceFreshness[] }) {
  return (
    <Panel variant="flat" className="p-3">
      <p className="mb-2 text-xs font-medium uppercase text-atlas-text-tertiary">Data freshness</p>
      <div className="flex flex-wrap gap-2">
        {sources.map((s) => (
          <Badge
            key={s.provider}
            tone={STALENESS_TONE[s.staleness] ?? 'muted'}
            title={`${s.lastUpdated ? `Last updated ${s.lastUpdated.toLocaleString()}` : 'Never updated'}${
              s.reliabilityPct !== null ? ` · ${s.reliabilityPct}% reliable, ~${s.avgLatencyMs}ms avg` : ''
            }`}
          >
            {s.label}
            {!s.configured && ' (mock)'}
            {s.staleness === 'stale' && ' — stale'}
          </Badge>
        ))}
      </div>
    </Panel>
  );
}
