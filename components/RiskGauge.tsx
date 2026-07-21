'use client';

import { motion } from 'framer-motion';

export default function RiskGauge({
  label,
  score,
  invert = false,
}: {
  label: string;
  score: number;
  /** Set true when higher = better (e.g. a health score) instead of higher = riskier. */
  invert?: boolean;
}) {
  const tone = invert
    ? score >= 66
      ? 'bg-risk-low'
      : score >= 33
        ? 'bg-risk-medium'
        : 'bg-risk-high'
    : score >= 66
      ? 'bg-risk-high'
      : score >= 33
        ? 'bg-risk-medium'
        : 'bg-risk-low';

  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-atlas-text-secondary">{label}</span>
        <span className="font-mono text-atlas-text">{score}/100</span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-atlas-border">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${score}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className={`h-full rounded-full ${tone}`}
        />
      </div>
    </div>
  );
}
