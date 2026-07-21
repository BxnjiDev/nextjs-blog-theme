import type { ConvictionTrend } from '@/lib/domain/intelligence';

const styles: Record<ConvictionTrend, string> = {
  IMPROVING: 'bg-risk-low/10 text-risk-low',
  STABLE: 'bg-atlas-surface-raised text-atlas-text-secondary',
  WEAKENING: 'bg-risk-high/10 text-risk-high',
  UNKNOWN: 'bg-atlas-surface-raised text-atlas-text-tertiary',
};

const labels: Record<ConvictionTrend, string> = {
  IMPROVING: '▲ Growing confidence',
  STABLE: '● Stable',
  WEAKENING: '▼ Weakening',
  UNKNOWN: 'Not enough history',
};

export default function TrendBadge({ trend }: { trend: ConvictionTrend }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[trend]}`}>
      {labels[trend]}
    </span>
  );
}
