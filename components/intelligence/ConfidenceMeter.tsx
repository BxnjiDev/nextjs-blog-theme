'use client';

import { motion } from 'framer-motion';

/** Thin animated fill bar — the "confidence meter" used on Intelligence
 * and Recommendations instead of a static pill badge, so conviction reads
 * as something Atlas is continuously measuring, not a fixed label. */
export default function ConfidenceMeter({ score, max = 100, label }: { score: number; max?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  const tone = pct >= 66 ? 'from-atlas-emerald to-atlas-steel' : pct >= 40 ? 'from-atlas-warning to-atlas-accent' : 'from-risk-high to-atlas-warning';

  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-atlas-text-tertiary">{label}</span>
          <span className="font-mono text-atlas-text-secondary">
            {score}/{max}
          </span>
        </div>
      )}
      <div className="h-1 w-full overflow-hidden rounded-full bg-atlas-border">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className={`h-full rounded-full bg-gradient-to-r ${tone}`}
        />
      </div>
    </div>
  );
}
