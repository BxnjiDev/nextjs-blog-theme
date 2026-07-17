import WidgetCard from './WidgetCard';
import type { RecentDecision } from '@/lib/domain/homeDashboard';

const DECISION_STYLES: Record<string, string> = {
  ACCEPTED: 'text-risk-low',
  PARTIALLY_ACCEPTED: 'text-risk-medium',
  REJECTED: 'text-risk-high',
  DEFERRED: 'text-atlas-text-tertiary',
};

export default function RecentDecisionsWidget({ decisions }: { decisions: RecentDecision[] }) {
  return (
    <WidgetCard title="Recent decisions">
      {decisions.length === 0 ? (
        <p className="text-sm text-atlas-text-tertiary">No recommendations decided on yet.</p>
      ) : (
        <ul className="space-y-2">
          {decisions.map((d, i) => (
            <li key={i} className="flex items-center justify-between text-sm">
              <span className="font-medium text-atlas-text">{d.symbol}</span>
              <span className={`text-xs font-medium ${DECISION_STYLES[d.userDecision] ?? 'text-atlas-text-secondary'}`}>
                {d.userDecision.replace(/_/g, ' ').toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
