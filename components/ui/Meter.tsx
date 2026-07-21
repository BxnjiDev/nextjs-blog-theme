'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { MOTION } from '@/lib/motion/tokens';
import { scoreTone, TONE_DOT } from '@/lib/theme/tone';

/**
 * The one "score as a fill bar" component — replaces RiskGauge and
 * intelligence/ConfidenceMeter, which independently reinvented the same
 * labeled-bar idea (one with a flat tone color, one with a hand-tuned
 * gradient, on two different tier-boundary schemes). One flat color per
 * tone reads calmer than a multi-stop gradient — precision over
 * decoration — and the boundaries now come from the shared `scoreTone`
 * scale so a risk gauge, a health gauge, and a confidence bar always agree
 * on what "good" looks like.
 */
export default function Meter({
  label,
  score,
  max = 100,
  invert = false,
  formatValue,
}: {
  label?: string;
  score: number;
  max?: number;
  /** Set true when a higher score is worse (e.g. a risk factor) rather
   * than better (e.g. confidence, health). */
  invert?: boolean;
  formatValue?: (score: number, max: number) => string;
}) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  const tone = scoreTone(score, max, invert);
  const reduceMotion = useReducedMotion();

  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-atlas-text-tertiary">{label}</span>
          <span className="font-mono text-atlas-text-secondary">{formatValue ? formatValue(score, max) : `${score}/${max}`}</span>
        </div>
      )}
      <div className="h-1 w-full overflow-hidden rounded-full bg-atlas-border">
        <motion.div
          initial={reduceMotion ? false : { width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: MOTION.duration.chart, ease: MOTION.ease.standard }}
          className={`h-full rounded-full ${TONE_DOT[tone]}`}
        />
      </div>
    </div>
  );
}
