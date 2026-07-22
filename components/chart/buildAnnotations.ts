import type { DemandZone, EntryOpportunityArea, LiquidityEvidence } from '@/lib/strategy/types';
import type { ChartMarker, ChartPriceBand } from './types';

/**
 * Translates already-computed structured evidence (a Decision's demand
 * zones/liquidity events, an EntryOpportunity's entry area) into chart
 * overlay descriptors. This is the ONLY place that conversion happens —
 * per the brief, the chart component itself never infers an overlay from
 * raw candles; it only renders what these functions hand it. Every
 * consumer (Decision Workspace, Entry Opportunity detail, Atlas Chat's
 * chart context) builds overlays through these two functions, so a
 * demand zone drawn on the chart always matches the same zone described
 * in the Decision's "Show why" reasoning.
 */
export function buildPriceBands(input: {
  demandZones: DemandZone[];
  potentialEntryArea?: EntryOpportunityArea | null;
  distanceToEntryPct?: number | null;
  symbol: string;
}): ChartPriceBand[] {
  const bands: ChartPriceBand[] = [];

  const nearestZone = input.demandZones[0];
  if (nearestZone) {
    bands.push({
      id: `demand-zone-${nearestZone.formedAt.getTime()}`,
      label: 'Demand zone',
      low: nearestZone.priceLevel,
      high: nearestZone.priceHigh,
      tone: nearestZone.recentlyRetested ? 'positive' : 'info',
      explanation: nearestZone.description,
    });
  }

  if (input.potentialEntryArea) {
    bands.push({
      id: 'potential-entry-area',
      label: 'Potential entry area',
      low: input.potentialEntryArea.low,
      high: input.potentialEntryArea.high,
      tone: 'warning',
      explanation: `Atlas's suggested entry range for ${input.symbol}, framed from the demand zone above rather than a single exact price — distance to entry: ${
        input.distanceToEntryPct !== null && input.distanceToEntryPct !== undefined ? `${input.distanceToEntryPct.toFixed(1)}%` : 'unavailable'
      }.`,
    });
  }

  return bands;
}

export function buildMarkers(input: { liquidityEvidence: LiquidityEvidence | null | undefined }): ChartMarker[] {
  const sweep = input.liquidityEvidence?.events[0];
  if (!sweep) return [];

  return [
    {
      id: `liquidity-sweep-${sweep.sweepCandleTime.getTime()}`,
      time: sweep.sweepCandleTime,
      label: sweep.direction === 'sell_side' ? 'Sweep (low)' : 'Sweep (high)',
      tone: sweep.direction === 'sell_side' ? 'positive' : 'negative',
      position: sweep.direction === 'sell_side' ? 'belowBar' : 'aboveBar',
      explanation: sweep.description,
    },
  ];
}
