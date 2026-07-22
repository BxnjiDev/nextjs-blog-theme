import { getCandlesForSymbol } from './candles';
import { buildMultiTimeframeContext } from '@/lib/strategy/multiTimeframe';
import { INTERVALS, DEFAULT_LOOKBACK, type Candle, type Interval } from '@/lib/marketdata/types';
import type { MultiTimeframeContext } from '@/lib/strategy/types';

/**
 * Fetches candles for every supported timeframe (1W/1D/4h/1h/30m) plus a
 * daily SPY benchmark, then builds the cross-timeframe technical context
 * (lib/strategy/multiTimeframe.ts). This costs six candle fetches — cheap
 * for the one symbol a user has open in a workspace (the candle service's
 * own cache absorbs repeat calls), but deliberately NOT something
 * lib/domain/decision.ts's getDecisionForSymbol calls on every invocation
 * (see its own docs) — only call this from a surface that actually shows
 * multi-timeframe structure: the Decision Workspace, an Entry Opportunity
 * detail view, or an Atlas Chat tool that was asked about timeframes.
 */
export async function getMultiTimeframeContextForSymbol(rawSymbol: string): Promise<MultiTimeframeContext> {
  const symbol = rawSymbol.toUpperCase();

  const [candleResponses, benchmarkResponse] = await Promise.all([
    Promise.all(INTERVALS.map((interval) => getCandlesForSymbol(symbol, interval, { limit: DEFAULT_LOOKBACK[interval] }))),
    getCandlesForSymbol('SPY', '1D', { limit: DEFAULT_LOOKBACK['1D'] }),
  ]);

  const candlesByTimeframe: Partial<Record<Interval, Candle[]>> = {};
  INTERVALS.forEach((interval, i) => {
    candlesByTimeframe[interval] = candleResponses[i].candles;
  });

  return buildMultiTimeframeContext(candlesByTimeframe, benchmarkResponse.candles);
}
