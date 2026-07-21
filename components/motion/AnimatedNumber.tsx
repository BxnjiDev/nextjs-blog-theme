'use client';

import { useEffect, useRef } from 'react';
import { useMotionValue, useTransform, animate } from 'framer-motion';
import { MOTION } from '@/lib/motion/tokens';

export type NumberFormat = 'integer' | 'currency0' | 'score100' | 'percent2';

// Functions can't cross the Server -> Client Component boundary (they
// aren't serializable), so callers pass a preset name instead of a
// formatter function — every formatter lives here, client-side, where it's
// actually invoked.
const FORMATTERS: Record<NumberFormat, (n: number) => string> = {
  integer: (n) => Math.round(n).toLocaleString(),
  currency0: (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
  score100: (n) => `${Math.round(n)}/100`,
  percent2: (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`,
};

/**
 * "Animated counters" from the design brief — ticks from 0 (or its own
 * previous value on re-render) up to `value` rather than popping in
 * instantly. Purely presentational: takes the already-computed number a
 * server component fetched and never touches how that number was derived.
 */
export default function AnimatedNumber({
  value,
  format = 'integer',
  className,
  duration = MOTION.duration.count,
}: {
  value: number;
  format?: NumberFormat;
  className?: string;
  duration?: number;
}) {
  const formatter = FORMATTERS[format];
  const motionValue = useMotionValue(0);
  const display = useTransform(motionValue, (v) => formatter(v));
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const controls = animate(motionValue, value, { duration, ease: MOTION.ease.standard });
    return controls.stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (ref.current) ref.current.textContent = display.get();
    return display.on('change', (v) => {
      if (ref.current) ref.current.textContent = v;
    });
  }, [display]);

  return (
    <span ref={ref} className={className}>
      {formatter(0)}
    </span>
  );
}
