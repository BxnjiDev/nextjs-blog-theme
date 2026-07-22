import Badge from '@/components/ui/Badge';
import type { FreshnessStatus } from '@/lib/marketdata/types';
import { FRESHNESS_LABEL } from '@/lib/marketdata/types';
import type { Tone } from '@/lib/theme/tone';

/** How each FreshnessStatus should read at a glance — the brief's
 * explicit "the user must always be able to see whether a chart is live,
 * delayed, cached, stale, market closed, or provider unavailable." Never
 * shows a generic "connected" state that could be mistaken for live. */
const FRESHNESS_TONE: Record<FreshnessStatus, Tone> = {
  live: 'positive',
  delayed: 'info',
  end_of_day: 'neutral',
  cached: 'muted',
  stale: 'warning',
  unavailable: 'negative',
  mock: 'muted',
};

export default function ChartStatusBadge({ freshness, asOf }: { freshness: FreshnessStatus; asOf: Date | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <Badge tone={FRESHNESS_TONE[freshness]}>{FRESHNESS_LABEL[freshness]}</Badge>
      {asOf && <span className="text-[11px] text-atlas-text-tertiary">as of {asOf.toLocaleTimeString()}</span>}
    </div>
  );
}
