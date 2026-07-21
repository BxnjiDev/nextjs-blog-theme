import Link from 'next/link';
import WidgetCard from './WidgetCard';
import type { RecentThesisChange } from '@/lib/domain/homeDashboard';

export default function ThesisChangeWidget({
  change,
  variant = 'card',
}: {
  change: RecentThesisChange | null;
  variant?: 'card' | 'plain';
}) {
  return (
    <WidgetCard title="Recent thesis change" variant={variant}>
      {!change ? (
        <p className="text-sm text-atlas-text-tertiary">No thesis changes recorded yet.</p>
      ) : (
        <div>
          <div className="flex items-center justify-between">
            <Link href={`/intelligence/${change.symbol}`} className="font-medium text-atlas-text underline decoration-atlas-border underline-offset-2">
              {change.symbol}
            </Link>
            <span className="text-xs text-atlas-text-tertiary">{change.changeType.replace(/_/g, ' ').toLowerCase()}</span>
          </div>
          <p className="mt-1.5 text-sm text-atlas-text-secondary">{change.whatChanged ?? 'No details recorded.'}</p>
          <p className="mt-1 text-xs text-atlas-text-tertiary">{change.createdAt.toLocaleString()}</p>
        </div>
      )}
    </WidgetCard>
  );
}
