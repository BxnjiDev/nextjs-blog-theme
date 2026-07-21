'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import AtlasCore, { type AtlasCoreState } from '@/components/atlas-identity/AtlasCore';
import type { InitializationSummary, ReadinessState } from '@/lib/domain/initializationStatus';

const READINESS_PILL: Record<ReadinessState, { label: string; className: string }> = {
  ready: { label: 'Ready', className: 'bg-atlas-emerald/10 text-atlas-emerald' },
  degraded: { label: 'Degraded', className: 'bg-atlas-warning/10 text-atlas-warning' },
  stale: { label: 'Stale', className: 'bg-atlas-warning/10 text-atlas-warning' },
  not_configured: { label: 'Not configured', className: 'bg-atlas-surface-raised text-atlas-text-tertiary' },
  unavailable: { label: 'Unavailable', className: 'bg-atlas-warning/10 text-atlas-warning' },
};

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
  awakening: 1000,
  readiness: 1900,
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

  useEffect(() => {
    if (reduceMotion) return; // reduced-motion renders one static screen with a manual Continue action instead
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
      const t = setTimeout(onComplete, 500);
      return () => clearTimeout(t);
    }
  }, [stage, onComplete]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onComplete();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onComplete]);

  if (reduceMotion) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-y-auto bg-atlas-canvas atlas-grid-texture px-6 py-12">
        <div className="pointer-events-none absolute inset-0 bg-atlas-radial" />
        <div className="relative w-full max-w-md space-y-6">
          <div className="flex flex-col items-center text-center">
            <AtlasCore state="ready" size="lg" />
            <p className="mt-4 text-xs font-medium uppercase tracking-[0.3em] text-atlas-text-secondary">Atlas</p>
            <p className="mt-1 text-sm text-atlas-text-tertiary">Private Intelligence System</p>
          </div>
          <ul className="space-y-1.5 rounded-xl border border-atlas-border-subtle bg-atlas-surface/60 p-4">
            {summary.lines.map((line) => (
              <li key={line.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-atlas-text-secondary">{line.label}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${READINESS_PILL[line.state].className}`}>
                  {READINESS_PILL[line.state].label}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-center text-sm leading-relaxed text-atlas-text-secondary">{summary.narrative}</p>
          <button
            type="button"
            onClick={onComplete}
            className="w-full rounded-lg bg-atlas-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-atlas-accent-bright"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-atlas-canvas atlas-grid-texture"
      exit={{ opacity: 0, scale: 1.03, filter: 'blur(8px)' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute inset-0 bg-atlas-radial" />

      <AtlasCore state={CORE_STATE_BY_STAGE[stage]} size="xl" />

      <AnimatePresence mode="wait">
        {stage === 'authorization' && (
          <motion.div key="auth" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative mt-6 space-y-1.5 text-center">
            <p className="text-sm text-atlas-text-secondary">Identity confirmed.</p>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="text-xs text-atlas-text-tertiary">
              Secure session established.
            </motion.p>
          </motion.div>
        )}

        {stage === 'awakening' && (
          <motion.div key="awaken" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative mt-6 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.35em] text-atlas-text">Atlas</p>
            <p className="mt-1.5 text-sm text-atlas-text-tertiary">Private Intelligence System</p>
          </motion.div>
        )}

        {stage === 'readiness' && (
          <motion.div key="readiness" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative mt-8 w-full max-w-sm px-6">
            <div className="space-y-1.5">
              {summary.lines.map((line, i) => (
                <motion.div
                  key={line.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.14, duration: 0.3 }}
                  className="flex items-center justify-between gap-3 font-mono text-[11px]"
                >
                  <span className="text-atlas-text-secondary">{line.label}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${READINESS_PILL[line.state].className}`}>
                    {READINESS_PILL[line.state].label}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {stage === 'statement' && (
          <motion.div key="statement" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative mt-6 max-w-md px-6 text-center">
            <p className="text-sm leading-relaxed text-atlas-text-secondary">{summary.narrative}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={onComplete}
        className="absolute bottom-10 text-xs text-atlas-text-tertiary underline decoration-dotted transition-colors hover:text-atlas-text-secondary"
      >
        Skip
      </button>
    </motion.div>
  );
}
