import type { Tone } from '@/lib/theme/tone';
import type { Candle, Interval } from '@/lib/marketdata/types';
import { candlesToHistoricalPricePoints } from '@/lib/marketdata/types';
import { computeTechnicalEvidence } from './technical';
import { identifyDemandZones } from './supplyDemand';
import { detectLiquidityEvidence } from './liquidity';
import {
  DEFAULT_TIMEFRAME_ROLES,
  type MultiTimeframeContext,
  type TimeframeConflict,
  type TimeframeRoles,
  type TimeframeTechnicalSnapshot,
} from './types';

/**
 * Highest-to-lowest timeframe order — every ordering/conflict computation
 * below walks this list rather than assuming a fixed pair, so adding a
 * sixth interval later (see lib/marketdata/types.ts's INTERVALS) only
 * means adding it here once.
 */
const TIMEFRAME_ORDER: Interval[] = ['1W', '1D', '4h', '1h', '30m'];

/** Higher timeframes get more weight in the composite tone — a bearish
 * weekly should not be washed out by three neutral intraday readings. */
const TIMEFRAME_WEIGHT: Record<Interval, number> = { '1W': 3, '1D': 2, '4h': 1.5, '1h': 1, '30m': 0.5 };

const TONE_SCORE: Record<Tone, number> = { positive: 1, negative: -1, neutral: 0, muted: 0, info: 0, warning: 0 };

function buildConflictDescription(c: Omit<TimeframeConflict, 'description'>): string {
  return (
    `${c.higherTimeframe} structure reads ${c.higherTone} while ${c.lowerTimeframe} reads ${c.lowerTone} — ` +
    `a ${c.lowerTimeframe} signal does not override ${c.higherTimeframe} structure; this conflict lowers confidence rather than being ignored.`
  );
}

/**
 * Computes technical evidence, demand zones, and liquidity-sweep evidence
 * independently for every timeframe the caller has candles for, then
 * identifies any higher-vs-lower timeframe tone conflicts and a weighted
 * composite tone. Every sub-computation reuses the exact same
 * lib/strategy functions the single-timeframe Decision Engine path already
 * calls — this never independently recomputes a technical conclusion.
 */
export function buildMultiTimeframeContext(
  candlesByTimeframe: Partial<Record<Interval, Candle[]>>,
  benchmarkCandles: Candle[],
  roles: TimeframeRoles = DEFAULT_TIMEFRAME_ROLES
): MultiTimeframeContext {
  const benchmarkHistory = candlesToHistoricalPricePoints(benchmarkCandles);
  const snapshots: TimeframeTechnicalSnapshot[] = [];

  for (const timeframe of TIMEFRAME_ORDER) {
    const candles = candlesByTimeframe[timeframe];
    if (!candles || candles.length === 0) continue;
    const history = candlesToHistoricalPricePoints(candles);
    snapshots.push({
      timeframe,
      evidence: computeTechnicalEvidence(history, benchmarkHistory),
      demandZones: identifyDemandZones(candles, timeframe),
      liquidityEvidence: detectLiquidityEvidence(candles, timeframe),
    });
  }

  const conflicts: TimeframeConflict[] = [];
  for (let hi = 0; hi < snapshots.length; hi++) {
    for (let lo = hi + 1; lo < snapshots.length; lo++) {
      const higher = snapshots[hi];
      const lower = snapshots[lo];
      if (!higher.evidence.available || !lower.evidence.available) continue;
      const opposed =
        (higher.evidence.overallTone === 'positive' && lower.evidence.overallTone === 'negative') ||
        (higher.evidence.overallTone === 'negative' && lower.evidence.overallTone === 'positive');
      if (!opposed) continue;
      const withoutDescription: Omit<TimeframeConflict, 'description'> = {
        higherTimeframe: higher.timeframe,
        lowerTimeframe: lower.timeframe,
        higherTone: higher.evidence.overallTone,
        lowerTone: lower.evidence.overallTone,
      };
      conflicts.push({ ...withoutDescription, description: buildConflictDescription(withoutDescription) });
    }
  }

  const availableSnapshots = snapshots.filter((s) => s.evidence.available);
  let overallTone: Tone = 'neutral';
  if (availableSnapshots.length > 0) {
    const weightedScore = availableSnapshots.reduce((sum, s) => sum + TONE_SCORE[s.evidence.overallTone] * TIMEFRAME_WEIGHT[s.timeframe], 0);
    overallTone = weightedScore > 0.5 ? 'positive' : weightedScore < -0.5 ? 'negative' : 'neutral';
  }

  return { snapshots, roles, conflicts, hasConflict: conflicts.length > 0, overallTone };
}
