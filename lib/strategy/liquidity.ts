import type { LiquidityEvidence } from './types';

/**
 * Higher-timeframe liquidity-sweep analysis (sweeps, rejections after
 * liquidity grabs, sweep-and-reclaim structures) fundamentally requires
 * intrabar high/low data — a sweep is defined by a wick piercing a prior
 * high/low and closing back inside it. This app's only price history
 * source (lib/integrations' HistoricalPricePoint) carries daily close +
 * volume, no open/high/low, so there is no honest way to detect a sweep
 * today. Per the brief — "gracefully reduce confidence when technical
 * information is unavailable... never fabricate technical signals" —
 * this returns a clearly-labeled unavailable reading rather than
 * approximating a sweep from data too coarse to support one (unlike
 * lib/strategy/supplyDemand.ts's demand zones, which close-price data
 * CAN reasonably approximate).
 *
 * Future readiness: once an intraday/OHLC provider is added (see the
 * brief's "additional signal providers" list — options flow, insider
 * transactions, etc. follow the same pattern), replace this function's
 * body with real sweep detection. Every caller already treats this as
 * one optional DecisionFactor among many (lib/decision/engine.ts), so
 * making it real requires no changes anywhere else in the architecture.
 */
export function detectLiquidityEvidence(): LiquidityEvidence {
  return {
    available: false,
    note: 'Liquidity sweep detection requires intraday high/low or order-flow data this app does not currently ingest.',
  };
}
