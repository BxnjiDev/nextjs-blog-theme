import { getCandlesForSymbol } from './candles';
import { identifyDemandZones } from '@/lib/strategy/supplyDemand';
import { detectLiquidityEvidence } from '@/lib/strategy/liquidity';
import { DEFAULT_LOOKBACK, type Interval } from '@/lib/marketdata/types';
import type { DemandZone, LiquidityEvidence } from '@/lib/strategy/types';

export interface SymbolChartContext {
  symbol: string;
  interval: Interval;
  latestPrice: number | null;
  freshness: string;
  asOf: Date;
  candleCount: number;
  /** % change from the first to the last candle in the fetched window —
   * not a fixed calendar period, since the window length is interval-
   * dependent (see DEFAULT_LOOKBACK). */
  periodChangePct: number | null;
  demandZones: DemandZone[];
  liquidityEvidence: LiquidityEvidence;
  note?: string;
}

/**
 * The one place Atlas Chat's chart-related tools read from — reuses the
 * exact same candle service, demand-zone detector, and liquidity-sweep
 * detector the chart component and Decision Engine already call. Chat
 * never independently computes a technical conclusion from raw candles;
 * it only asks for the same structured evidence every other surface
 * shows, for whichever timeframe the user asked about.
 */
export async function getSymbolChartContext(rawSymbol: string, interval: Interval = '1D'): Promise<SymbolChartContext> {
  const symbol = rawSymbol.toUpperCase();
  const response = await getCandlesForSymbol(symbol, interval, { limit: DEFAULT_LOOKBACK[interval] });
  const candles = response.candles;

  const first = candles[0];
  const last = candles[candles.length - 1];
  const periodChangePct = first && last && first.close > 0 ? ((last.close - first.close) / first.close) * 100 : null;

  return {
    symbol,
    interval,
    latestPrice: last?.close ?? null,
    freshness: response.freshness,
    asOf: response.asOf,
    candleCount: candles.length,
    periodChangePct,
    demandZones: identifyDemandZones(candles, interval),
    liquidityEvidence: detectLiquidityEvidence(candles, interval),
    note: response.note,
  };
}
