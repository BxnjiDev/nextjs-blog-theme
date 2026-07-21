'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import AtlasInitialization from './AtlasInitialization';
import type { InitializationSummary } from '@/lib/domain/initializationStatus';

/** The only sessionStorage key this app writes, and the only thing it's
 * used for: "has the initialization animation already played in this
 * browser session." It never holds a credential, token, or portfolio
 * data — clearing it (Lock Atlas does this) only means the animation
 * will play again next time; it has no bearing on authentication, which
 * middleware.ts verifies server-side on every request regardless of this
 * flag's value. */
export const ATLAS_INIT_SESSION_KEY = 'atlas-initialized';

/**
 * Decides, purely client-side, whether the initialization sequence needs
 * to play — and only fetches its data (GET /api/atlas/init) when it does,
 * so a normal page navigation within an already-initialized session costs
 * nothing extra. If the fetch fails for any reason, fails open: the
 * sequence is skipped rather than blocking access to the app.
 */
export default function InitializationGate({ children }: { children: React.ReactNode }) {
  const [summary, setSummary] = useState<InitializationSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      if (sessionStorage.getItem(ATLAS_INIT_SESSION_KEY) === '1') return;
    } catch {
      return; // sessionStorage unavailable (privacy mode, etc.) — fail open, never show the sequence
    }
    fetch('/api/atlas/init')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: InitializationSummary | null) => {
        if (!cancelled && data) setSummary(data);
      })
      .catch(() => {
        // Network hiccup — fail open, don't block the app on a decorative sequence.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleComplete() {
    try {
      sessionStorage.setItem(ATLAS_INIT_SESSION_KEY, '1');
    } catch {
      // Non-fatal — worst case the sequence plays again next navigation.
    }
    setSummary(null);
  }

  return (
    <>
      {children}
      <AnimatePresence>{summary && <AtlasInitialization summary={summary} onComplete={handleComplete} />}</AnimatePresence>
    </>
  );
}
