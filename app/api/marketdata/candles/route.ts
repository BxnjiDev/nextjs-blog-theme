import { NextRequest, NextResponse } from 'next/server';
import { getCandlesForSymbol } from '@/lib/domain/candles';
import { isInterval } from '@/lib/marketdata/types';

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 1000;

/**
 * The only client-facing candle endpoint — every chart component fetches
 * through this route, never through a provider directly, so the market-
 * data API key never reaches the browser. Gated by the same session-
 * cookie middleware as every other page/route in the app (not in
 * middleware.ts's exclusion list). Reads through the shared historical
 * candle service (lib/domain/candles.ts) — the exact same cache/freshness
 * path the Decision Engine, monitoring job, and Atlas Chat tools use, so
 * a chart can never disagree with what those surfaces say about the same
 * candles.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');
  const intervalParam = searchParams.get('interval') ?? '1D';
  const limitParam = searchParams.get('limit');

  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }
  if (!isInterval(intervalParam)) {
    return NextResponse.json({ error: `Invalid interval "${intervalParam}".` }, { status: 400 });
  }

  const limit = limitParam ? Math.min(MAX_LIMIT, Math.max(1, parseInt(limitParam, 10))) : undefined;

  try {
    const response = await getCandlesForSymbol(symbol, intervalParam, { limit });
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load candle data.' }, { status: 500 });
  }
}
