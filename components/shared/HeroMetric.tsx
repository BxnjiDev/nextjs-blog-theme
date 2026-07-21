'use client';

import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import AnimatedNumber, { type NumberFormat } from '@/components/motion/AnimatedNumber';
import { formatCurrency, formatPercent } from '@/lib/format';

/**
 * The one "big number" composition Home and Portfolio both open with —
 * shared here so the two pages read as one product instead of each
 * inventing its own hero treatment. An eyebrow label, one large animated
 * value, an optional change badge (dollar + percent, colored + directional
 * icon so the signal never depends on color alone), and an optional meta
 * line underneath.
 */
export default function HeroMetric({
  eyebrow,
  value,
  format = 'currency0',
  changeValue,
  changePercent,
  changeLabel,
  meta,
}: {
  eyebrow: string;
  value: number;
  format?: NumberFormat;
  changeValue?: number;
  changePercent?: number;
  changeLabel?: string;
  meta?: React.ReactNode;
}) {
  const hasChange = changeValue !== undefined && changePercent !== undefined;
  const positive = (changePercent ?? 0) >= 0;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-atlas-text-tertiary">{eyebrow}</p>
      <div className="mt-3 flex flex-wrap items-baseline gap-4">
        <AnimatedNumber value={value} format={format} className="text-5xl font-semibold tracking-tight text-atlas-text sm:text-6xl" duration={1.1} />
        {hasChange && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium ${
              positive ? 'bg-risk-low/10 text-risk-low' : 'bg-risk-high/10 text-risk-high'
            }`}
          >
            {positive ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}
            {formatCurrency(Math.abs(changeValue!))} ({formatPercent(changePercent!)})
            {changeLabel && <span className="ml-1 text-xs opacity-70">{changeLabel}</span>}
          </span>
        )}
      </div>
      {meta && <div className="mt-3 text-sm text-atlas-text-tertiary">{meta}</div>}
    </div>
  );
}
