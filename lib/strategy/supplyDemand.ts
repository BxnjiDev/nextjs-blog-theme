import type { HistoricalPricePoint } from '@/lib/integrations';
import type { DemandZone } from './types';

/**
 * Identifies potential institutional demand areas as the brief describes
 * ("strong impulsive moves away from an area," "high-probability demand
 * retests") using only what this app actually has: daily close prices.
 * This is explicitly a proxy — a real supply/demand read would use
 * intrabar range and volume-at-price, neither of which this app ingests
 * (see lib/strategy/liquidity.ts for the same limitation on liquidity
 * sweeps). A zone here is a local low in the closing-price series
 * followed by a sustained move away from it — never returned as a
 * standalone signal; lib/decision/engine.ts only ever uses this to add
 * confidence alongside other independent evidence, exactly as the brief
 * requires ("demand zones should never be treated as automatic buy
 * signals").
 */

const MIN_SESSIONS = 30;
const LOOKFORWARD_SESSIONS = 10;
const IMPULSE_THRESHOLD_PCT = 8;
const RETEST_BAND_PCT = 3;
const MAX_ZONES = 3;

function ascendingByDate(history: HistoricalPricePoint[]): HistoricalPricePoint[] {
  return [...history].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function identifyDemandZones(history: HistoricalPricePoint[]): DemandZone[] {
  const asc = ascendingByDate(history);
  if (asc.length < MIN_SESSIONS) return [];

  const closes = asc.map((p) => p.close);
  const zones: DemandZone[] = [];

  for (let i = 2; i < closes.length - 2; i++) {
    const window = closes.slice(i - 2, i + 3);
    const center = closes[i];
    const isSwingLow = center === Math.min(...window);
    if (!isSwingLow) continue;

    const forwardEnd = Math.min(closes.length, i + 1 + LOOKFORWARD_SESSIONS);
    if (forwardEnd <= i + 1) continue;
    const forwardMax = Math.max(...closes.slice(i + 1, forwardEnd));
    const impulseMovePct = center > 0 ? ((forwardMax - center) / center) * 100 : 0;
    if (impulseMovePct < IMPULSE_THRESHOLD_PCT) continue;

    zones.push({
      priceLevel: center,
      formedAt: asc[i].date,
      impulseMovePct,
      recentlyRetested: false, // filled in below, once we know the latest close
    });
  }

  const latestClose = closes[closes.length - 1];
  const withRetestFlag = zones.map((z) => ({
    ...z,
    recentlyRetested: latestClose >= z.priceLevel && ((latestClose - z.priceLevel) / z.priceLevel) * 100 <= RETEST_BAND_PCT,
  }));

  return withRetestFlag.sort((a, b) => b.formedAt.getTime() - a.formedAt.getTime()).slice(0, MAX_ZONES);
}
