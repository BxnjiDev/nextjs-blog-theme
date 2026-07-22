import type { Tone } from '@/lib/theme/tone';

/**
 * Chart overlay types every SymbolChart/CompactPriceChart consumer builds
 * from — deliberately NOT computed inside the chart component itself (the
 * brief: "do not infer technical overlays only inside the chart
 * component"). See components/chart/buildAnnotations.ts, which is the one
 * place a Decision/EntryOpportunity's already-computed structured evidence
 * (DemandZone, LiquiditySweepEvent, entry area) is translated into these
 * shapes — the chart only renders what it's given.
 */

export interface ChartPriceBand {
  id: string;
  label: string;
  low: number;
  high: number;
  tone: Tone;
  /** What Atlas detected / which timeframe / when / why it matters /
   * confidence / data limitations, pre-composed into one explanation the
   * chart can show on hover or in a legend — never re-derived by the
   * chart itself. */
  explanation: string;
}

export interface ChartMarker {
  id: string;
  time: Date;
  label: string;
  tone: Tone;
  position: 'aboveBar' | 'belowBar';
  explanation: string;
}
