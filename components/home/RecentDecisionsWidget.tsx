import WidgetCard from './WidgetCard';
import type { RecentDecision } from '@/lib/domain/homeDashboard';
import { DECISION_TONE, TONE_TEXT } from '@/lib/theme/tone';

export default function RecentDecisionsWidget({
  decisions,
  variant = 'card',
}: {
  decisions: RecentDecision[];
  variant?: 'card' | 'plain';
}) {
  return (
    <WidgetCard title="Recent decisions" variant={variant}>
      {decisions.length === 0 ? (
        <p className="text-sm text-atlas-text-tertiary">No recommendations decided on yet.</p>
      ) : (
        <ul className="space-y-2">
          {decisions.map((d, i) => (
            <li key={i} className="flex items-center justify-between text-sm">
              <span className="font-medium text-atlas-text">{d.symbol}</span>
              <span className={`text-xs font-medium ${TONE_TEXT[DECISION_TONE[d.userDecision] ?? 'neutral']}`}>
                {d.userDecision.replace(/_/g, ' ').toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
