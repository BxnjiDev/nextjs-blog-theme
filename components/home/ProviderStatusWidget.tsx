import Link from 'next/link';
import WidgetCard from './WidgetCard';
import type { GlobalStatus } from '@/lib/domain/globalStatus';
import { STALENESS_STYLES } from '../FreshnessStrip';

function Row({ label, source }: { label: string; source: GlobalStatus['marketData'] }) {
  const suffix = !source.configured ? 'mock' : source.staleness;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-atlas-text-secondary">{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STALENESS_STYLES[source.staleness]}`}>{suffix}</span>
    </div>
  );
}

/** Compact provider-health glance for Home — the full detail (latency,
 * retry policy, auth errors) lives on /connections, this just answers
 * "is anything mock or stale right now." */
export default function ProviderStatusWidget({ status }: { status: GlobalStatus }) {
  return (
    <WidgetCard title="Provider status" action={<Link href="/connections" className="text-xs text-atlas-text-tertiary underline">Details →</Link>}>
      <div className="space-y-1.5">
        <Row label="Market data" source={status.marketData} />
        <Row label="Fundamentals" source={status.fundamentals} />
        <Row label="News" source={status.news} />
      </div>
    </WidgetCard>
  );
}
