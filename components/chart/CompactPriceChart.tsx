'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, AreaSeries, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import type { Interval, CandleResponse } from '@/lib/marketdata/types';

const UP_COLOR = '#16a34a';
const DOWN_COLOR = '#dc2626';

/**
 * A compact sparkline preview — for list/card contexts (Entry Opportunity
 * cards, watchlist rows, Recommendations, Holdings) where a full
 * candlestick+volume chart would overwhelm the row. Per the brief: "do
 * not force a large chart onto every card or list item." No axes, no
 * crosshair, no interactivity — just a close-price area line colored by
 * net direction over the fetched window, fetched through the same
 * /api/marketdata/candles endpoint as the full chart.
 */
export default function CompactPriceChart({ symbol, interval = '1D', height = 48 }: { symbol: string; interval?: Interval; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [data, setData] = useState<CandleResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/marketdata/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=60`)
      .then((res) => res.json())
      .then((response: CandleResponse & { error?: string }) => {
        if (!cancelled && !response.error) setData(response);
      })
      .catch(() => {
        /* Compact preview silently shows nothing on failure — the full chart in the workspace surfaces the real error. */
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

  useEffect(() => {
    if (!containerRef.current || !data || data.candles.length === 0) return;

    const first = data.candles[0].close;
    const last = data.candles[data.candles.length - 1].close;
    const color = last >= first ? UP_COLOR : DOWN_COLOR;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      height,
      layout: { background: { color: 'transparent' }, textColor: 'transparent', attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      crosshair: { vertLine: { visible: false, labelVisible: false }, horzLine: { visible: false, labelVisible: false } },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: `${color}33`,
      bottomColor: `${color}00`,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    series.setData(data.candles.map((c) => ({ time: Math.floor(new Date(c.timestamp).getTime() / 1000) as UTCTimestamp, value: c.close })));
    chart.timeScale().fitContent();

    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, height]);

  if (!data || data.candles.length === 0) {
    return <div style={{ height }} className="rounded bg-atlas-surface-raised/40" aria-hidden="true" />;
  }

  return <div ref={containerRef} style={{ height }} role="img" aria-label={`${symbol} recent price trend`} />;
}
