import type { Candle, Interval } from '@/lib/marketdata/types';
import { LIQUIDITY_CLASSIFICATION_LABEL, type LiquidityEvidence, type LiquiditySweepClassification, type LiquiditySweepEvent } from './types';

/**
 * Deterministic liquidity-sweep detection from real OHLCV candles — a
 * swing high/low that a later candle traded through (wicked beyond),
 * classified by whether and how convincingly price reclaimed the level.
 * Now possible because this app has real intrabar high/low via
 * lib/marketdata (see lib/domain/candles.ts); previously (daily
 * close+volume only) this was honestly always unavailable.
 *
 * This remains explicitly a price-structure inference: Atlas has no
 * order-flow, resting-liquidity, or institutional-positioning data
 * source, and every description below says so. Classification is
 * deliberately conservative — only `confirmed_sweep_reclaim` implies the
 * reclaim held with follow-through; everything else stays hedged
 * ("potential," "awaiting confirmation"). Per the brief, this is one
 * optional DecisionFactor among many (lib/decision/engine.ts) — it never
 * independently triggers a recommendation.
 */

const MIN_CANDLES = 30;
const SWING_WINDOW = 3;
const SWEEP_SEARCH_WINDOW = 10;
const RECLAIM_LOOKAHEAD = 3;
const FOLLOWTHROUGH_LOOKAHEAD = 3;
const VOLUME_LOOKBACK = 10;
const VOLUME_CONFIRMATION_MULTIPLE = 1.2;

interface SwingPoint {
  idx: number;
  price: number;
}

function ascendingByTime(candles: Candle[]): Candle[] {
  return [...candles].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

function findSwingPoints(candles: Candle[], window: number): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];
  for (let i = window; i < candles.length - window; i++) {
    const windowSlice = candles.slice(i - window, i + window + 1);
    if (candles[i].high === Math.max(...windowSlice.map((c) => c.high))) highs.push({ idx: i, price: candles[i].high });
    if (candles[i].low === Math.min(...windowSlice.map((c) => c.low))) lows.push({ idx: i, price: candles[i].low });
  }
  return { highs, lows };
}

function describeSweep(event: Omit<LiquiditySweepEvent, 'description'>): string {
  const directionLabel = event.direction === 'sell_side' ? 'sell-side sweep of a prior swing low' : 'buy-side sweep of a prior swing high';
  return (
    `${LIQUIDITY_CLASSIFICATION_LABEL[event.classification]}: ${directionLabel} near $${event.sweptLevel.toFixed(2)} on the ${event.timeframe} timeframe ` +
    `(wick-to-body ratio ${event.wickToBodyRatio.toFixed(1)}, ${event.volumeConfirmed ? 'elevated' : 'no elevated'} volume, ` +
    `${event.followThroughConfirmed ? 'follow-through confirmed' : 'follow-through not yet confirmed'}). ` +
    `This is a price-structure inference from OHLC candles only — Atlas has no order-flow or resting-liquidity data and does not claim ` +
    `knowledge of institutional positioning.`
  );
}

function buildSweepEvent(asc: Candle[], sweepIdx: number, sweptLevel: number, direction: 'buy_side' | 'sell_side', timeframe: Interval): LiquiditySweepEvent {
  const candle = asc[sweepIdx];
  const bodyHigh = Math.max(candle.open, candle.close);
  const bodyLow = Math.min(candle.open, candle.close);
  const body = Math.max(bodyHigh - bodyLow, 0.0001);
  const wick = direction === 'sell_side' ? bodyLow - candle.low : candle.high - bodyHigh;
  const wickToBodyRatio = Math.max(0, wick) / body;

  const volumeLookback = asc.slice(Math.max(0, sweepIdx - VOLUME_LOOKBACK), sweepIdx);
  const avgVolume = average(volumeLookback.map((c) => c.volume)) || 1;
  const volumeConfirmed = candle.volume > avgVolume * VOLUME_CONFIRMATION_MULTIPLE;

  const reclaimWindow = asc.slice(sweepIdx, Math.min(asc.length, sweepIdx + 1 + RECLAIM_LOOKAHEAD));
  const reclaimOffset = reclaimWindow.findIndex((c) => (direction === 'sell_side' ? c.close > sweptLevel : c.close < sweptLevel));
  const reclaimed = reclaimOffset !== -1;
  const reclaimIdx = reclaimed ? sweepIdx + reclaimOffset : null;

  let followThroughConfirmed = false;
  let reclaimFailed = false;
  if (reclaimed && reclaimIdx !== null) {
    const followCandles = asc.slice(reclaimIdx + 1, Math.min(asc.length, reclaimIdx + 1 + FOLLOWTHROUGH_LOOKAHEAD));
    if (followCandles.length > 0) {
      followThroughConfirmed = direction === 'sell_side' ? followCandles.every((c) => c.close >= sweptLevel) : followCandles.every((c) => c.close <= sweptLevel);
      reclaimFailed = direction === 'sell_side' ? followCandles.some((c) => c.close < sweptLevel) : followCandles.some((c) => c.close > sweptLevel);
    }
  }

  let classification: LiquiditySweepClassification;
  if (!reclaimed) {
    classification = sweepIdx >= asc.length - 2 ? 'potential_sweep' : 'failed_sweep';
  } else if (reclaimFailed) {
    classification = 'failed_sweep';
  } else if (followThroughConfirmed) {
    classification = 'confirmed_sweep_reclaim';
  } else {
    classification = 'awaiting_confirmation';
  }

  const eventWithoutDescription: Omit<LiquiditySweepEvent, 'description'> = {
    classification,
    direction,
    sweptLevel,
    sweepCandleTime: candle.timestamp,
    timeframe,
    wickToBodyRatio,
    volumeConfirmed,
    followThroughConfirmed,
  };

  return { ...eventWithoutDescription, description: describeSweep(eventWithoutDescription) };
}

/**
 * Scans the most recent SWEEP_SEARCH_WINDOW candles for one that traded
 * through the nearest prior swing high/low, and returns the most recent
 * qualifying event (if any). Only one event is returned — this app
 * surfaces the single most relevant/current sweep candidate rather than
 * an exhaustive history, matching how lib/decision/engine.ts consumes it
 * (one optional factor, not a list to reconcile).
 */
export function detectLiquidityEvidence(candles: Candle[], timeframe?: Interval): LiquidityEvidence {
  const asc = ascendingByTime(candles);
  if (asc.length < MIN_CANDLES) {
    return { available: false, events: [], note: `Not enough OHLC history to assess liquidity sweeps (need ${MIN_CANDLES}+ candles).` };
  }
  const resolvedTimeframe = timeframe ?? asc[0].interval;
  const { highs, lows } = findSwingPoints(asc, SWING_WINDOW);

  const searchStart = Math.max(SWING_WINDOW, asc.length - SWEEP_SEARCH_WINDOW);
  let latestEvent: LiquiditySweepEvent | null = null;

  for (let i = searchStart; i < asc.length; i++) {
    const candle = asc[i];
    const priorLow = [...lows].reverse().find((l) => l.idx < i);
    if (priorLow && candle.low < priorLow.price) {
      latestEvent = buildSweepEvent(asc, i, priorLow.price, 'sell_side', resolvedTimeframe);
    }
    const priorHigh = [...highs].reverse().find((h) => h.idx < i);
    if (priorHigh && candle.high > priorHigh.price) {
      latestEvent = buildSweepEvent(asc, i, priorHigh.price, 'buy_side', resolvedTimeframe);
    }
  }

  if (!latestEvent) {
    return { available: true, events: [], note: 'No swing-high/swing-low liquidity sweep detected in the recent price structure.' };
  }
  return { available: true, events: [latestEvent], note: 'Price-structure inference from OHLC candles only — not order-flow or resting-liquidity data.' };
}
