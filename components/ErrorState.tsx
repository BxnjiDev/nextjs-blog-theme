'use client';

import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

/**
 * The shared component behind every route's error.tsx. Deliberately calm,
 * not alarmist — matches Mission's "honest about what it doesn't know"
 * principle: something broke, here's what, here's the one thing to try,
 * no drama.
 */
export default function ErrorState({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="atlas-glass mx-auto max-w-md rounded-2xl p-8 text-center"
    >
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-risk-high/10 text-risk-high">
        <AlertTriangle size={18} strokeWidth={1.75} />
      </div>
      <h1 className="mt-4 text-base font-semibold text-atlas-text">Something interrupted this view</h1>
      <p className="mt-2 text-sm leading-relaxed text-atlas-text-tertiary">{error.message || 'An unexpected error occurred.'}</p>
      <button
        onClick={reset}
        className="mt-5 rounded-lg border border-atlas-border bg-atlas-surface-raised px-4 py-2 text-sm font-medium text-atlas-text-secondary transition-all hover:border-atlas-accent/40 hover:text-atlas-text active:scale-[0.97]"
      >
        Try again
      </button>
    </motion.div>
  );
}
