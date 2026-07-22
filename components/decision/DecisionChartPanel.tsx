'use client';

import { useState } from 'react';
import SymbolChart from '@/components/chart/SymbolChart';
import TimeframeControl, { getLastTimeframe } from '@/components/chart/TimeframeControl';
import type { ChartMarker, ChartPriceBand } from '@/components/chart/types';
import type { Interval } from '@/lib/marketdata/types';

/**
 * The Decision Workspace's full analytical chart — a client island so
 * changing the timeframe reloads candles/overlays without a page
 * navigation (the brief: "avoid unnecessary full-page navigation"). The
 * server page computes `priceBands`/`markers` once from the Decision's
 * own structured evidence (components/chart/buildAnnotations.ts) and
 * passes them down; only the candle data itself is refetched per
 * timeframe change, via SymbolChart's own effect.
 */
export default function DecisionChartPanel({ symbol, defaultInterval, priceBands, markers }: { symbol: string; defaultInterval: Interval; priceBands: ChartPriceBand[]; markers: ChartMarker[] }) {
  const [interval, setInterval] = useState<Interval>(() => getLastTimeframe(defaultInterval));

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <TimeframeControl value={interval} onChange={setInterval} />
      </div>
      <SymbolChart symbol={symbol} interval={interval} priceBands={priceBands} markers={markers} live />
      {(priceBands.length > 0 || markers.length > 0) && (
        <div className="mt-2 space-y-1 text-xs text-atlas-text-tertiary">
          {priceBands.map((band) => (
            <p key={band.id}>
              <span className="font-medium text-atlas-text-secondary">{band.label}:</span> {band.explanation}
            </p>
          ))}
          {markers.map((marker) => (
            <p key={marker.id}>
              <span className="font-medium text-atlas-text-secondary">{marker.label}:</span> {marker.explanation}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
