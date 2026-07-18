import WidgetCard from './WidgetCard';
import type { GlobalStatus } from '@/lib/domain/globalStatus';
import { formatRelativeTime } from '@/lib/format';

export default function LatestSyncWidget({ sync }: { sync: GlobalStatus['robinhoodSync'] }) {
  const label = !sync.lastSyncedAt
    ? 'Never synced'
    : sync.success === false
      ? 'Last sync rejected'
      : `Updated ${formatRelativeTime(sync.lastSyncedAt)}`;

  const tone = !sync.lastSyncedAt ? 'text-atlas-text-tertiary' : sync.success === false ? 'text-risk-high' : 'text-atlas-text';

  return (
    <WidgetCard title="Latest Robinhood sync">
      <p className={`text-2xl font-semibold ${tone}`}>{label}</p>
      <p className="mt-1 text-xs text-atlas-text-tertiary">
        {sync.lastSyncedAt ? sync.lastSyncedAt.toLocaleString() : 'Sync the evaluation account to enable live recommendations.'}
      </p>
    </WidgetCard>
  );
}
