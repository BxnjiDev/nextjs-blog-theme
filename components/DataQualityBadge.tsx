import type { DataQuality } from '@/lib/integrations';

const STALE_THRESHOLD_HOURS = 24;

function isStale(asOf: Date, staleAfterHours: number): boolean {
  return Date.now() - asOf.getTime() > staleAfterHours * 60 * 60 * 1000;
}

const labels: Record<DataQuality, string> = {
  live: 'Live',
  delayed: 'Delayed',
  mock: 'Mock',
};

const styles: Record<DataQuality, string> = {
  live: 'bg-risk-low/10 text-risk-low',
  delayed: 'bg-atlas-cyan/10 text-atlas-cyan',
  mock: 'bg-atlas-surface-raised text-atlas-text-tertiary',
};

export default function DataQualityBadge({
  quality,
  asOf,
  staleAfterHours = STALE_THRESHOLD_HOURS,
}: {
  quality: DataQuality;
  asOf: Date;
  staleAfterHours?: number;
}) {
  const stale = isStale(asOf, staleAfterHours);
  const label = stale ? 'Stale' : labels[quality];
  const style = stale ? 'bg-risk-high/10 text-risk-high' : styles[quality];

  return (
    <span
      title={`As of ${asOf.toLocaleString()}`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}
