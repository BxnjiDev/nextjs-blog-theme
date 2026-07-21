'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import AtlasCore from '@/components/atlas-identity/AtlasCore';
import OrbitalField from '@/components/atlas-identity/OrbitalField';

// Short enough to "avoid unnecessarily delaying repeat users," long enough
// for the arrival moment to breathe. The Skip control covers anyone who
// wants it faster still.
const TOTAL_DURATION_MS = 2600;

/**
 * The pre-login boot moment: Atlas's orbital geometry resolving around the
 * core before the authorization form appears. Purely decorative — it never
 * touches app/login/actions.ts, never calls anything, and deliberately has
 * no diagnostic checklist (real provider health lives on /connections,
 * post-authentication) — just a visual, concise "Atlas is awakening" beat.
 */
export default function BootSequence({ onComplete }: { onComplete: () => void }) {
  const reduceMotion = useReducedMotion();
  const [skipVisible, setSkipVisible] = useState(false);

  useEffect(() => {
    if (reduceMotion) {
      const t = setTimeout(onComplete, 150);
      return () => clearTimeout(t);
    }
    const skipTimer = setTimeout(() => setSkipVisible(true), 500);
    const doneTimer = setTimeout(onComplete, TOTAL_DURATION_MS);
    return () => {
      clearTimeout(skipTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete, reduceMotion]);

  if (reduceMotion) return null;

  return (
    <motion.div
      key="boot"
      exit={{ opacity: 0, scale: 1.06, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-atlas-canvas"
    >
      <div className="pointer-events-none absolute inset-0 bg-atlas-aurora" />

      <div className="relative flex items-center justify-center">
        <OrbitalField size={280} variant="resolving" className="absolute" />
        <motion.div initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
          <AtlasCore state="verifying" size="xl" />
        </motion.div>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="relative mt-8 text-sm uppercase tracking-[0.3em] text-atlas-text-secondary"
      >
        Atlas
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="relative mt-1 text-xs text-atlas-text-tertiary"
      >
        Awakening&hellip;
      </motion.p>

      <AnimatePresence>
        {skipVisible && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onComplete}
            className="relative mt-10 text-xs text-atlas-text-tertiary underline decoration-dotted transition-colors hover:text-atlas-accent-bright"
          >
            Skip
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
