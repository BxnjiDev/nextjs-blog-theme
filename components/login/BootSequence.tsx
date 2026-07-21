'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Step {
  label: string;
  appearAt: number;
  doneAt: number;
}

const STEPS: Step[] = [
  { label: 'Robinhood connection', appearAt: 900, doneAt: 1500 },
  { label: 'AI systems', appearAt: 1500, doneAt: 2100 },
  { label: 'Market systems', appearAt: 2100, doneAt: 2700 },
  { label: 'Portfolio intelligence', appearAt: 2700, doneAt: 3300 },
];

const TOTAL_DURATION_MS = 4400;
const PARTICLE_COUNT = 22;

function DiagnosticLine({ label, appearAt, doneAt }: Step) {
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), appearAt);
    const t2 = setTimeout(() => setDone(true), doneAt);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [appearAt, doneAt]);

  if (!visible) return <div className="h-5" />;

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35 }}
      className="flex h-5 items-center gap-2 font-mono text-[11px] text-atlas-text-secondary"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${done ? 'bg-atlas-emerald' : 'animate-pulse bg-atlas-accent-bright'}`} />
      <span>{label}</span>
      <span className={`ml-auto ${done ? 'text-atlas-emerald' : 'text-atlas-text-tertiary'}`}>{done ? 'online' : '...'}</span>
    </motion.div>
  );
}

/**
 * The "highest priority" login intro from the design brief: a 4-6s boot
 * sequence (skippable) that plays once per page load before the actual
 * sign-in form is revealed. Purely decorative — it never touches
 * app/login/actions.ts, never calls anything, and the diagnostic lines
 * ("Robinhood connection", "AI systems"...) are cosmetic labels, not real
 * health checks (see /connections for the real ones).
 */
export default function BootSequence({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [skipVisible, setSkipVisible] = useState(false);

  useEffect(() => {
    const start = Date.now();
    let frame: number;
    const tick = () => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(100, (elapsed / TOTAL_DURATION_MS) * 100));
      if (elapsed < TOTAL_DURATION_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const skipTimer = setTimeout(() => setSkipVisible(true), 500);
    const doneTimer = setTimeout(onComplete, TOTAL_DURATION_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(skipTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => i);

  return (
    <motion.div
      key="boot"
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-atlas-canvas"
    >
      <div className="pointer-events-none absolute inset-0 bg-atlas-radial" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map((i) => {
          const left = (i * 37) % 100;
          const size = 1 + (i % 3);
          const delay = (i % 8) * 0.4;
          const duration = 6 + (i % 5);
          const driftX = ((i % 7) - 3) * 14;
          return (
            <span
              key={i}
              className="absolute animate-drift rounded-full bg-atlas-accent-bright/40"
              style={
                {
                  left: `${left}%`,
                  bottom: '-10px',
                  width: size,
                  height: size,
                  animationDelay: `${delay}s`,
                  animationDuration: `${duration}s`,
                  '--drift-x': `${driftX}px`,
                  '--drift-y': `-${320 + (i % 4) * 60}px`,
                } as React.CSSProperties
              }
            />
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex h-16 w-16 animate-glow-pulse items-center justify-center rounded-2xl bg-atlas-accent text-2xl font-bold text-white shadow-glow-accent"
      >
        A
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="mt-5 text-sm uppercase tracking-[0.3em] text-atlas-text-secondary"
      >
        Atlas
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="mt-1 text-xs text-atlas-text-tertiary"
      >
        Initializing Atlas&hellip;
      </motion.p>

      <div className="relative mt-8 w-64 space-y-1.5">
        {STEPS.map((s) => (
          <DiagnosticLine key={s.label} {...s} />
        ))}
      </div>

      <div className="relative mt-6 h-[2px] w-64 overflow-hidden rounded-full bg-atlas-border">
        <motion.div
          className="h-full bg-gradient-to-r from-atlas-accent to-atlas-cyan"
          style={{ width: `${progress}%` }}
        />
      </div>

      <AnimatePresence>
        {skipVisible && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onComplete}
            className="relative mt-10 text-xs text-atlas-text-tertiary underline decoration-dotted transition-colors hover:text-atlas-text-secondary"
          >
            Skip Animation
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
