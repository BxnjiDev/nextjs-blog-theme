'use client';

import { motion } from 'framer-motion';

/** Renders the composed narrative sentences (lib/copy/homeNarrative.ts) as
 * one flowing lead paragraph, each sentence fading in a beat after the
 * last — reads like Atlas is delivering a briefing, not printing a log. */
export default function NarrativeSummary({ sentences }: { sentences: string[] }) {
  return (
    <p className="max-w-2xl text-lg leading-relaxed text-atlas-text-secondary">
      {sentences.map((s, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 + i * 0.15 }}
          className={i === 0 ? 'text-atlas-text' : ''}
        >
          {s}{' '}
        </motion.span>
      ))}
    </p>
  );
}
