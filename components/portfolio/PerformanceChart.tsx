'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import TrendLineChart from '@/components/charts/TrendLineChart';
import { formatPercent } from '@/lib/format';
import { MOTION } from '@/lib/motion/tokens';
import type { PerformanceHistoryPoint } from '@/lib/domain/performance';

const PERIODS = ['1W', '1M', '3M'] as const;
type Period = (typeof PERIODS)[number];
const WINDOW_DAYS: Record<Period, number> = { '1W': 7, '1M': 30, '3M': 90 };

/** Same formula as performance.ts's computeReturn, applied to whatever
 * slice of history the period toggle currently shows — so the headline
 * number always matches the two endpoints actually drawn on the chart,
 * rather than a separately-computed daily/weekly/monthly figure that might
 * reference a slightly different pair of dates. */
function windowReturn(history: PerformanceHistoryPoint[]) {
  if (history.length < 2) return null;
  const first = history[0];
  const last = history[history.length - 1];
  const portfolioReturn = ((last.portfolioValue - first.portfolioValue) / first.portfolioValue) * 100;
  const sp500Return = ((last.sp500Value - first.sp500Value) / first.sp500Value) * 100;
  return { returnPercent: portfolioReturn, vsSp500Percent: portfolioReturn - sp500Return };
}

export default function PerformanceChart({ history }: { history: PerformanceHistoryPoint[] }) {
  const [period, setPeriod] = useState<Period>('1M');
  const slice = history.slice(-WINDOW_DAYS[period]);
  const ret = windowReturn(slice);
  const positive = (ret?.returnPercent ?? 0) >= 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Performance</h2>
          {ret ? (
            <p className={`mt-1 font-mono text-lg ${positive ? 'text-risk-low' : 'text-risk-high'}`}>
              {formatPercent(ret.returnPercent)}
              <span className="ml-1.5 text-xs text-atlas-text-tertiary">
                ({ret.vsSp500Percent >= 0 ? '+' : ''}
                {ret.vsSp500Percent.toFixed(2)}pp vs. S&amp;P 500)
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-atlas-text-tertiary">Not enough snapshot history for this window yet.</p>
          )}
        </div>
        <div className="flex rounded-lg border border-atlas-border p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                period === p ? 'bg-atlas-surface-raised text-atlas-text' : 'text-atlas-text-tertiary hover:text-atlas-text-secondary'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={period}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MOTION.duration.stage }}
          className="mt-4"
        >
          <TrendLineChart data={slice.map((p) => ({ label: p.date.slice(5), value: p.portfolioValue }))} color={positive ? '#8b5cf6' : '#dc2626'} height={200} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
