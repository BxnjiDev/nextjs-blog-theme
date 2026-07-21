const styles: Record<string, string> = {
  BUY_MORE: 'bg-risk-low/10 text-risk-low',
  HOLD: 'bg-atlas-surface-raised text-atlas-text-secondary',
  REDUCE: 'bg-risk-medium/10 text-risk-medium',
  SELL: 'bg-risk-high/10 text-risk-high',
  WATCH: 'bg-atlas-cyan/10 text-atlas-cyan',
};

const labels: Record<string, string> = {
  BUY_MORE: 'Buy more',
  HOLD: 'Hold',
  REDUCE: 'Reduce',
  SELL: 'Sell',
  WATCH: 'Watch closely',
};

export default function ActionBadge({ action }: { action: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[action] ?? styles.HOLD}`}>
      {labels[action] ?? action}
    </span>
  );
}
