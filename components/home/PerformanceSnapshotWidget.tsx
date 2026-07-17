import WidgetCard from './WidgetCard';
import type { PerformanceSummary } from '@/lib/domain/performance';

export default function PerformanceSnapshotWidget({ performance }: { performance: PerformanceSummary }) {
  const metric = performance.weekly.available ? performance.weekly : performance.daily;
  const label = performance.weekly.available ? 'This week vs. SPY' : 'Today vs. SPY';

  return (
    <WidgetCard title="Performance snapshot">
      {!metric.available ? (
        <p className="text-sm text-atlas-text-tertiary">{metric.note ?? 'Not enough history yet.'}</p>
      ) : (
        <>
          <p className={`text-2xl font-semibold ${(metric.returnPercent ?? 0) >= 0 ? 'text-risk-low' : 'text-risk-high'}`}>
            {(metric.returnPercent ?? 0) >= 0 ? '+' : ''}
            {metric.returnPercent?.toFixed(2)}%
          </p>
          <p className="mt-1 text-xs text-atlas-text-tertiary">
            {label} ({(metric.vsSp500Percent ?? 0) >= 0 ? '+' : ''}
            {metric.vsSp500Percent?.toFixed(2)}pp vs. S&amp;P 500)
          </p>
        </>
      )}
    </WidgetCard>
  );
}
