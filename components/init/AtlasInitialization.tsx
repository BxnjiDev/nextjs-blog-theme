'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import AtlasCore, { type AtlasCoreState } from '@/components/atlas-identity/AtlasCore';
import OrbitalField from '@/components/atlas-identity/OrbitalField';
import type { InitializationSummary, ReadinessState } from '@/lib/domain/initializationStatus';
import { MOTION } from '@/lib/motion/tokens';

const READINESS_PILL: Record<ReadinessState, { label: string; className: string }> = {
  ready: { label: 'Ready', className: 'bg-atlas-emerald/10 text-atlas-emerald' },
  degraded: { label: 'Degraded', className: 'bg-atlas-warning/10 text-atlas-warning' },
  stale: { label: 'Stale', className: 'bg-atlas-warning/10 text-atlas-warning' },
  not_configured: { label: 'Not configured', className: 'bg-atlas-surface-raised text-atlas-text-tertiary' },
  unavailable: { label: 'Unavailable', className: 'bg-atlas-warning/10 text-atlas-warning' },
};

// The domain summary computes 7 lines (see lib/domain/initializationStatus.ts)
// so the composed narrative sentence can draw on all of them — but showing
// all 7 in a bordered checklist is exactly the "diagnostic status page"
// feeling the brief asks to remove. Visually we surface only the handful a
// person actually orients around; the rest still inform the Stage 4
// sentence even though they never render as a pill here.
const FEATURED_LABELS = ['Portfolio memory', 'Risk intelligence', 'Market-data provider', 'Robinhood synchronization'];

type Stage = 'authorization' | 'awakening' | 'readiness' | 'statement' | 'complete';

const CORE_STATE_BY_STAGE: Record<Stage, AtlasCoreState> = {
  authorization: 'verifying',
  awakening: 'initializing',
  readiness: 'initializing',
  statement: 'ready',
  complete: 'ready',
};

const STAGE_TIMING_MS: Record<Exclude<Stage, 'complete'>, number> = {
  authorization: 1000,
  awakening: 1100,
  readiness: 1800,
  statement: 1300,
};

/**
 * Plays once per authenticated browser session (gated by
 * components/init/InitializationGate.tsx, which owns the sessionStorage
 * flag) — never during ordinary navigation, refresh, or background
 * activity. Purely a presentation sequence over data the server already
 * computed (lib/domain/initializationStatus.ts): no fetch happens here,
 * so there is nothing to block on and nothing that can be "wrong" beyond
 * what that already-honest summary says.
 *
 * Visual language: Atlas awakening and assembling around the user — a
 * glowing core, orbital geometry resolving, floating status signals, one
 * composed statement, then an outward expansion into Home. No bordered
 * checklist panel, no full-width "Continue" button; it enters
 * automatically when it's done.
 */
export default function AtlasInitialization({
  summary,
  onComplete,
}: {
  summary: InitializationSummary;
  onComplete: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState<Stage>('authorization');
  const featured = summary.lines.filter((l) => FEATURED_LABELS.includes(l.label));

  useEffect(() => {
    if (reduceMotion) return; // reduced-motion renders one static screen and auto-advances instead
    if (stage === 'complete') return;
    const order: Stage[] = ['authorization', 'awakening', 'readiness', 'statement', 'complete'];
    const idx = order.indexOf(stage);
    const next = order[idx + 1];
    const delay = STAGE_TIMING_MS[stage as Exclude<Stage, 'complete'>];
    const timer = setTimeout(() => setStage(next), delay);
    return () => clearTimeout(timer);
  }, [stage, reduceMotion]);

  useEffect(() => {
    if (stage === 'complete') {
      const t = setTimeout(onComplete, 550);
      return () => clearTimeout(t);
    }
  }, [stage, onComplete]);

  useEffect(() => {
    if (!reduceMotion) return;
    const t = setTimeout(onComplete, 900); // within the brief's 0.5-1.25s reduced-motion window
    return () => clearTimeout(t);
  }, [reduceMotion, onComplete]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onComplete();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onComplete]);

  if (reduceMotion) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-y-auto bg-atlas-canvas px-6 py-12"
        role="status"
        aria-live="polite"
      >
        <div className="pointer-events-none absolute inset-0 bg-atlas-aurora" />
        <div className="relative w-full max-w-sm space-y-5 text-center">
          <AtlasCore state="ready" size="lg" className="mx-auto" />
          <p className="text-sm leading-relaxed text-atlas-text-secondary">{summary.narrative}</p>
          <button
            type="button"
            onClick={onComplete}
            className="text-xs text-atlas-text-tertiary underline decoration-dotted transition-colors hover:text-atlas-accent-bright"
          >
            Enter now
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-atlas-canvas"
      animate={stage === 'complete' ? { opacity: 0 } : { opacity: 1 }}
      transition={{ duration: MOTION.duration.stage, ease: MOTION.ease.standard }}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute inset-0 bg-atlas-aurora" />

      <motion.div
        className="relative flex flex-col items-center"
        animate={stage === 'complete' ? { scale: 1.4, opacity: 0 } : { scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: MOTION.ease.standard }}
      >
        <div className="relative flex items-center justify-center">
          <OrbitalField
            size={stage === 'authorization' ? 220 : 320}
            variant={stage === 'awakening' ? 'resolving' : 'ambient'}
            className="absolute"
          />
          <AtlasCore state={CORE_STATE_BY_STAGE[stage]} size="xl" />
        </div>

        <AnimatePresence mode="wait">
          {stage === 'authorization' && (
            <motion.div key="auth" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative mt-8 space-y-1.5 text-center">
              <p className="text-sm text-atlas-text-secondary">Identity confirmed.</p>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="text-xs text-atlas-text-tertiary">
                Session authorized.
              </motion.p>
            </motion.div>
          )}

          {stage === 'awakening' && (
            <motion.div key="awaken" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative mt-8 text-center">
              <p className="text-xs font-medium uppercase tracking-[0.35em] text-atlas-text">Atlas</p>
              <p className="mt-1.5 text-sm text-atlas-text-tertiary">Private Intelligence System</p>
            </motion.div>
          )}

          {stage === 'readiness' && (
            <motion.div key="readiness" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative mt-8 flex max-w-md flex-wrap items-center justify-center gap-2 px-6">
              {featured.map((line, i) => (
                <motion.div
                  key={line.label}
                  initial={{ opacity: 0, y: 10, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.15, duration: MOTION.duration.stage, ease: MOTION.ease.standard }}
                  className="atlas-glass flex items-center gap-2 rounded-full px-3.5 py-1.5"
                >
                  <span className="text-[11px] text-atlas-text-secondary">{line.label}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${READINESS_PILL[line.state].className}`}>
                    {READINESS_PILL[line.state].label}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          )}

          {stage === 'statement' && (
            <motion.div key="statement" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative mt-8 max-w-md px-6 text-center">
              <p className="text-base leading-relaxed text-atlas-text">{summary.narrative}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <button
        type="button"
        onClick={onComplete}
        className="absolute bottom-8 text-xs text-atlas-text-tertiary underline decoration-dotted transition-colors hover:text-atlas-accent-bright"
      >
        Skip
      </button>
    </motion.div>
  );
}
