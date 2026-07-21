import WidgetCard from './WidgetCard';
import AnimatedNumber from '../motion/AnimatedNumber';
import type { PerformanceSummary } from '@/lib/domain/performance';

// Below this balance, a percent return is arithmetically correct but not
// meaningful — a few cents of movement on a near-empty evaluation balance
// can compute to a four-digit percentage. This is a presentation-only
// guard (the underlying return math in lib/domain/performance.ts is
// untouched): it never hides or alters the number, it just tells the
// reader why it looks extreme instead of presenting it as a clean
// headline stat. See Atlas's own "never make insufficient data look
// statistically meaningful" principle (Mission page, "Honest about what
// it doesn't know").
const SMALL_BALANCE_THRESHOLD = 25;

export default function PerformanceSnapshotWidget({ performance }: { performance: PerformanceSummary }) {
  const metric = performance.weekly.available ? performance.weekly : performance.daily;
  const label = performance.weekly.available ? 'This week vs. SPY' : 'Today vs. SPY';
  const smallBalance = (performance.today?.portfolioValue ?? Infinity) < SMALL_BALANCE_THRESHOLD;

  return (
    <WidgetCard title="Performance snapshot">
      {!metric.available ? (
        <p className="text-sm text-atlas-text-tertiary">{metric.note ?? 'Not enough history yet.'}</p>
      ) : (
        <>
          <AnimatedNumber
            value={metric.returnPercent ?? 0}
            format="percent2"
            className={`text-2xl font-semibold ${(metric.returnPercent ?? 0) >= 0 ? 'text-risk-low' : 'text-risk-high'}`}
          />
          <p className="mt-1 text-xs text-atlas-text-tertiary">
            {label} ({(metric.vsSp500Percent ?? 0) >= 0 ? '+' : ''}
            {metric.vsSp500Percent?.toFixed(2)}pp vs. S&amp;P 500)
          </p>
          {smallBalance && (
            <p className="mt-1.5 text-xs text-atlas-warning">
              Balance is small enough that percent changes are exaggerated — not statistically meaningful yet.
            </p>
          )}
        </>
      )}
    </WidgetCard>
  );
}
