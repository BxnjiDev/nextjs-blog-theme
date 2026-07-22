'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type UTCTimestamp,
  type CandlestickData,
  type HistogramData,
  type IPriceLine,
  type Time,
} from 'lightweight-charts';
import { RotateCcw, Loader2 } from 'lucide-react';
import type { Interval, FreshnessStatus, CandleResponse } from '@/lib/marketdata/types';
import { INTERVAL_LABEL } from '@/lib/marketdata/types';
import ChartStatusBadge from './ChartStatusBadge';
import type { ChartMarker, ChartPriceBand } from './types';
import { ICON_SIZE, ICON_STROKE } from '@/lib/ui/iconSize';

/** Atlas's dark palette, mirrored here rather than read from CSS custom
 * properties — lightweight-charts renders to canvas, so its colors must
 * be plain values, not Tailwind classes. Kept in one place so a future
 * light theme only means adding the other branch here, never touching
 * the charting logic itself. */
const DARK_THEME = {
  background: 'transparent',
  text: '#8a86a3',
  grid: '#1c1a22',
  border: '#2a2733',
  upColor: '#16a34a',
  downColor: '#dc2626',
  crosshair: '#8b5cf6',
  volumeUp: 'rgba(22, 163, 74, 0.5)',
  volumeDown: 'rgba(220, 38, 38, 0.5)',
};
const LIGHT_THEME = {
  background: 'transparent',
  text: '#57534e',
  grid: '#e7e5e4',
  border: '#d6d3d1',
  upColor: '#15803d',
  downColor: '#b91c1c',
  crosshair: '#7c3aed',
  volumeUp: 'rgba(21, 128, 61, 0.4)',
  volumeDown: 'rgba(185, 28, 28, 0.4)',
};

const TONE_HEX: Record<string, string> = {
  positive: '#16a34a',
  warning: '#d97706',
  negative: '#dc2626',
  neutral: '#87828f',
  muted: '#8a86a3',
  info: '#87828f',
};

function toUtcTimestamp(date: Date): UTCTimestamp {
  return Math.floor(date.getTime() / 1000) as UTCTimestamp;
}

interface SymbolChartProps {
  symbol: string;
  interval: Interval;
  priceBands?: ChartPriceBand[];
  markers?: ChartMarker[];
  height?: number;
  theme?: 'dark' | 'light';
  /** Opens a live SSE connection for this symbol's quote updates — only
   * ever true for a single open symbol workspace, never a list of cards
   * (see the brief's cost-control section: streaming is reserved for open
   * workspaces/held positions/qualified opportunities, not every row). */
  live?: boolean;
}

/**
 * The full analytical chart for a symbol-specific workspace (Decision
 * Workspace, Entry Opportunity detail). Candlesticks + volume, crosshair,
 * price/time scale, zoom/pan, and "load more history" all come from
 * lightweight-charts directly; every overlay (demand zones, entry areas,
 * liquidity-sweep markers) is rendered from `priceBands`/`markers` props
 * built by components/chart/buildAnnotations.ts from Atlas's own
 * structured evidence — this component never infers an overlay itself.
 */
export default function SymbolChart({ symbol, interval, priceBands = [], markers = [], height = 420, theme = 'dark', live = false }: SymbolChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const [limit, setLimit] = useState(0); // 0 = provider/server default
  const [candleResponse, setCandleResponse] = useState<CandleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAtLiveEdge, setIsAtLiveEdge] = useState(true);
  const [streamFreshness, setStreamFreshness] = useState<FreshnessStatus | null>(null);

  const colors = theme === 'dark' ? DARK_THEME : LIGHT_THEME;

  // --- Fetch candles whenever symbol/interval/limit changes ---
  useEffect(() => {
    let cancelled = false;
    setLoading(limit === 0);
    setError(null);
    const params = new URLSearchParams({ symbol, interval });
    if (limit > 0) params.set('limit', String(limit));

    fetch(`/api/marketdata/candles?${params.toString()}`)
      .then((res) => res.json())
      .then((data: CandleResponse & { error?: string }) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
        } else {
          setCandleResponse(data);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load chart data.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setLoadingMore(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, interval, limit]);

  // Reset accumulated "load more" state whenever the caller changes symbol/interval.
  useEffect(() => {
    setLimit(0);
  }, [symbol, interval]);

  // --- Create chart once per container mount ---
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      height,
      layout: { background: { color: colors.background }, textColor: colors.text, attributionLogo: false },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border, timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: colors.crosshair, width: 1 }, horzLine: { color: colors.crosshair, width: 1 } },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: colors.upColor,
      downColor: colors.downColor,
      borderVisible: false,
      wickUpColor: colors.upColor,
      wickDownColor: colors.downColor,
    });
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.28 } });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

    markersPluginRef.current = createSeriesMarkers(candleSeries, []);

    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      const logicalRange = chart.timeScale().getVisibleLogicalRange();
      if (!logicalRange) return;
      // "At the live edge" when the visible range's right edge is within
      // ~2 bars of the most recent data point.
      const barsInfo = candleSeries.barsInLogicalRange(logicalRange);
      setIsAtLiveEdge(!barsInfo || barsInfo.barsAfter <= 2);
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      priceLinesRef.current = [];
      markersPluginRef.current = null;
    };
    // Deliberately only re-created on theme/height change, not on every
    // candle refresh — setData below updates the existing series instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, height]);

  // --- Push fetched candles into the series ---
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries || !candleResponse) return;

    const candleData: CandlestickData[] = candleResponse.candles.map((c) => ({
      time: toUtcTimestamp(new Date(c.timestamp)),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const volumeData: HistogramData[] = candleResponse.candles.map((c) => ({
      time: toUtcTimestamp(new Date(c.timestamp)),
      value: c.volume,
      color: c.close >= c.open ? colors.volumeUp : colors.volumeDown,
    }));

    candleSeries.setData(candleData);
    volumeSeries.setData(volumeData);

    // Re-draw price-band lines (demand zones / entry area) — cheap enough
    // to just clear and rebuild on every candle refresh.
    priceLinesRef.current.forEach((line) => candleSeries.removePriceLine(line));
    priceLinesRef.current = priceBands.flatMap((band) => [
      candleSeries.createPriceLine({ price: band.low, color: TONE_HEX[band.tone] ?? colors.text, lineWidth: 1, lineStyle: 2, title: `${band.label} low` }),
      candleSeries.createPriceLine({ price: band.high, color: TONE_HEX[band.tone] ?? colors.text, lineWidth: 1, lineStyle: 2, title: `${band.label} high` }),
    ]);

    markersPluginRef.current?.setMarkers(
      markers.map((m) => ({
        time: toUtcTimestamp(m.time),
        position: m.position,
        color: TONE_HEX[m.tone] ?? colors.text,
        shape: m.position === 'aboveBar' ? 'arrowDown' : 'arrowUp',
        text: m.label,
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candleResponse, priceBands, markers]);

  // --- Live quote updates via SSE, mutating only the active candle ---
  useEffect(() => {
    if (!live) return;
    const source = new EventSource(`/api/stream/market?symbols=${encodeURIComponent(symbol)}`);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'quote' && payload.quote && candleSeriesRef.current && candleResponse) {
          setStreamFreshness(payload.quote.freshness);
          const candles = candleResponse.candles;
          const last = candles[candles.length - 1];
          if (!last?.isActive) return;
          const updated: CandlestickData = {
            time: toUtcTimestamp(new Date(last.timestamp)),
            open: last.open,
            high: Math.max(last.high, payload.quote.price),
            low: Math.min(last.low, payload.quote.price),
            close: payload.quote.price,
          };
          candleSeriesRef.current.update(updated);
        }
        if (payload.type === 'stream-status' && payload.status === 'stale') {
          setStreamFreshness('stale');
        }
      } catch {
        // Ignore malformed/heartbeat events.
      }
    };
    source.onerror = () => setStreamFreshness('stale');
    return () => source.close();
  }, [live, symbol, candleResponse]);

  const handleLoadMore = useCallback(() => {
    setLoadingMore(true);
    setLimit((prev) => (prev > 0 ? prev + 120 : (candleResponse?.candles.length ?? 120) + 120));
  }, [candleResponse]);

  const handleReturnToLive = useCallback(() => {
    chartRef.current?.timeScale().scrollToRealTime();
  }, []);

  const effectiveFreshness = streamFreshness ?? candleResponse?.freshness ?? 'unavailable';

  return (
    <div className="transition-opacity duration-300 motion-reduce:transition-none">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-atlas-text">{symbol}</span>
          <span className="text-xs text-atlas-text-tertiary">{INTERVAL_LABEL[interval]}</span>
        </div>
        <div className="flex items-center gap-2">
          <ChartStatusBadge freshness={effectiveFreshness} asOf={candleResponse?.asOf ? new Date(candleResponse.asOf) : null} />
          {!isAtLiveEdge && (
            <button
              type="button"
              onClick={handleReturnToLive}
              className="atlas-press flex items-center gap-1 rounded-lg border border-atlas-border-subtle bg-atlas-surface-raised px-2 py-1 text-xs text-atlas-text-secondary hover:text-atlas-text"
            >
              <RotateCcw size={ICON_SIZE.sm} strokeWidth={ICON_STROKE} aria-hidden="true" />
              Return to live
            </button>
          )}
        </div>
      </div>

      <div className="relative rounded-lg border border-atlas-border-subtle bg-atlas-surface-raised/40 p-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-atlas-surface/60" style={{ height }}>
            <Loader2 size={ICON_SIZE.lg} strokeWidth={ICON_STROKE} className="animate-spin text-atlas-text-tertiary" aria-hidden="true" />
          </div>
        )}
        {error ? (
          <div className="flex items-center justify-center text-sm text-atlas-text-tertiary" style={{ height }}>
            {error}
          </div>
        ) : (
          <div ref={containerRef} style={{ height }} aria-hidden="true" />
        )}
        {/* Screen-reader summary — the canvas chart above is not itself
            keyboard/screen-reader operable (a known, documented limitation
            of canvas-based financial charting libraries); this text
            summary is the accessible equivalent of what the chart shows. */}
        <p className="sr-only">
          {candleResponse && candleResponse.candles.length > 0
            ? (() => {
                const last = candleResponse.candles[candleResponse.candles.length - 1];
                return `${symbol} ${INTERVAL_LABEL[interval]} chart. Latest close ${last.close.toFixed(2)}, ${effectiveFreshness} data as of ${new Date(candleResponse.asOf).toLocaleString()}.`;
              })()
            : `${symbol} chart data unavailable.`}
        </p>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loadingMore || loading}
          className="atlas-press text-xs text-atlas-text-tertiary underline decoration-atlas-border hover:text-atlas-text-secondary disabled:opacity-50"
        >
          {loadingMore ? 'Loading more history…' : 'Load more history'}
        </button>
        {candleResponse?.note && <p className="text-xs text-atlas-text-tertiary">{candleResponse.note}</p>}
      </div>
    </div>
  );
}
