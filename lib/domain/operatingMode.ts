/**
 * Explicit operating modes (Phase 3.7). `development` is the default —
 * mock/heuristic providers are expected and fine, nothing is gated.
 * `live-evaluation` is for running against the real $500 Robinhood
 * evaluation account: recommendations must not silently use mock market
 * data, mock fundamentals, or mock ownership data (see
 * lib/domain/dataQualityGate.ts, which reads this mode). SEC EDGAR is
 * always real either way (no mock exists for it), and empty news is
 * always acceptable (clearly labeled), in both modes.
 */
export type OperatingMode = 'development' | 'live-evaluation';

const VALID_MODES: OperatingMode[] = ['development', 'live-evaluation'];

/** Reads ATLAS_MODE fresh on every call (not cached at module load) so a
 * single process — notably the test suite — can exercise both modes. */
export function getOperatingMode(): OperatingMode {
  const raw = process.env.ATLAS_MODE?.trim().toLowerCase();
  return (VALID_MODES as string[]).includes(raw ?? '') ? (raw as OperatingMode) : 'development';
}

export function isLiveEvaluationMode(): boolean {
  return getOperatingMode() === 'live-evaluation';
}
